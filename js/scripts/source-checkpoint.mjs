import { appendFile, mkdir, readFile } from 'node:fs/promises';
const configuration = JSON.parse(
  await readFile(new URL('../artifact-input.json', import.meta.url), 'utf8'),
);
if (!/^[a-f0-9]{40}$/u.test(configuration.sdkCommit))
  throw new Error('An exact reviewed SDK commit is required');
if (!/^[a-f0-9]{64}$/u.test(configuration.sha256))
  throw new Error('An exact reviewed artifact hash is required');
if (!process.env.GITHUB_OUTPUT)
  throw new Error('This entrypoint requires GitHub Actions output ownership');
await appendFile(process.env.GITHUB_OUTPUT, `sdk_revision=${configuration.sdkCommit}\n`);
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
