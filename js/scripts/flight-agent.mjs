import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:https';
import { withAgent } from './harness.mjs';

// Provider-owned fixture setup. The consuming application does not load these schemas.
export async function withFlightAgent(run, external = false) {
  const catalog = JSON.parse(
    await readFile(new URL('../../fixtures/flight-catalog.json', import.meta.url), 'utf8'),
  );
  const skills = [
    {
      id: 'flight-search',
      name: 'Flight search',
      description: 'Find flight options',
      tags: ['travel'],
    },
    { id: 'trip-planning', name: 'Trip planning', description: 'Plan a trip', tags: ['travel'] },
    { id: 'unused', name: 'Unused', description: 'No mapped contract', tags: [] },
  ];
  let https;
  let origin;
  let ca;
  let retrievals = 0;
  const resources = new Map();
  const publish = (path, value, mediaType) => {
    const bytes = JSON.stringify(value);
    resources.set(path, { bytes, mediaType });
    return { algorithm: 'sha-256', value: createHash('sha256').update(bytes).digest('base64') };
  };
  try {
    if (external) {
      // Public test TLS material and an exact local fixture override, never production credentials.
      ca = await readFile(new URL('../../fixtures/tls/cert.pem', import.meta.url));
      const key = await readFile(new URL('../../fixtures/tls/key.pem', import.meta.url));
      https = createServer({ cert: ca, key }, (req, res) => {
        retrievals++;
        const resource = resources.get(req.url);
        if (!resource) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': resource.mediaType });
        res.end(resource.bytes);
      });
      https.listen(0, '127.0.0.1');
      await once(https, 'listening');
      origin = `https://catalog.test:${https.address().port}`;
      const input = catalog.contracts[0].input.representations[0].schema.inline;
      const output = catalog.contracts[0].output.representations[0].schema.inline;
      const inputPin = publish('/input', input, 'application/schema+json');
      const outputPin = publish(
        '/output',
        { $ref: 'output-defs#/$defs/flights' },
        'application/schema+json',
      );
      publish('/output-defs', { $defs: { flights: output } }, 'application/schema+json');
      for (const contract of catalog.contracts)
        for (const direction of ['input', 'output'])
          for (const representation of contract[direction].representations ?? [])
            if (representation.schema) {
              delete representation.schema.inline;
              representation.schema.uri = origin + '/' + direction;
              representation.schema.integrity = direction === 'input' ? inputPin : outputPin;
            }
      publish('/catalog', catalog, 'application/json');
    }
    const resolverOptions = external
      ? {
          allowedOrigins: [origin],
          ca,
          lookup: () => Promise.resolve([{ address: '127.0.0.1', family: 4 }]),
          allowAddress: (address, hostname) =>
            address === '127.0.0.1' && hostname === 'catalog.test',
        }
      : undefined;
    return await withAgent(
      ({ url }) => run({ url, resolverOptions, retrievals: () => retrievals }),
      {
        env: {
          REFERENCE_CATALOG_JSON: JSON.stringify(catalog),
          REFERENCE_SKILLS_JSON: JSON.stringify(skills),
          ...(external
            ? { REFERENCE_RESOLVER_ORIGIN: origin, REFERENCE_CATALOG_URI: origin + '/catalog' }
            : {}),
        },
      },
    );
  } finally {
    if (https) {
      https.closeAllConnections();
      await new Promise((resolve) => https.close(resolve));
    }
  }
}
