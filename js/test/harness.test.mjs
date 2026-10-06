import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverContractClient } from '@shashikanth-gs/a2a-schema-contract/client';
import { launchAgent, withAgent, liveChildren } from '../scripts/harness.mjs';

test('success and application failure close child and listener', { timeout: 15000 }, async () => {
  let url;
  await withAgent(async (agent) => {
    url = agent.url;
  });
  await assert.rejects(fetch(url + '/health', { signal: AbortSignal.timeout(1000) }));
  await assert.rejects(
    withAgent(() => {
      throw new Error('Expected application failure');
    }),
    /Expected application failure/,
  );
  assert.equal(liveChildren.size, 0);
});
test('aborted invocation still shuts down the agent', { timeout: 15000 }, async () => {
  await withAgent(async ({ url }) => {
    const client = await discoverContractClient(url);
    await assert.rejects(
      client.invoke(
        { contractId: 'urn:reference:echo:1', input: { representationId: 'json', value: {} } },
        { signal: AbortSignal.abort() },
      ),
    );
  });
  assert.equal(liveChildren.size, 0);
});
test('pre-aborted startup creates no process', async () => {
  await assert.rejects(launchAgent({ signal: AbortSignal.abort() }));
  assert.equal(liveChildren.size, 0);
});
test(
  'readiness timeout, startup abort, premature exit and forced shutdown reap child',
  { timeout: 15000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'reference-lifecycle-'));
    const script = pathToFileURL(join(directory, 'silent.mjs'));
    try {
      // Deliberately ignores graceful SIGTERM; the harness must use its bounded fallback.
      await writeFile(script, "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);\n");
      await assert.rejects(launchAgent({ script, readinessMs: 300 }), /readiness deadline/);
      assert.equal(liveChildren.size, 0);
      await assert.rejects(launchAgent({ script, signal: AbortSignal.timeout(300) }));
      assert.equal(liveChildren.size, 0);
      await writeFile(script, 'process.exit(2);\n');
      await assert.rejects(launchAgent({ script }), /before readiness/);
      assert.equal(liveChildren.size, 0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
