import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runSecurity } from '../src/client/security.mjs';

test('independent installed-artifact protocol/security scenarios', { timeout: 90000 }, async () => {
  const report = await runSecurity();
  assert.equal(report.result, 'PASS');
  assert.ok(report.scenarios.length >= 30);
  assert.ok(report.scenarios.every((scenario) => scenario.outcome === 'PASS'));
});
