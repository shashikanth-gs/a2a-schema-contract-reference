# Discovery, execution and result validation

The invoice agent owns its versioned domain contract `urn:reference:invoice:1` in
`fixtures/catalog.json`. Clients import no domain schema. The catalog and
language-neutral scenarios are reference fixtures, not normative extension
schemas. The pinned specification remains authoritative.

1. The agent advertises the extension URI and inline catalog in its Agent Card.
2. The client discovers that card and inspects `catalog.getContract(id)`. The
   `invoice-json-discovery` scenario independently checks that its discovered
   input schema requires `quantity`, `unitPrice`, and `label`.
3. `client.prepare` or `client.invoke` validates the candidate and attaches
   invocation metadata at operation scope. `invoke` activates the extension
   with the `A2A-Extensions` service parameter.
4. The raw server guard rejects malformed carriers before the official codec;
   the handler validates the invocation and negotiates output before business
   execution. The executor increments the evidence counter only after this gate.
5. Application code computes the invoice. `outputArtifact` validates and marks
   the primary Part using the selected output representation. The server stages
   output and validates completion before releasing successful contracted data.
6. The client validates the result echo, primary identity, presence, carrier and
   selected schema independently. A successful Task and successful omission are
   distinct from an interrupted or failed Task.

For the normal scenario the discovered candidate is:

```json
{
  "contractId": "urn:reference:invoice:1",
  "input": {
    "representationId": "json",
    "value": { "quantity": 3, "unitPrice": 7, "label": null }
  }
}
```

The operation's wire metadata contains:

```json
{
  "https://w3id.org/a2a-schema-contract/draft/0.1": {
    "contractId": "urn:reference:invoice:1",
    "inputRepresentationId": "json"
  }
}
```

The validated primary is `{ "total": 21, "label": null }`. Its Part metadata has
`role:"primary"`, `direction:"output"`, the same contract ID and
`representationId:"rich"`. The completed Task echoes the contract ID and
`outputRepresentationId:"rich"` in the extension namespace. Package version,
contract version, A2A protocol version and extension URI remain separate.

The deterministic strategy constructs the candidate from scenario data, then
passes it through normal SDK validation. It does not claim arbitrary schema
synthesis or LLM generation; REF-007 owns that later demonstration.

## Scenario catalog

Every scenario runs as `npm run scenarios -- --scenario ID` from `js/` after
installation. `fixtures/scenarios.json` owns the complete expected values and
local diagnostics independently of SDK output. Successful scenarios execute once,
except the two-turn continuation; local rejections execute zero times. No normal
scenario needs a public schema download.

| Scenario IDs                                                                       | Expected behavior                                                                                                                 |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `invoice-json-discovery`, `invoice-compact-selection`                              | Discover an unfamiliar schema; JSON result with rich/compact representation; completed Task                                       |
| `json-to-text`, `text-to-json`, `empty-text-to-json`                               | Explicit cross-media input/output selection; empty text remains present                                                           |
| `media-negotiation`                                                                | Intersect accepted representation IDs and A2A accepted media; choose UTF-8 text                                                   |
| `same-media-companions`                                                            | Three input Parts, one output primary and two Artifacts; companions excluded from domain validation                               |
| `standalone-message`                                                               | Nonempty agent Message with primary and result echo                                                                               |
| `presence-{required,optional,none}-{required,optional,none}`                       | All nine direction combinations; optional output deliberately omitted; no-output completion has zero Artifacts                    |
| `optional-input-{False,True}-output-{False,True}`                                  | All four optional presence/omission combinations                                                                                  |
| `schemaless-{false,zero,string,array,object,nested-array-null,nested-object-null}` | Exact JSON value roundtrip; no schema coercion; nested null preserved                                                             |
| `text-empty`, `boolean-schema-true`                                                | Empty text and Boolean true schema preserve present payloads                                                                      |
| `root-null-refused`                                                                | Local `UNSUPPORTED_CARRIER`, zero executions; official JS 1.3.0 root-null limitation                                              |
| `boolean-schema-false`                                                             | Local `INSTANCE_INVALID`, zero executions                                                                                         |
| `required-absence`                                                                 | Local `PAYLOAD_PRESENCE_VIOLATION`, zero executions                                                                               |
| `none-input-refused`                                                               | Local `REPRESENTATION_NOT_SUPPORTED`, zero executions; a none direction offers no representation to select                        |
| `atomic-companion-stream`                                                          | WORKING Task, status companion, complete non-append Artifact update, then one validated completed result; stable Task/context IDs |
| `no-output-companion-stream`                                                       | Real companion trigger; status events and completed no-output Task without Artifacts                                              |
| `input-required-continuation`                                                      | INPUT_REQUIRED with no successful payload; reactivated second turn preserves Task/context and selection, then completes           |

Omitted input uses a real non-primary companion trigger. No empty Message or
Artifact is invented. Output omission omits its representation ID from result
metadata. Companions never acquire primary status by sharing a media type.

The streaming examples deliver atomic contracted output. The SDK may stage status
and companion events until execution settles; this is not continuous token
streaming. Continuation uses the existing official TaskStore through public APIs.

## Limits and next validation

This batch covers inline JSON/text over A2A 1.0 JSON-RPC/HTTP and SSE with official
SDK 1.3.0. The SDK's documented numeric, regex, schema and buffering restrictions
apply. Root JSON null is explicitly rejected by that adapter; nested null is
preserved. External retrieval, hostile validator isolation, credentials,
cancellation races, malformed-peer rejection and deployment hardening remain
SDK-006/007 and REF-003/004. Python, cross-language pairing, bundles, XML/XSD and
optional LLM generation are not implemented here. Passing these scenarios does
not establish full-draft or all-transport conformance.
