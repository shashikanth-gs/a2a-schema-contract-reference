// Explicit manual CI intake; this is not the SDK's runtime schema resolver.
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const url = new URL(process.env.SDK_ARTIFACT_URL);
if (url.protocol !== 'https:' || url.username || url.password || url.hash)
  throw new Error('Supply a credential-free HTTPS artifact URL');
const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'error' });
if (!response.ok || !response.body) throw new Error('Artifact download failed');
const reader = response.body.getReader();
const chunks = [];
let bytes = 0;
try {
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > 8388608) throw new Error('Artifact size limit exceeded');
    chunks.push(chunk.value);
  }
} finally {
  await reader.cancel();
}
const artifact = Buffer.concat(chunks);
const config = JSON.parse(
  await readFile(new URL('../artifact-input.json', import.meta.url), 'utf8'),
);
if (createHash('sha256').update(artifact).digest('hex') !== config.sha256)
  throw new Error('Artifact SHA-256 mismatch');
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
await writeFile(new URL('../artifacts/sdk.tgz', import.meta.url), artifact);
