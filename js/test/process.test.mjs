import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command } from '../scripts/process.mjs';

test('command deadline terminates an unfinished child', { timeout: 5000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reference-command-'));
  const pidFile = join(directory, 'pid');
  try {
    await assert.rejects(
      command(
        [
          '--input-type=module',
          '-e',
          "import {writeFileSync} from 'node:fs'; writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000);",
          pidFile,
        ],
        { timeoutMs: 500 },
      ),
      /deadline exceeded/,
    );
    const pid = Number(await readFile(pidFile, 'utf8'));
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('interrupting command owner terminates the subprocess group', { timeout: 5000 }, async () => {
  const moduleUrl = new URL('../scripts/process.mjs', import.meta.url).href;
  const childCode = 'console.log(JSON.stringify({pid:process.pid})); setInterval(() => {}, 1000);';
  const owner = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {command} from ${JSON.stringify(moduleUrl)}; try { await command(['-e', ${JSON.stringify(childCode)}]); } catch { process.exitCode = 143; }`,
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const exited = new Promise((resolve, reject) => {
    owner.once('exit', resolve);
    owner.once('error', reject);
  });
  const timer = setTimeout(() => owner.kill('SIGKILL'), 3000);
  try {
    const pid = await new Promise((resolve, reject) => {
      let output = '';
      owner.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.includes('\n')) resolve(JSON.parse(output.trim()).pid);
      });
      owner.once('exit', () => reject(new Error('Owner exited before child readiness')));
      owner.once('error', reject);
    });
    owner.kill('SIGTERM');
    assert.equal(await exited, 143);
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  } finally {
    clearTimeout(timer);
    if (owner.exitCode === null) owner.kill('SIGKILL');
    await exited;
  }
});
