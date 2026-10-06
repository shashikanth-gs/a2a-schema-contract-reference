# Node release candidate consumer validation

Status: local candidate validation passes; final hosted portability acceptance is pending. REF-003/004 remain open until those gates pass.

The reference consumes `a2a-schema-contract@0.1.0-rc.0` from SDK source checkpoint
`7481b002f55a0961ea4ee21e36da446f2a3b9ea8`, pinned normative contract revision
`a5c007510faa3fce85190f2e76e402faf0e897ad` and official A2A peer 1.3.0.
The accepted tarball SHA-256 is
`0f29b101df8af091fc2337cdc5eda6f0e7a234cdd18ac9330bf19d65f270c60e`.
The installer checks those bytes before changing the dependency lock or installed
package. Runtime consumers import public exports only and have no SDK checkout.

Fresh Node 22.23.3 and 24.21.0 copies validate locked installation, formatting,
lint, strict types, compiled TypeScript and plain JavaScript, 48 tests with zero
skips, the complete 37-scenario inline manifest, independent security scenarios,
the full documented runner and its single-scenario command. Installation audits
report zero vulnerabilities. Individual reports in `js/reports/` retain runtime,
artifact identity, requirement IDs and sanitized outcomes; the M2 inline evidence
is preserved separately under `js/reports/inline-checkpoint/`.

The 41 independently authored security scenarios cover direct invalid wire input
with zero business execution, contract/protocol version mismatch, activation and
negotiation errors, schema/echo/event failures with no successful Artifact escape,
six dishonest-peer responses, simultaneous valid/invalid requests, explicit task
cancellation, disconnect/deadline cleanup and diagnostic redaction. A valid
exponential schema times out in an installed SDK worker while the application
event loop remains responsive; worker termination is awaited and `active` is zero.

Controlled HTTPS cases use a public loopback TLS fixture with an exact trusted
hostname/address exception. A real agent advertises an external catalog, prepares
that same catalog independently, and successfully round-trips its distinct
immutable contract ID. A raw invalid request bypasses client checks and proves
server non-execution. Other cases verify pins, offline validation, cache reuse,
prohibited addresses/redirects, mismatched integrity, missing resources and byte
limits. The reference does not substitute a modified Agent Card for a server with
different schemas.

Child startup, readiness failure, interruption and forced shutdown have owned
process cleanup assertions. Graceful shutdown uses IPC on every platform; Windows
command cleanup targets only the owned process tree. These tests complement
socket closure and validation-worker cleanup. Diagnostic fixtures omit payloads,
credentials and schema bodies. Fault injection and `/evidence` require the test
environment setting `REFERENCE_EVIDENCE=1`.

The candidate workflow builds the exact SDK pin, then installs the hash-verified
tarball in a temporary reference-only copy. Its declared matrix is Linux Node
22/24 and macOS/Windows Node 24. Actual run links and source acceptance will be
recorded after completion. The [operations guide](node-operations.md) documents
commands, readiness, shutdown, limits, credentials and failure diagnosis.

Python, four-pairing interoperability, bundles/XML, other bindings, unrestricted
JSON Schema/carrier support and registry publication remain excluded. Neither
workflow configuration nor a local check establishes npm ownership or publication.
