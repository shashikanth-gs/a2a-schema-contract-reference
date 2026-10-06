import {
  discoverContractClient,
  type ContractResponse,
  type InvocationOptions,
} from 'a2a-schema-contract/client';
/** Runtime-discovered schema remains authoritative; no invented static domain type. */
export async function invoke(url: string, options: InvocationOptions): Promise<ContractResponse> {
  const client = await discoverContractClient(url, { signal: AbortSignal.timeout(5000) });
  return client.invoke(options, { signal: AbortSignal.timeout(5000) });
}
