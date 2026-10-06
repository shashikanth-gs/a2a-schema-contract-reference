import { discoverContractClient } from 'a2a-schema-contract/client';
import type { ContractResolver } from 'a2a-schema-contract/resolver';

/** Strict TS application: discovery is dynamic; the application chooses a contract explicitly. */
export async function discoverFlights(url: string, resolver?: ContractResolver) {
  const client = await discoverContractClient(url, resolver ? { resolver } : {});
  try {
    const discovery = await client.describe();
    const candidates =
      discovery.skills.find(({ skill }) => skill.id === 'flight-search')?.contracts ?? [];
    const contract = candidates.find(
      ({ contract }) => contract.id === 'urn:reference:flight-search:1',
    );
    if (!contract) throw new Error('No supported flight search contract');
    const representation = contract.input.find((r) => r.supported)?.representation;
    if (!representation) throw new Error('No supported input representation');
    const schema = client.catalog.schema(contract.contract.id, 'input', representation.id);
    const result = await client.invokeContract({
      contractId: contract.contract.id,
      input: { origin: 'BLR', destination: 'DEL' },
    });
    return { discovery, schema, result };
  } finally {
    await client.close();
  }
}
