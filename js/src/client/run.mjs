import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { TaskState, SendMessageRequest } from '@a2a-js/sdk';
import { discoverContractClient } from '@shashikanth-gs/a2a-schema-contract/client';
import { ContractError, EXTENSION_URI } from '@shashikanth-gs/a2a-schema-contract/core';
import { invoke as typedInvoke } from '../../dist/client/invoke.js';
import { withAgent } from '../../scripts/harness.mjs';
export const manifest = JSON.parse(
  await readFile(new URL('../../../fixtures/scenarios.json', import.meta.url), 'utf8'),
);
const timeout = () => ({ signal: AbortSignal.timeout(5000) });
export async function evidence(url) {
  return (await fetch(url + '/evidence', timeout())).json();
}
function checkResult(result, expected, contractId) {
  assert.equal(result.payload?.present, expected.present);
  const message = 'parts' in result.response;
  if (expected.carrier === 'message') assert.equal(message, true);
  else assert.equal(message, false);
  if (!message) assert.equal(result.response.status.state, TaskState.TASK_STATE_COMPLETED);
  const echo = result.response.metadata[EXTENSION_URI];
  assert.equal(echo.contractId, contractId);
  if (expected.present) {
    assert.deepEqual(result.payload.value, expected.value);
    assert.equal(result.payload.representationId, expected.representationId);
    assert.equal(echo.outputRepresentationId, expected.representationId);
    const primary = result.payload.part;
    assert.deepEqual(primary.metadata[EXTENSION_URI], {
      contractId,
      direction: 'output',
      representationId: expected.representationId,
      role: 'primary',
    });
  } else assert.equal(Object.hasOwn(echo, 'outputRepresentationId'), false);
  if (expected.artifactCount !== undefined)
    assert.equal(result.response.artifacts.length, expected.artifactCount);
}
export async function runScenario(url, scenario) {
  const client = await discoverContractClient(url, timeout());
  const contract = client.catalog.getContract(scenario.invocation.contractId);
  assert.equal(contract.id, scenario.invocation.contractId);
  // The client learns the domain schema from discovery, rather than importing the server catalog.
  if (scenario.id === 'invoice-json-discovery') {
    const schema = contract.input.representations.find((r) => r.id === 'json').schema.inline;
    assert.deepEqual(schema.required, ['quantity', 'unitPrice', 'label']);
    assert.equal(schema.additionalProperties, false);
  }
  const before = await evidence(url);
  const expected = scenario.expected;
  if (expected.localError) {
    await assert.rejects(
      client.invoke(scenario.invocation, timeout()),
      (error) => error instanceof ContractError && error.code === expected.localError,
    );
    assert.equal((await evidence(url)).executions, before.executions);
    return { id: scenario.id, outcome: 'PASS', diagnostic: expected.localError, executions: 0 };
  }
  const wire = SendMessageRequest.toJSON(client.prepare(scenario.invocation));
  assert.equal(wire.metadata[EXTENSION_URI].contractId, contract.id);
  assert.ok(wire.message.parts.length > 0);
  if (!scenario.invocation.input) {
    assert.equal(wire.metadata[EXTENSION_URI].inputRepresentationId, undefined);
    assert.ok(wire.message.parts.every((p) => !p.metadata?.[EXTENSION_URI]));
  }
  let result;
  if (scenario.transport === 'sse') {
    const events = [];
    for await (const event of client.stream(scenario.invocation, timeout())) events.push(event);
    assert.equal(events.at(-1).kind, 'result');
    assert.equal(events.filter((e) => e.kind === 'result').length, 1);
    const taskIds = new Set();
    const contextIds = new Set();
    const cases = [];
    for (const e of events.filter((e) => e.kind === 'companion')) {
      const payload = e.event.payload;
      cases.push(payload.$case);
      taskIds.add(payload.value.id ?? payload.value.taskId);
      contextIds.add(payload.value.contextId);
      if (payload.$case === 'artifactUpdate') {
        assert.equal(payload.value.append, false);
        assert.equal(payload.value.lastChunk, true);
      }
    }
    result = events.at(-1).result;
    assert.deepEqual(taskIds, new Set([result.response.id]));
    assert.deepEqual(contextIds, new Set([result.response.contextId]));
    assert.ok(cases.includes('task') && cases.includes('statusUpdate'));
    if (expected.present) assert.ok(cases.includes('artifactUpdate'));
    else assert.equal(cases.includes('artifactUpdate'), false);
  } else if (scenario.transport === 'continuation') {
    const first = await client.invoke(scenario.invocation, timeout());
    assert.equal(first.response.status.state, TaskState.TASK_STATE_INPUT_REQUIRED);
    assert.equal(first.payload, undefined);
    assert.deepEqual(first.response.artifacts, []);
    assert.equal(first.response.metadata[EXTENSION_URI].contractId, contract.id);
    result = await client.invoke(
      {
        ...scenario.invocation,
        metadata: {},
        taskId: first.response.id,
        contextId: first.response.contextId,
      },
      timeout(),
    );
    assert.equal(result.response.id, first.response.id);
    assert.equal(result.response.contextId, first.response.contextId);
  } else {
    // Execute the compiled strict TypeScript application as well as plain-JS clients.
    result =
      scenario.id === 'invoice-json-discovery'
        ? await typedInvoke(url, scenario.invocation)
        : await client.invoke(scenario.invocation, timeout());
  }
  checkResult(result, expected, contract.id);
  const after = await evidence(url);
  assert.equal(after.executions - before.executions, expected.executions ?? 1);
  const call = after.calls.at(-1);
  assert.equal(call.inputPresent, expected.inputPresent ?? Boolean(scenario.invocation.input));
  if (expected.inputPartCount !== undefined)
    assert.equal(call.inputPartCount, expected.inputPartCount);
  return {
    id: scenario.id,
    outcome: 'PASS',
    executions: after.executions - before.executions,
    present: expected.present,
    ...(expected.representationId ? { representationId: expected.representationId } : {}),
    state: expected.carrier === 'message' ? 'message' : 'completed',
    transport: scenario.transport ?? 'http',
  };
}
export async function runAll(url, selectedId) {
  const selected = manifest.scenarios.filter((s) => !selectedId || s.id === selectedId);
  if (!selected.length) throw new Error('Unknown scenario ID');
  const results = [];
  for (const scenario of selected) results.push(await runScenario(url, scenario));
  const artifact = JSON.parse(
    await readFile(new URL('../../reports/artifact.json', import.meta.url), 'utf8'),
  );
  const report = {
    result: 'PASS',
    profile: manifest.profile,
    extensionUri: manifest.extensionUri,
    runtime: process.version,
    platform: process.platform,
    artifact,
    scenarios: results,
  };
  await mkdir(new URL('../../reports/', import.meta.url), { recursive: true });
  await writeFile(
    new URL(
      `../../reports/scenarios-node${process.versions.node.split('.')[0]}.json`,
      import.meta.url,
    ),
    JSON.stringify(report, null, 2) + '\n',
  );
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const urlIndex = args.indexOf('--url');
  const idIndex = args.indexOf('--scenario');
  const selected = idIndex < 0 ? undefined : args[idIndex + 1];
  const report =
    urlIndex < 0
      ? await withAgent((agent) => runAll(agent.url, selected))
      : await runAll(args[urlIndex + 1], selected);
  console.log(
    JSON.stringify({
      result: report.result,
      scenarios: report.scenarios.length,
      node: process.version,
    }),
  );
}
