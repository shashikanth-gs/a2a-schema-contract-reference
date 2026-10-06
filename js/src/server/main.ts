import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import express from 'express';
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
import { agentCardHandler, jsonRpcHandler, UserBuilder } from '@a2a-js/sdk/server/express';
import { toJsonRpcError } from '@a2a-js/sdk/errors';
import { EXTENSION_URI, type JsonValue } from '@shashikanth-gs/a2a-schema-contract/core';
import {
  createContractServer,
  outputArtifact,
  outputPart,
  type ExecutionContract,
} from '@shashikanth-gs/a2a-schema-contract/server';

const catalog: unknown = JSON.parse(
  await readFile(new URL('../../../fixtures/catalog.json', import.meta.url), 'utf8'),
);
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
  required: true,
  taskStore: new InMemoryTaskStore(),
  signal: (context) => context.state.get('disconnect') as AbortSignal | undefined,
  executor: {
    execute(context, bus) {
      const execution = adapter.execution(context);
      evidence.push({
        contractId: execution.invocation.contractId,
        inputPresent: execution.input.present,
        inputPartCount: context.userMessage.parts.length,
        ...(execution.output ? { outputRepresentationId: execution.output.representation.id } : {}),
      });
      execution.signal.throwIfAborted();
      const settings = context.request.metadata ?? {};
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
const app = express();
app.use(express.json({ limit: '256kb' }));
app.get('/health', (_req, res) => {
  res.json({ ready: true });
});
// Test-only, sanitized counters: no input values, credentials, or schema bodies.
app.get('/evidence', (_req, res) => {
  res.json({ executions: evidence.length, calls: evidence });
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
function shutdown(): void {
  if (closing) return;
  closing = true;
  server.closeAllConnections();
  server.close(() => {
    process.disconnect?.();
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('message', (message: unknown) => {
  if (message === 'shutdown') shutdown();
});
process.on('disconnect', shutdown);
