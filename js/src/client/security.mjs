import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { pathToFileURL } from 'node:url';
import { TaskState, CancelTaskRequest, GetTaskRequest } from '@a2a-js/sdk';
import { EXTENSION_URI, JSON_SCHEMA_DIALECT, parseCatalog } from 'a2a-schema-contract/core';
import { discoverContractClient } from 'a2a-schema-contract/client';
import { createContractResolver } from 'a2a-schema-contract/resolver';
import { createValidationSession } from 'a2a-schema-contract/operations';
import { withAgent, liveChildren } from '../../scripts/harness.mjs';

const id = 'urn:reference:invoice:1';
const invocation = {
  contractId: id,
  input: { representationId: 'json', value: { quantity: 2, unitPrice: 3, label: null } },
  acceptedOutputRepresentationIds: ['rich'],
};
const primary = (value) => ({
  data: value,
  mediaType: 'application/json',
  metadata: {
    [EXTENSION_URI]: {
      role: 'primary',
      contractId: id,
      direction: 'input',
      representationId: 'json',
    },
  },
});
const wire = (value = invocation.input.value) => ({
  message: { messageId: 'security-input', role: 'ROLE_USER', parts: [primary(value)] },
  metadata: {
    [EXTENSION_URI]: {
      contractId: id,
      inputRepresentationId: 'json',
      acceptedOutputRepresentationIds: ['rich'],
    },
  },
});
const evidence = async (url) =>
  (await fetch(url + '/evidence', { signal: AbortSignal.timeout(5000) })).json();
const raw = async (url, params, activated = true, method = 'SendMessage', version = '1.0') =>
  (
    await fetch(url + '/rpc', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'A2A-Version': version,
        ...(activated ? { 'A2A-Extensions': EXTENSION_URI } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'security', method, params }),
      signal: AbortSignal.timeout(5000),
    })
  ).json();
const close = (server) =>
  new Promise((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => (error ? reject(error) : resolve()));
  });
async function waitFor(read, predicate) {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Scenario state deadline exceeded');
}
export async function runSecurity() {
  const scenarios = [];
  async function check(name, requirements, work) {
    await work();
    scenarios.push({ id: name, requirements, outcome: 'PASS' });
  }
  await withAgent(async ({ url }) => {
    for (const [name, value] of [
      ['negative', { quantity: -1, unitPrice: 3, label: null }],
      ['coercion', { quantity: '2', unitPrice: 3, label: null }],
      ['missing', { quantity: 2 }],
      ['additional', { ...invocation.input.value, credential: 'secret-payload' }],
      ['root-null', null],
    ]) {
      await check('raw-input-' + name, ['D09-01', 'D09-03'], async () => {
        const before = await evidence(url);
        const result = await raw(url, wire(value));
        assert.equal(result.error?.code, name === 'root-null' ? -32005 : -32602);
        assert.equal((await evidence(url)).executions, before.executions);
        assert.ok(!JSON.stringify(result).includes('secret'));
      });
    }
    for (const [name, params, activated] of [
      ['missing-activation', wire(), false],
      [
        'unknown-contract',
        {
          ...wire(),
          metadata: {
            [EXTENSION_URI]: { contractId: 'urn:unknown:1', inputRepresentationId: 'json' },
          },
        },
        true,
      ],
      [
        'unknown-input',
        {
          ...wire(),
          message: {
            ...wire().message,
            parts: [
              {
                ...primary(invocation.input.value),
                metadata: {
                  [EXTENSION_URI]: {
                    ...primary(invocation.input.value).metadata[EXTENSION_URI],
                    representationId: 'absent',
                  },
                },
              },
            ],
          },
          metadata: { [EXTENSION_URI]: { contractId: id, inputRepresentationId: 'absent' } },
        },
        true,
      ],
      [
        'no-output-intersection',
        { ...wire(), configuration: { acceptedOutputModes: ['image/png'] } },
        true,
      ],
      [
        'wrong-metadata-scope',
        { ...wire(), message: { ...wire().message, metadata: wire().metadata } },
        true,
      ],
      [
        'duplicate-primary',
        {
          ...wire(),
          message: {
            ...wire().message,
            parts: [primary(invocation.input.value), primary(invocation.input.value)],
          },
        },
        true,
      ],
    ])
      await check(name, ['D07-01', 'D07-02', 'D07-06'], async () => {
        const before = await evidence(url);
        const result = await raw(url, params, activated);
        const expected =
          name === 'missing-activation'
            ? -32008
            : name === 'unknown-input' || name === 'no-output-intersection'
              ? -32005
              : -32602;
        assert.equal(result.error?.code, expected);
        assert.equal((await evidence(url)).executions, before.executions);
      });
    await check('domain-contract-version-mismatch', ['D07-01', 'D07-02'], async () => {
      const before = await evidence(url);
      const params = wire();
      params.metadata[EXTENSION_URI].contractId = 'urn:reference:invoice:2';
      params.message.parts[0].metadata[EXTENSION_URI].contractId = 'urn:reference:invoice:2';
      assert.equal((await raw(url, params)).error?.code, -32602);
      assert.equal((await evidence(url)).executions, before.executions);
    });
    await check('unsupported-a2a-protocol-version', ['D07-01'], async () => {
      const before = await evidence(url);
      assert.equal((await raw(url, wire(), true, 'SendMessage', '1.1')).error?.code, -32009);
      assert.equal((await evidence(url)).executions, before.executions);
    });
    await check('deep-payload-budget', ['D09-01', 'D14-01'], async () => {
      const before = await evidence(url);
      let value = null;
      for (let i = 0; i < 40; i++) value = { child: value };
      assert.equal((await raw(url, wire(value))).error?.code, -32602);
      assert.equal((await evidence(url)).executions, before.executions);
    });
    for (const [name, body, status] of [
      ['oversized-http-body', JSON.stringify({ secret: 'secret-payload'.repeat(22000) }), 413],
      ['malformed-http-body', '{"secret":"secret-payload"', 400],
    ]) {
      await check(name, ['D14-01'], async () => {
        const before = await evidence(url);
        const response = await fetch(url + '/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        assert.equal(response.status, status);
        const failure = await response.json();
        assert.deepEqual(failure, { error: 'Request body rejected.' });
        assert.equal((await evidence(url)).executions, before.executions);
      });
    }
    const client = await discoverContractClient(url);
    try {
      for (const fault of ['invalid', 'throw', 'bad-echo', 'late-event', 'stream-invalid']) {
        await check('output-' + fault, ['D10-01', 'D12-01'], async () => {
          const events = [];
          for await (const event of client.stream(
            { ...invocation, metadata: { fault } },
            { signal: AbortSignal.timeout(5000) },
          ))
            events.push(event);
          assert.equal(events.at(-1).kind, 'result');
          assert.equal(events.at(-1).result.response.status.state, TaskState.TASK_STATE_FAILED);
          assert.deepEqual(events.at(-1).result.response.artifacts, []);
          assert.ok(
            events.every(
              (event) =>
                event.kind !== 'companion' || event.event.payload.$case !== 'artifactUpdate',
            ),
          );
          assert.ok(!JSON.stringify(events).includes('secret'));
        });
      }
      await check('concurrent-request-isolation', ['D09-01', 'D10-01'], async () => {
        const before = await evidence(url);
        const [good, bad] = await Promise.all([
          client.invoke(invocation),
          raw(url, wire({ quantity: -1, unitPrice: 3, label: null })),
        ]);
        assert.deepEqual(good.payload.value, { total: 6, label: null });
        assert.equal(bad.error?.code, -32602);
        assert.equal((await evidence(url)).executions, before.executions + 1);
      });
      await check('explicit-cancel-discards-late-output', ['D12-01'], async () => {
        const before = await evidence(url);
        const iterator = client.stream(
          { ...invocation, metadata: { fault: 'wait' } },
          { signal: AbortSignal.timeout(5000) },
        );
        const first = await iterator.next();
        assert.equal(first.value.kind, 'companion');
        const taskId = first.value.event.payload.value.id;
        const canceled = await client.client.cancelTask(CancelTaskRequest.fromJSON({ id: taskId }));
        assert.equal(canceled.status.state, TaskState.TASK_STATE_CANCELED);
        const rest = [];
        for await (const event of iterator) rest.push(event);
        assert.equal(rest.at(-1).result.response.status.state, TaskState.TASK_STATE_CANCELED);
        assert.deepEqual(rest.at(-1).result.response.artifacts, []);
        assert.equal((await evidence(url)).executions, before.executions + 1);
      });
      await check('disconnect-cleanup', ['D12-01'], async () => {
        const iterator = client.stream({ ...invocation, metadata: { fault: 'wait' } });
        const first = await iterator.next();
        const taskId = first.value.event.payload.value.id;
        await iterator.return();
        const final = await waitFor(
          () => client.client.getTask(GetTaskRequest.fromJSON({ id: taskId })),
          (task) => task.status.state === TaskState.TASK_STATE_FAILED,
        );
        assert.deepEqual(final.artifacts, []);
      });
      await check('diagnostic-redaction', ['D14-01'], async () => {
        const facts = (await evidence(url)).diagnostics;
        assert.ok(
          facts.some((event) => event.operation === 'negotiation' && event.outcome === 'rejected'),
        );
        assert.ok(
          facts.every((event) =>
            Object.keys(event).every((key) =>
              ['operation', 'correlationId', 'durationMs', 'outcome', 'code'].includes(key),
            ),
          ),
        );
        assert.ok(!JSON.stringify(facts).includes('secret'));
      });
      const card = await client.client.getAgentCard();
      let mode;
      const peer = httpServer(async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.url === '/.well-known/agent-card.json') {
          res.end(JSON.stringify(card));
          return;
        }
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const request = JSON.parse(Buffer.concat(chunks));
        const part = {
          data: mode === 'schema' ? { total: -1, label: null } : { total: 6, label: null },
          mediaType: 'application/json',
          metadata: {
            [EXTENSION_URI]: {
              role: 'primary',
              contractId: id,
              direction: 'output',
              representationId: 'rich',
            },
          },
        };
        const response = {
          messageId: 'peer',
          contextId: 'peer',
          role: 'ROLE_AGENT',
          parts:
            mode === 'missing-primary'
              ? [{ text: 'companion' }]
              : mode === 'duplicate-primary'
                ? [part, part]
                : mode === 'root-null'
                  ? [{ data: null }]
                  : [part],
          ...(mode === 'missing-echo'
            ? {}
            : {
                metadata: {
                  [EXTENSION_URI]: {
                    contractId: mode === 'wrong-echo' ? 'urn:wrong:1' : id,
                    outputRepresentationId: 'rich',
                  },
                },
              }),
        };
        res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { message: response } }));
      });
      peer.listen(0, '127.0.0.1');
      await once(peer, 'listening');
      const peerUrl = `http://127.0.0.1:${peer.address().port}`;
      card.supportedInterfaces[0].url = peerUrl + '/rpc';
      try {
        const dishonest = await discoverContractClient(peerUrl);
        try {
          for (mode of [
            'schema',
            'missing-echo',
            'wrong-echo',
            'missing-primary',
            'duplicate-primary',
            'root-null',
          ])
            await check('peer-' + mode, ['D11-01'], () =>
              assert.rejects(dishonest.invoke(invocation)),
            );
        } finally {
          await dishonest.close();
        }
      } finally {
        await close(peer);
      }
    } finally {
      await client.close();
    }
  });
  await withAgent(
    async ({ url }) => {
      await check('execution-deadline', ['D12-01'], async () => {
        const client = await discoverContractClient(url);
        try {
          const result = await client.invoke({ ...invocation, metadata: { fault: 'wait' } });
          assert.equal(result.response.status.state, TaskState.TASK_STATE_FAILED);
          assert.deepEqual(result.response.artifacts, []);
        } finally {
          await client.close();
        }
      });
    },
    { env: { REFERENCE_DEADLINE_MS: '100' } },
  );
  await check('bounded-validation-and-physical-worker-cleanup', ['D09-02', 'D14-01'], async () => {
    const branch = {
      type: 'object',
      required: ['child'],
      properties: { child: { allOf: [{ $ref: '#/$defs/branch' }, { $ref: '#/$defs/branch' }] } },
    };
    const schema = {
      $defs: { branch: { anyOf: [{ type: 'null' }, branch] } },
      $ref: '#/$defs/branch',
    };
    const source = parseCatalog({
      contracts: [
        {
          id: 'urn:reference:hostile:1',
          input: {
            presence: 'required',
            representations: [
              {
                id: 'json',
                mediaType: 'application/json',
                schema: {
                  mediaType: 'application/schema+json',
                  dialect: JSON_SCHEMA_DIALECT,
                  inline: schema,
                },
              },
            ],
          },
          output: { presence: 'none' },
        },
      ],
    });
    const session = createValidationSession(source, { deadlineMs: 300 });
    let value = null;
    for (let i = 0; i < 25; i++) value = { child: value };
    try {
      await assert.rejects(
        session.run('validate', {
          contractId: 'urn:reference:hostile:1',
          direction: 'input',
          representationId: 'json',
          value,
        }),
        { code: 'VALIDATION_TIMEOUT' },
      );
      assert.equal(session.active, 0);
    } finally {
      await session.close();
    }
  });
  await withAgent(
    async ({ url }) => {
      await check('optional-extension-baseline', ['D07-01'], async () => {
        const result = await raw(
          url,
          { message: { messageId: 'baseline', role: 'ROLE_USER', parts: [{ text: 'hello' }] } },
          false,
        );
        assert.equal(result.result.message.parts[0].text, 'Baseline request complete.');
        assert.equal(result.result.message.metadata?.[EXTENSION_URI], undefined);
      });
    },
    { env: { REFERENCE_REQUIRED: '0' } },
  );
  const ca = await readFile(new URL('../../../fixtures/tls/cert.pem', import.meta.url));
  const key = await readFile(new URL('../../../fixtures/tls/key.pem', import.meta.url));
  const schemaBytes = Buffer.from(JSON.stringify({ type: 'integer', minimum: 0 }));
  let origin;
  let calls = 0;
  let externalCatalog;
  const tls = httpsServer({ key, cert: ca }, (req, res) => {
    calls++;
    if (req.url === '/catalog') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(externalCatalog));
      return;
    }
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: 'https://127.0.0.1/private' });
      res.end();
      return;
    }
    if (req.url === '/large') {
      res.writeHead(200, { 'Content-Type': 'application/schema+json' });
      res.end('x'.repeat(262145));
      return;
    }
    if (req.url === '/missing') {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/schema+json' });
    res.end(schemaBytes);
  });
  tls.listen(0, '127.0.0.1');
  await once(tls, 'listening');
  origin = `https://catalog.test:${tls.address().port}`;
  const policy = {
    ca,
    allowedOrigins: [origin],
    lookup: () => Promise.resolve([{ address: '127.0.0.1', family: 4 }]),
    allowAddress: (address, hostname) => address === '127.0.0.1' && hostname === 'catalog.test',
  };
  const source = (uri, integrity) => ({
    contracts: [
      {
        id: 'urn:reference:external:1',
        input: {
          presence: 'required',
          representations: [
            {
              id: 'json',
              mediaType: 'application/json',
              schema: {
                mediaType: 'application/schema+json',
                dialect: JSON_SCHEMA_DIALECT,
                uri,
                ...(integrity ? { integrity } : {}),
              },
            },
          ],
        },
        output: { presence: 'none' },
      },
    ],
  });
  externalCatalog = source(origin + '/schema', {
    algorithm: 'sha-256',
    value: createHash('sha256').update(schemaBytes).digest('base64'),
  });
  externalCatalog.contracts[0].id = 'urn:reference:external-echo:1';
  externalCatalog.contracts[0].output = structuredClone(externalCatalog.contracts[0].input);
  try {
    await withAgent(
      async ({ url }) => {
        await check(
          'external-agent-discovery-round-trip',
          ['D04-02', 'D08-03', 'D09-01', 'D11-01'],
          async () => {
            const discovered = await discoverContractClient(url, {
              resolver: createContractResolver(policy),
            });
            try {
              const response = await discovered.invoke({
                contractId: 'urn:reference:external-echo:1',
                input: { representationId: 'json', value: 2 },
              });
              assert.equal(response.payload.value, 2);
              const before = await evidence(url);
              const invalid = await raw(url, {
                message: {
                  messageId: 'external-invalid',
                  role: 'ROLE_USER',
                  parts: [
                    {
                      data: 'wrong',
                      mediaType: 'application/json',
                      metadata: {
                        [EXTENSION_URI]: {
                          role: 'primary',
                          contractId: 'urn:reference:external-echo:1',
                          direction: 'input',
                          representationId: 'json',
                        },
                      },
                    },
                  ],
                },
                metadata: {
                  [EXTENSION_URI]: {
                    contractId: 'urn:reference:external-echo:1',
                    inputRepresentationId: 'json',
                  },
                },
              });
              assert.equal(invalid.error.code, -32602);
              assert.equal((await evidence(url)).executions, before.executions);
            } finally {
              await discovered.close();
            }
          },
        );
      },
      {
        env: {
          REFERENCE_CATALOG_JSON: JSON.stringify(externalCatalog),
          REFERENCE_RESOLVER_ORIGIN: origin,
          REFERENCE_CATALOG_URI: origin + '/catalog',
        },
      },
    );
    await check('external-pinned-offline-validation-and-cache', ['D08-03', 'D13-01'], async () => {
      const resolver = createContractResolver(policy);
      const input = source(origin + '/schema', {
        algorithm: 'sha-256',
        value: createHash('sha256').update(schemaBytes).digest('base64'),
      });
      const before = calls;
      const prepared = await resolver.resolveCatalog(input);
      assert.equal(prepared.select('urn:reference:external:1', 'input', 'json').validate(2), 2);
      await resolver.resolveCatalog(input);
      assert.equal(calls, before + 1);
      resolver.clearCache();
      assert.deepEqual(resolver.cache, { entries: 0, bytes: 0 });
    });
    for (const [name, input, code] of [
      ['prohibited-address', source('https://127.0.0.1/schema'), 'RESOLUTION_POLICY'],
      ['redirect-private', source(origin + '/redirect'), 'RESOLUTION_POLICY'],
      [
        'integrity-mismatch',
        source(origin + '/schema', {
          algorithm: 'sha-256',
          value: Buffer.alloc(32).toString('base64'),
        }),
        'INTEGRITY_MISMATCH',
      ],
      ['unavailable', source(origin + '/missing'), 'SCHEMA_UNAVAILABLE'],
      ['response-budget', source(origin + '/large'), 'RESOURCE_LIMIT'],
    ])
      await check('external-' + name, ['D13-01', 'D13-02'], () =>
        assert.rejects(createContractResolver(policy).resolveCatalog(input), { code }),
      );
  } finally {
    await close(tls);
  }
  assert.equal(liveChildren.size, 0);
  const artifact = JSON.parse(
    await readFile(new URL('../../artifact-input.json', import.meta.url), 'utf8'),
  );
  const report = {
    result: 'PASS',
    profile: 'Node first release candidate',
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    artifact,
    scenarios,
    cleanup: {
      children: liveChildren.size,
      workers:
        'Every validation operation awaits worker termination; installed timeout scenario asserts active=0.',
    },
  };
  const target = new URL(
    `../../reports/security-node${process.versions.node.split('.')[0]}.json`,
    import.meta.url,
  );
  await mkdir(new URL('../../reports/', import.meta.url), { recursive: true });
  await writeFile(target, JSON.stringify(report, null, 2) + '\n');
  return report;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  console.log(JSON.stringify(await runSecurity()));
