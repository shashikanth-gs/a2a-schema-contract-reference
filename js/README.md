# Node reference applications

These independent applications install `@shashikanth-gs/a2a-schema-contract@0.1.0-dev.0`
from a hash-verified npm tarball. They use public imports only. No SDK checkout,
workspace schemas, npm link, cloud account or model credentials are required.
Node 22 >=22.23.3 or 24 >=24.21.0, npm, and ESM are supported. Local evidence is
macOS; hosted Linux CI is configured but has not run. Python remains planned.

From `js/`, using a supported Node runtime:

```sh
export SDK_ARTIFACT=/absolute/path/to/shashikanth-gs-a2a-schema-contract-0.1.0-dev.0.tgz
npm run artifact:install
npm run check
npm run scenarios
npm run scenarios -- --scenario invoice-json-discovery
npm run check:clean
```

In this workspace, choose the SDK checkpoint tarball:

```sh
export SDK_ARTIFACT="$(cd ../../a2a-schema-contract-sdk/js/artifacts/integration-node22 && pwd)/shashikanth-gs-a2a-schema-contract-0.1.0-dev.0.tgz"
```

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
REFERENCE_HOST=127.0.0.1 REFERENCE_PORT=8080 npm start
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
