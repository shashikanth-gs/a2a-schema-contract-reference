import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withAgent, liveChildren } from '../scripts/harness.mjs';
import { manifest, runScenario, runAll } from '../src/client/run.mjs';
test('independent installed-artifact inline manifest', { timeout: 90000 }, async (t) => {
  await withAgent(async ({ url }) => {
    for (const scenario of manifest.scenarios) {
      await t.test(scenario.id, { timeout: 10000 }, async () => {
        await runScenario(url, scenario);
      });
    }
    // Execute the documented runner and persist its sanitized report as a separate fresh session.
  });
  assert.equal(liveChildren.size, 0);
});
test('documented runner emits complete provenance report', { timeout: 90000 }, async () => {
  await withAgent(async ({ url }) => {
    const report = await runAll(url);
    assert.equal(report.scenarios.length, manifest.scenarios.length);
    assert.ok(report.scenarios.every((s) => s.outcome === 'PASS'));
    assert.equal(report.artifact.installation, 'npm tarball; no source imports');
    assert.equal(report.artifact.node, process.version);
  });
  assert.equal(liveChildren.size, 0);
});
