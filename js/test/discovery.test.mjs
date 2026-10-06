import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAllDiscovery } from '../src/client/discovery.mjs';
import { liveChildren } from '../scripts/harness.mjs';

test(
  'installed ordinary JS/TS apps discover embedded/external flight contracts without duplicated schemas',
  { timeout: 90000 },
  async () => {
    const report = await runAllDiscovery();
    assert.equal(report.result, 'PASS');
    assert.deepEqual(
      report.variants.map((v) => v.variant),
      ['embedded', 'external'],
    );
    assert.equal(report.variants[0].checks.length, 14);
    assert.equal(liveChildren.size, 0);
  },
);
