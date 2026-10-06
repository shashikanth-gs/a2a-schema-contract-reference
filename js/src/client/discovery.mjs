import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { TaskState } from '@a2a-js/sdk';
import { discoverContractClient } from 'a2a-schema-contract/client';
import { EXTENSION_URI } from 'a2a-schema-contract/core';
import { createContractResolver } from 'a2a-schema-contract/resolver';
import { withFlightAgent } from '../../scripts/flight-agent.mjs';
import { discoverFlights } from '../../dist/client/discover.js';

const id = 'urn:reference:flight-search:1';
export async function runDiscovery(external = false) {
  return withFlightAgent(async ({ url, resolverOptions, retrievals }) => {
    const resolver = resolverOptions ? createContractResolver(resolverOptions) : undefined;
    const client = await discoverContractClient(url, resolver ? { resolver } : {});
    try {
      const discovery = await client.describe();
      assert.deepEqual(
        discovery.skills.map((s) => s.contracts.length),
        [4, 2, 0],
      );
      assert.equal(discovery.unassociated.length, 1);
      assert.deepEqual(discovery.staleAssociations, [
        { contractId: 'urn:reference:flight-search:5', skillId: 'missing-skill' },
      ]);
      assert.equal(discovery.skills[0].contracts[3].input[0].supported, false);
      assert.equal(discovery.skills[0].contracts[3].input[0].diagnostic, 'UNSUPPORTED_MEDIA_TYPE');
      const schema = client.catalog.schema(id, 'input', 'json');
      assert.deepEqual(schema.documents[0].value.required, ['origin', 'destination']);
      const output = client.catalog.schema(id, 'output', 'json');
      assert.equal(output.documents.length, external ? 2 : 1);
      assert.equal(Object.isFrozen(output.documents[0].value), true);
      assert.equal(
        client.catalog.schema('urn:reference:flight-search:2', 'input', 'text'),
        undefined,
      );
      if (external) {
        const params = client.card.capabilities.extensions.find(
          (e) => e.uri === EXTENSION_URI,
        ).params;
        assert.equal(params.catalog.uri, resolverOptions.allowedOrigins[0] + '/catalog');
      }
      const before = (await (await fetch(url + '/evidence')).json()).executions;
      await assert.rejects(
        client.invokeContract({
          contractId: 'urn:reference:flight-search:3',
          input: { origin: 'BLR', destination: 'DEL' },
        }),
        { code: 'AMBIGUOUS_SELECTION' },
      );
      await assert.rejects(client.invokeContract({ contractId: id, input: { origin: 'BLR' } }), {
        code: 'INSTANCE_INVALID',
      });
      assert.equal((await (await fetch(url + '/evidence')).json()).executions, before);
      const networkBefore = retrievals();
      resolver?.clearCache();
      assert.deepEqual(client.catalog.schema(id, 'input', 'json'), schema);
      const result = await client.invokeContract({
        contractId: id,
        input: { origin: 'BLR', destination: 'DEL' },
      });
      assert.deepEqual(result.payload.value, {
        flights: [{ flightNumber: 'REF101', origin: 'BLR', destination: 'DEL' }],
      });
      assert.equal(result.response.status.state, TaskState.TASK_STATE_COMPLETED);
      const text = await client.invokeContract({
        contractId: 'urn:reference:flight-search:2',
        input: 'Find BLR to DEL flights',
      });
      assert.deepEqual(text.payload.value, result.payload.value);
      const failed = await client.invokeContract({
        contractId: id,
        input: { origin: 'BLR', destination: 'DEL' },
        metadata: { fault: 'invalid' },
      });
      assert.equal(failed.response.status.state, TaskState.TASK_STATE_FAILED);
      assert.deepEqual(failed.response.artifacts, []);
      assert.equal(retrievals(), networkBefore);
      const typed = await discoverFlights(url, resolver);
      assert.deepEqual(typed.result.payload.value, result.payload.value);
      const dishonest = await discoverContractClient(url, {
        ...(resolver ? { resolver } : {}),
        fetchImpl: async (input, init) => {
          const response = await fetch(input, init);
          if (init?.method !== 'POST') return response;
          const body = await response.json();
          body.result.task.artifacts[0].parts[0].data = { flights: [{}] };
          return Response.json(body);
        },
      });
      try {
        await assert.rejects(
          dishonest.invokeContract({
            contractId: id,
            input: { origin: 'BLR', destination: 'DEL' },
          }),
          { code: 'INSTANCE_INVALID' },
        );
      } finally {
        await dishonest.close();
      }
      return {
        variant: external ? 'external' : 'embedded',
        result: 'PASS',
        checks: [
          'many-to-many-skill-discovery',
          'unassociated-and-stale-contracts',
          'unsupported-alternatives',
          'immutable-schema-resources',
          'external-graph-and-advertisement',
          'schemaless-inspection',
          'ambiguity-zero-dispatch',
          'invalid-input-zero-dispatch',
          'explicit-compact-invocation',
          'text-to-JSON',
          'invalid-output-no-success',
          'offline-after-cache-clear',
          'strict-TS-consumer',
          'dishonest-peer-refusal',
        ],
      };
    } finally {
      await client.close();
    }
  }, external);
}
export async function runAllDiscovery() {
  const variants = [await runDiscovery(), await runDiscovery(true)];
  const artifact = JSON.parse(
    await readFile(new URL('../../artifact-input.json', import.meta.url), 'utf8'),
  );
  const report = {
    task: 'REF-010',
    result: 'PASS',
    runtime: process.version,
    platform: process.platform,
    artifact,
    variants,
  };
  await mkdir(new URL('../../reports/', import.meta.url), { recursive: true });
  await writeFile(
    new URL(
      `../../reports/discovery-node${process.versions.node.split('.')[0]}.json`,
      import.meta.url,
    ),
    JSON.stringify(report, null, 2) + '\n',
  );
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(await runAllDiscovery()));
