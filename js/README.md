# Node reference applications

These independent applications install `a2a-schema-contract@0.1.0-rc.1`
from a hash-verified npm tarball. They use public imports only. No SDK checkout,
workspace schemas, npm link, cloud account or model credentials are required.
Node 22 >=22.23.3 or 24 >=24.21.0, npm, and ESM are supported. Current candidate evidence is recorded in the developer-experience report.
Python remains planned.

From `js/`, using a supported Node runtime:

```sh
export SDK_ARTIFACT=/absolute/path/to/a2a-schema-contract-0.1.0-rc.1.tgz
npm run artifact:install
npm run check
npm run scenarios
npm run discovery
npm run scenarios -- --scenario invoice-json-discovery
npm run check:clean
```

To build the accepted tarball from public source, follow the
[repository quickstart](../README.md#get-started). It checks out the exact SDK
revision from `artifact-input.json`; a tarball built from the SDK's current main
branch will have a different hash and is refused by this checkpoint.

The artifact input is explicit and only this installation step reads that file.
The application never imports SDK sources. `artifact-input.json` records the
accepted version, SHA-256, SDK revision and contract revision. A mismatched hash
fails before npm runs. The installer writes the verified bytes to `artifacts/sdk.tgz`, then runs
`npm ci --ignore-scripts`. The lock includes the SDK and its complete dependency
graph through that stable relative tarball path, with npm integrity checks.
No machine-specific SDK path is saved. Stage the artifact with `artifact:install`
before running any installation on a fresh checkout.
A future released version can be packed with `npm pack package@version`; update
and review the artifact pin before using it. Application imports do not change.

`check` runs Prettier, ESLint, strict TypeScript and compiled application/transport
and process tests. `check:clean` copies only this reference repository into a fresh
temporary directory, installs dependencies and the supplied artifact, runs all
checks and the documented runner commands, and removes that directory on success
or failure. It does not build or import the sibling SDK. Reports retain provenance
and scenario decisions, without payload values, credentials or schema bodies.

`scenarios` launches a compiled TypeScript agent on a dynamic loopback port, waits
for an IPC readiness signal and `/health`, and invokes it with plain JavaScript
and compiled TypeScript clients. Each scenario discovers the Agent Card anew.
Shutdown runs in `finally`; startup errors, readiness deadlines, startup abort,
invocation abort and forced shutdown are tested. Command deadlines and SIGINT/SIGTERM interruption also terminate
the subprocess group on Unix. No arbitrary startup delay is used.

To run the agent and client separately:

```sh
REFERENCE_HOST=127.0.0.1 REFERENCE_EVIDENCE=1 REFERENCE_PORT=8080 npm start
# In another terminal, from js/:
npm run scenarios -- --url http://127.0.0.1:8080 --scenario invoice-json-discovery
# Stop the agent with Ctrl-C.
```

Expected runner summary is `{"result":"PASS","scenarios":37,"node":"v22.23.3"}`
(or the actual supported runtime version). A single scenario reports `scenarios:1`.
Agent startup prints `{"type":"ready","url":"http://127.0.0.1:8080"}` for the
fixed-port example. A bind/port error fails startup. `REFERENCE_PORT=0` is the
default and obtains an OS-assigned port. `REFERENCE_HOST` defaults to loopback.
The `/evidence` endpoint is a local test aid containing counters and identifiers;
this unauthenticated demonstration server is intended for local development.

See the [flow and scenario tutorial](../docs/inline-tutorial.md),
[validation report](../docs/inline-reference-report.md), and [task plan](../PLAN.md).

## Node release candidate operation

Run `npm run security` for the independent raw-request, failure, dishonest-peer,
HTTPS policy/integrity and worker/cancellation suite. `npm run check` includes
that suite alongside the 37 inline scenarios. See
[the operations guide](../docs/node-operations.md) for configuration, readiness,
graceful shutdown, credential ownership, diagnostics and troubleshooting.
The candidate workflow rebuilds the exact `artifact-input.json` SDK revision and
runs fresh installed consumers on Linux Node 22/24 and macOS/Windows Node 24.

`REFERENCE_EVIDENCE=1` enables only test counters, sanitized diagnostic facts and
intentional fault injection; the scenario harness sets it. Leave it disabled in
normal service operation. The TLS certificate/key under `fixtures/tls/` is a
public loopback test fixture. Package publishing remains disabled.

## Skill discovery and compact invocation

Run `npm run discovery` for embedded and external flight-search catalogs, skill
associations, immutable schema resources and compact explicit invocation.
Both ordinary JS and strict TS applications consume the installed SDK, without
recreating provider schemas. See [the tutorial](../docs/discovery-tutorial.md) and
[validation report](../docs/developer-experience-report.md).
