import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { npm } from './process.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const input = process.env.SDK_ARTIFACT;
if (!input) throw new Error('Set SDK_ARTIFACT before running check:clean');
const artifact = await readFile(resolve(input));
const config = JSON.parse(
  await readFile(new URL('../artifact-input.json', import.meta.url), 'utf8'),
);
if (createHash('sha256').update(artifact).digest('hex') !== config.sha256)
  throw new Error('SDK artifact SHA-256 mismatch');
const temp = await mkdtemp(join(tmpdir(), 'a2a-reference-clean-'));
const consumer = join(temp, 'reference');
const started = Date.now();
try {
  await cp(root, consumer, {
    recursive: true,
    filter: (path) =>
      !path
        .split(/[\\/]/u)
        .some((part) =>
          ['.git', '.sdk-source', 'node_modules', 'dist', 'reports', 'artifacts'].includes(part),
        ),
  });
  const copiedArtifact = join(temp, 'sdk.tgz');
  await writeFile(copiedArtifact, artifact);
  const js = join(consumer, 'js');
  const previous = process.env.SDK_ARTIFACT;
  process.env.SDK_ARTIFACT = copiedArtifact;
  try {
    await npm(['run', 'artifact:install'], { cwd: js });
  } finally {
    process.env.SDK_ARTIFACT = previous;
  }
  // This wraps formatting/build plus several independently bounded suites.
  // The expanded discovery suite can put Windows over the default three minutes.
  await npm(['run', 'check'], { cwd: js, timeoutMs: 360000 });
  await npm(['run', 'scenarios', '--', '--scenario', 'invoice-json-discovery'], { cwd: js });
  // Restore a full report after verifying the single-scenario tutorial command.
  await npm(['run', 'scenarios'], { cwd: js });
  await npm(['run', 'discovery'], { cwd: js });
  const reports = fileURLToPath(new URL('../reports/', import.meta.url));
  await mkdir(reports, { recursive: true });
  const major = process.versions.node.split('.')[0];
  await cp(
    join(js, 'reports', `security-node${major}.json`),
    join(reports, `security-node${major}.json`),
  );
  await cp(
    join(js, 'reports', `scenarios-node${major}.json`),
    join(reports, `scenarios-node${major}.json`),
  );
  await cp(
    join(js, 'reports', `discovery-node${major}.json`),
    join(reports, `discovery-node${major}.json`),
  );
  await writeFile(
    join(reports, `clean-node${major}.json`),
    JSON.stringify(
      {
        result: 'PASS',
        node: process.version,
        platform: process.platform,
        artifact: config,
        isolation:
          'Temporary reference-only copy; hash-verified tarball staging then locked npm ci; SDK/source inputs absent',
        checks: [
          'format',
          'lint',
          'strict-types',
          'compiled-typescript',
          'plain-javascript',
          '37-inline-scenarios',
          'independent-protocol-security-and-HTTPS-scenarios',
          'lifecycle-cleanup',
          'documented-runner',
          'single-scenario-command',
          'ordinary-JS-and-strict-TS-flight-discovery-embedded-and-external',
          'documented-discovery-runner',
        ],
        elapsedMs: Date.now() - started,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
