# Discover and invoke a flight-search agent

Install the exact artifact using [the quickstart](../js/README.md), then run from `js/`:

```sh
npm run discovery
```

This command builds the TypeScript application, starts a provider on a dynamic
port and runs ordinary JavaScript and compiled TypeScript clients. Both embedded
and externally hosted catalog/schema variants run locally without model accounts.
The HTTPS variant uses public test TLS material and an explicit loopback policy.
The command closes all clients, agents and fixture services and writes
`reports/discovery-node*.json`, including artifact provenance and 14 checked
outcomes per variant. `npm run check:clean` repeats this workflow in a fresh
reference-only installation.

The provider owns [the flight catalog](../fixtures/flight-catalog.json). Clients
start with its Agent Card URL and do not load or recreate those schema files.
[The TypeScript client](../js/src/client/discover.ts) demonstrates the application
path:

```ts
const client = await discoverContractClient(agentUrl, { resolver });
try {
  const discovery = await client.describe();
  const candidates =
    discovery.skills.find(({ skill }) => skill.id === "flight-search")
      ?.contracts ?? [];
  const selected = candidates.find(
    ({ contract }) => contract.id === "urn:reference:flight-search:1",
  );
  if (!selected) throw new Error("No flight contract");
  const schema = client.catalog.schema(selected.contract.id, "input", "json");
  const result = await client.invokeContract({
    contractId: selected.contract.id,
    input: { origin: "BLR", destination: "DEL" },
  });
} finally {
  await client.close();
}
```

`agentUrl` and the configured resolver are application inputs. Embedded discovery
can omit the resolver. The example deliberately chooses a known contract from
the discovered candidates; a skill can map to several contracts. Applications
choose according to their own intent and supported representations. The schema
view exposes the original resources and entry URI, rather than a flattened or
provider-specific schema. Dynamic discovery does not invent static domain types.

The flight fixture returns `{ flights: [{ flightNumber: 'REF101', origin: 'BLR',
destination: 'DEL' }] }`. It is deterministic application logic, not a live flight
service. The SDK handles protocol metadata, validation and supported unambiguous
representation selection. A text request exercises a separate text-to-JSON
contract. The same schema graph is used for server and client validation.

The independent runner also verifies many-to-many associations, an advertised
skill without contracts, an unassociated contract, a stale skill reference and
an unsupported representation. Two supported input alternatives produce
`AMBIGUOUS_SELECTION` without dispatch; missing required fields produce
`INSTANCE_INVALID` without execution. Invalid generated output produces a failed
Task with no successful Artifact, and an independently altered peer result is
rejected by the client. Inspection and invocation perform no extra retrieval,
including after resolver-cache clearing.

External advertisement uses the SDK's acquired-catalog reference and
`catalogDelivery: 'external'`; the provider does not replace extension params
after construction. [The SDK binding guide](https://github.com/shashikanth-gs/a2a-schema-contract-sdk/blob/codex/m3-node-release-candidate/docs/metadata-binding.md)
defines operation, primary Part and result metadata placement. Python parity,
framework adapters and model schema conversion remain separate work.
