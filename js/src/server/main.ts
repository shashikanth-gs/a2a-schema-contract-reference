import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import express, { type ErrorRequestHandler } from 'express';
import {
  AgentCard,
  Artifact,
  Message,
  Part,
  Task,
  TaskArtifactUpdateEvent,
  TaskStatusUpdateEvent,
} from '@a2a-js/sdk';
import { AgentEvent, InMemoryTaskStore, ServerCallContext } from '@a2a-js/sdk/server';
import { createContractResolver } from 'a2a-schema-contract/resolver';
import type { DiagnosticEvent } from 'a2a-schema-contract/operations';
import { agentCardHandler, jsonRpcHandler, UserBuilder } from '@a2a-js/sdk/server/express';
import { toJsonRpcError } from '@a2a-js/sdk/errors';
import { EXTENSION_URI, type JsonValue } from 'a2a-schema-contract/core';
import {
  createContractServer,
  outputArtifact,
  outputPart,
  type ExecutionContract,
} from 'a2a-schema-contract/server';

const diagnostics: DiagnosticEvent[] = [];
const evidenceEnabled = process.env.REFERENCE_EVIDENCE === '1';
const source: unknown =
  evidenceEnabled && process.env.REFERENCE_CATALOG_JSON
    ? JSON.parse(process.env.REFERENCE_CATALOG_JSON)
    : JSON.parse(
        await readFile(new URL('../../../fixtures/catalog.json', import.meta.url), 'utf8'),
      );
const fixtureOrigin = evidenceEnabled ? process.env.REFERENCE_RESOLVER_ORIGIN : undefined;
if (
  fixtureOrigin &&
  (new URL(fixtureOrigin).protocol !== 'https:' ||
    new URL(fixtureOrigin).hostname !== 'catalog.test')
)
  throw new Error('Invalid test resolver origin');
const catalog = fixtureOrigin
  ? await createContractResolver({
      allowedOrigins: [fixtureOrigin],
      ca: await readFile(new URL('../../../fixtures/tls/cert.pem', import.meta.url)),
      lookup: () => Promise.resolve([{ address: '127.0.0.1', family: 4 }]),
      allowAddress: (address, hostname) => address === '127.0.0.1' && hostname === 'catalog.test',
    }).resolveCatalog(source, { origin: 'local' })
  : source;
const evidence: {
  contractId: string;
  inputPresent: boolean;
  inputPartCount: number;
  outputRepresentationId?: string;
}[] = [];
function isObject(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
// Domain logic belongs here; representation/presence/schema decisions belong to the SDK.
function invoice(input: JsonValue): { total: number; label: JsonValue } {
  if (typeof input === 'string') return { total: input === '' ? 0 : Number(input), label: null };
  if (!isObject(input)) throw new Error('Expected invoice object');
  const quantity = input.quantity;
  const unitPrice = input.unitPrice;
  if (typeof quantity !== 'number' || typeof unitPrice !== 'number')
    throw new Error('Expected invoice numbers');
  return { total: quantity * unitPrice, label: input.label ?? null };
}
function business(execution: ExecutionContract): JsonValue {
  if (execution.invocation.contractId === 'urn:reference:invoice:1') {
    if (!execution.input.present) throw new Error('Expected input');
    const value = invoice(execution.input.value);
    switch (execution.output?.representation.id) {
      case 'text':
        return String(value.total);
      case 'compact':
        return { total: value.total };
      default:
        return value;
    }
  }
  if (execution.invocation.contractId.includes(':presence-'))
    return { inputPresent: execution.input.present };
  if (!execution.input.present) throw new Error('Expected echo input');
  return execution.input.value;
}
const adapter = createContractServer({
  card: AgentCard.fromJSON({
    name: 'Invoice and presence reference',
    description: 'Deterministic installed SDK consumer',
    version: '1.0',
    supportedInterfaces: [{ url: '', protocolBinding: 'JSONRPC', protocolVersion: '1.0' }],
    capabilities: { streaming: true },
    defaultInputModes: ['application/json', 'text/plain'],
    defaultOutputModes: ['application/json', 'text/plain'],
    skills: [],
  }),
  catalog,
  required: process.env.REFERENCE_REQUIRED !== '0',
  deadlineMs: Number(process.env.REFERENCE_DEADLINE_MS ?? '30000'),
  validation: {
    diagnostics: (event) => {
      if (evidenceEnabled) {
        if (diagnostics.length === 128) diagnostics.shift();
        diagnostics.push(event);
      }
    },
  },
  taskStore: new InMemoryTaskStore(),
  signal: (context) => context.state.get('disconnect') as AbortSignal | undefined,
  executor: {
    async execute(context, bus) {
      if (!context.context.activatedExtensions?.includes(EXTENSION_URI)) {
        bus.publish(
          AgentEvent.message(
            Message.fromJSON({
              messageId: 'baseline',
              contextId: context.contextId,
              role: 'ROLE_AGENT',
              parts: [{ text: 'Baseline request complete.' }],
            }),
          ),
        );
        return;
      }
      const execution = adapter.execution(context);
      if (evidence.length === 4096) evidence.shift();
      evidence.push({
        contractId: execution.invocation.contractId,
        inputPresent: execution.input.present,
        inputPartCount: context.userMessage.parts.length,
        ...(execution.output ? { outputRepresentationId: execution.output.representation.id } : {}),
      });
      execution.signal.throwIfAborted();
      const settings = context.request.metadata ?? {};
      if (evidenceEnabled && settings.fault === 'throw') throw new Error('secret-business-value');
      if (evidenceEnabled && settings.fault === 'wait') {
        bus.publish(
          AgentEvent.task(
            Task.fromJSON({
              id: context.taskId,
              contextId: context.contextId,
              status: { state: 'TASK_STATE_WORKING' },
            }),
          ),
        );
        await new Promise<void>((resolve) => {
          if (execution.signal.aborted) resolve();
          else execution.signal.addEventListener('abort', () => resolve(), { once: true });
        });
        return;
      }
      if (evidenceEnabled && typeof settings.fault === 'string') {
        const raw = {
          artifactId: 'result',
          parts: [
            {
              data: { total: 6, label: null as JsonValue },
              mediaType: 'application/json',
              metadata: {
                [EXTENSION_URI]: {
                  role: 'primary',
                  contractId: execution.invocation.contractId,
                  direction: 'output',
                  representationId: execution.output?.representation.id,
                },
              },
            },
          ],
        };
        if (settings.fault === 'invalid' || settings.fault === 'stream-invalid') {
          raw.parts[0]!.data = { total: -1, label: 'secret-payload' };
        }
        const result = Task.fromJSON({
          id: context.taskId,
          contextId: context.contextId,
          status: { state: 'TASK_STATE_COMPLETED' },
          artifacts: [raw],
        });
        if (settings.fault === 'bad-echo')
          result.metadata = {
            [EXTENSION_URI]: { contractId: 'urn:wrong:1', outputRepresentationId: 'json' },
          };
        if (settings.fault === 'stream-invalid') {
          bus.publish(
            AgentEvent.task(
              Task.fromJSON({
                id: context.taskId,
                contextId: context.contextId,
                status: { state: 'TASK_STATE_WORKING' },
              }),
            ),
          );
          bus.publish(
            AgentEvent.artifactUpdate(
              TaskArtifactUpdateEvent.fromJSON({
                taskId: context.taskId,
                contextId: context.contextId,
                artifact: raw,
                lastChunk: true,
              }),
            ),
          );
          bus.publish(
            AgentEvent.statusUpdate(
              TaskStatusUpdateEvent.fromJSON({
                taskId: context.taskId,
                contextId: context.contextId,
                status: { state: 'TASK_STATE_COMPLETED' },
              }),
            ),
          );
        } else {
          bus.publish(AgentEvent.task(result));
          if (settings.fault === 'late-event')
            bus.publish(
              AgentEvent.statusUpdate(
                TaskStatusUpdateEvent.fromJSON({
                  taskId: context.taskId,
                  contextId: context.contextId,
                  status: { state: 'TASK_STATE_COMPLETED' },
                }),
              ),
            );
        }
        return;
      }
      if (settings.prompt === true) {
        bus.publish(
          AgentEvent.task(
            Task.fromJSON({
              id: context.taskId,
              contextId: context.contextId,
              status: {
                state: 'TASK_STATE_INPUT_REQUIRED',
                message: {
                  messageId: 'confirmation',
                  role: 'ROLE_AGENT',
                  parts: [{ text: 'Confirm the invoice.' }],
                },
              },
            }),
          ),
        );
        return Promise.resolve();
      }
      const omit = !execution.output || settings.omit === true;
      const value = omit ? undefined : business(execution);
      if (settings.message === true && value !== undefined) {
        bus.publish(
          AgentEvent.message(
            Message.fromJSON({
              messageId: 'invoice-result',
              contextId: context.contextId,
              role: 'ROLE_AGENT',
              parts: [Part.toJSON(outputPart(execution, value))],
              metadata: {
                [EXTENSION_URI]: {
                  contractId: execution.invocation.contractId,
                  outputRepresentationId: execution.output?.representation.id,
                },
              },
            }),
          ),
        );
        return Promise.resolve();
      }
      const artifacts = value === undefined ? [] : [outputArtifact(execution, value)];
      if (settings.companions === true && artifacts[0]) {
        artifacts[0].parts.push(
          Part.fromJSON({ text: 'Invoice complete.', mediaType: 'text/plain' }),
        );
        artifacts.push(
          Artifact.fromJSON({
            artifactId: 'audit-companion',
            parts: [{ data: { audit: true }, mediaType: 'application/json' }],
          }),
        );
      }
      if (settings.stream === true) {
        bus.publish(
          AgentEvent.task(
            Task.fromJSON({
              id: context.taskId,
              contextId: context.contextId,
              status: { state: 'TASK_STATE_WORKING' },
            }),
          ),
        );
        bus.publish(
          AgentEvent.statusUpdate(
            TaskStatusUpdateEvent.fromJSON({
              taskId: context.taskId,
              contextId: context.contextId,
              status: {
                state: 'TASK_STATE_WORKING',
                message: {
                  messageId: 'progress',
                  role: 'ROLE_AGENT',
                  parts: [{ text: 'Calculating invoice.' }],
                },
              },
            }),
          ),
        );
        for (const artifact of artifacts)
          bus.publish(
            AgentEvent.artifactUpdate(
              TaskArtifactUpdateEvent.fromJSON({
                taskId: context.taskId,
                contextId: context.contextId,
                artifact: Artifact.toJSON(artifact),
                append: false,
                lastChunk: true,
              }),
            ),
          );
        bus.publish(
          AgentEvent.statusUpdate(
            TaskStatusUpdateEvent.fromJSON({
              taskId: context.taskId,
              contextId: context.contextId,
              status: { state: 'TASK_STATE_COMPLETED' },
            }),
          ),
        );
      } else {
        bus.publish(
          AgentEvent.task(
            Task.fromJSON({
              id: context.taskId,
              contextId: context.contextId,
              status: { state: 'TASK_STATE_COMPLETED' },
              artifacts: artifacts.map((a) => Artifact.toJSON(a)),
            }),
          ),
        );
      }
      return Promise.resolve();
    },
    cancelTask() {
      return Promise.resolve();
    },
  },
});
if (fixtureOrigin && process.env.REFERENCE_CATALOG_URI) {
  const extension = adapter.card.capabilities!.extensions.find(
    (extension) => extension.uri === EXTENSION_URI,
  )!;
  extension.params = {
    catalog: {
      uri: process.env.REFERENCE_CATALOG_URI,
      mediaType: 'application/json',
      integrity: {
        algorithm: 'sha-256',
        value: createHash('sha256').update(JSON.stringify(source)).digest('base64'),
      },
    },
  };
}
const app = express();
app.use(express.json({ limit: '256kb' }));
const rejectBody: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  void _next;
  const status =
    typeof error === 'object' && error !== null && 'status' in error && error.status === 413
      ? 413
      : 400;
  res.status(status).json({ error: 'Request body rejected.' });
};
app.use(rejectBody);
app.get('/health', (_req, res) => {
  res.json({ ready: true });
});
// Test-only, sanitized counters: no input values, credentials, or schema bodies.
if (evidenceEnabled)
  app.get('/evidence', (_req, res) => {
    res.json({ executions: evidence.length, calls: evidence, diagnostics });
  });
app.use('/.well-known/agent-card.json', agentCardHandler({ agentCardProvider: adapter.handler }));
app.use('/rpc', (req, res, next) => {
  try {
    adapter.guard(req.body);
    next();
  } catch (error) {
    res.json({
      jsonrpc: '2.0',
      id: (req.body as { id?: unknown } | undefined)?.id ?? null,
      error: toJsonRpcError(error),
    });
  }
});
app.use('/rpc', (req, res, next) => {
  const controller = new AbortController();
  res.once('close', () => controller.abort());
  return jsonRpcHandler({
    requestHandler: adapter.handler,
    userBuilder: UserBuilder.noAuthentication,
    contextBuilder: (options) =>
      new ServerCallContext({
        ...(options.extensions ? { requestedExtensions: options.extensions } : {}),
        ...(options.requestedVersion ? { requestedVersion: options.requestedVersion } : {}),
        ...(options.user ? { user: options.user } : {}),
        state: new Map<string, unknown>([
          ['disconnect', controller.signal],
          ['headers', options.headers],
        ]),
      }),
  })(req, res, next);
});
const port = Number(process.env.REFERENCE_PORT ?? '0');
if (!Number.isSafeInteger(port) || port < 0 || port > 65535)
  throw new Error('Invalid REFERENCE_PORT');
const host = process.env.REFERENCE_HOST ?? '127.0.0.1';
const server = app.listen(port, host);
await once(server, 'listening');
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Expected TCP address');
const url = `http://${host}:${address.port}`;
adapter.card.supportedInterfaces[0]!.url = url + '/rpc';
const ready = { type: 'ready', url };
if (process.send) process.send(ready);
else console.log(JSON.stringify(ready));
let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  const force = setTimeout(() => server.closeAllConnections(), 1000);
  const drained = new Promise<void>((resolve) => server.close(() => resolve()));
  await adapter.close();
  await drained;
  clearTimeout(force);
  process.disconnect?.();
}
process.on('SIGTERM', () => {
  void shutdown();
});
process.on('SIGINT', () => {
  void shutdown();
});
process.on('message', (message: unknown) => {
  if (message === 'shutdown') void shutdown();
});
process.on('disconnect', () => {
  void shutdown();
});
