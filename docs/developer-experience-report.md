# Installed Node discovery validation

REF-010 consumes the private `a2a-schema-contract@0.1.0-rc.1` tarball through
public imports. SDK runtime source is
`07ddd60e339ed0d86f2ace091e263a7aa369a0b9`; SHA-256 is
`09c0146a2d9d1ba110fd6d888374ce0233f8effc1df77dc42f6a167bd4717677`.
The normative source remains `a5c007510faa3fce85190f2e76e402faf0e897ad`.
[artifact-input.json](../js/artifact-input.json) and the npm lock record exact
version, revision, checksum and dependency integrity.

On 2026-10-07, with `SDK_ARTIFACT` set to those bytes, `npm run check:clean`
passed on Node **22.23.3 and 24.21.0**, macOS arm64. Each run copies only this
reference into a temporary directory, verifies the supplied tarball hash and
performs locked installation, formatting, lint, strict types, compilation and
**49 tests with no skips**. The full and single-scenario commands, plus
`npm run discovery`, pass. Existing 37 inline and 43 independent security
scenarios pass against RC1. Installation audits report zero vulnerabilities.

The new flight-discovery workflow checks **14 outcomes in each of two variants**:
embedded catalog/schemas and external HTTPS catalog/schema resources. Expected
skills, contracts, resource counts, payloads, failure states and execution counts
are owned by this repository. The provider owns
[the catalog](../fixtures/flight-catalog.json); consumers start with an Agent Card
URL and never reconstruct its schema. The ordinary
[JavaScript runner](../js/src/client/discovery.mjs) and strict
[TypeScript client](../js/src/client/discover.ts) use installed public APIs.

Checks cover many-to-many skill associations, unmapped/stale references,
unsupported alternatives, immutable schema resources, original external graph
and advertisement, schemaless inspection, ambiguity/invalid input with zero
dispatch, explicit compact invocation, text-to-JSON, invalid output with no
successful Artifact, offline inspection/invocation after cache clearing,
compiled TS usage and independent dishonest-peer refusal. Client, child-process
and HTTPS fixture ownership is closed on success and failure.

Reports: `js/reports/clean-node{22,24}.json`,
`discovery-node{22,24}.json`, `scenarios-node{22,24}.json` and
`security-node{22,24}.json`. The [current-candidate hosted matrix](https://github.com/shashikanth-gs/a2a-schema-contract-reference/actions/runs/37526845838)
passes Linux Node 22/24 and macOS/Windows Node 24 at reference runtime source
`6c662a312183b5dd189bf941caf86223f1415644`. Each job rebuilds the exact SDK pin,
verifies its hash, and runs the fresh reference-only consumer gate. REF-010 and
workspace M3a are complete. Old RC0 reports remain historical evidence.

[The tutorial](discovery-tutorial.md) contains the verified command and application
recipe. These deterministic local examples do not call a flight service or model.
The established bounded JSON/text, transport, resolver and carrier restrictions
remain. Python/four-pairing parity and ADK/LangGraph adapters are separate work;
no framework dependency or registry publication is introduced.
