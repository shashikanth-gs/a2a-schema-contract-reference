import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { npm } from './process.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const configuration = JSON.parse(
  await readFile(new URL('../artifact-input.json', import.meta.url), 'utf8'),
);
const input = process.env.SDK_ARTIFACT;
if (!input) throw new Error('Set SDK_ARTIFACT to an npm tarball path; see js/README.md');
const artifact = await readFile(resolve(input));
const hash = createHash('sha256').update(artifact).digest('hex');
if (hash !== configuration.sha256)
  throw new Error('SDK artifact SHA-256 mismatch; no installation attempted');
await mkdir(resolve(root, 'artifacts'), { recursive: true });
const staged = resolve(root, 'artifacts/sdk.tgz');
await writeFile(staged, artifact);
await npm(['ci', '--ignore-scripts'], { cwd: root });
const installedRoot = resolve(root, 'node_modules', configuration.packageName);
const installed = JSON.parse(await readFile(resolve(installedRoot, 'package.json'), 'utf8'));
if (installed.version !== configuration.version) throw new Error('Installed SDK version mismatch');
const corePath = await realpath(
  fileURLToPath(import.meta.resolve(configuration.packageName + '/core')),
);
if (!corePath.startsWith((await realpath(installedRoot)) + sep))
  throw new Error('SDK resolved outside installed artifact');
await mkdir(resolve(root, 'reports'), { recursive: true });
await writeFile(
  resolve(root, 'reports/artifact.json'),
  JSON.stringify(
    {
      ...configuration,
      node: process.version,
      installation: 'npm tarball; no source imports',
      result: 'PASS',
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ artifact: configuration.version, sha256: hash, result: 'PASS' }));
