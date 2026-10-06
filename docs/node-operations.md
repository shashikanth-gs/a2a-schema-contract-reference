# Node reference setup, operation and troubleshooting

These applications consume the exact unscoped SDK tarball recorded by
`js/artifact-input.json`. Use Node 22 >=22.23.3 or 24 >=24.21.0 with npm and ESM.
Python and four-language-pairing evidence remain planned.

## Install and validate

Build the exact SDK revision in `artifact-input.json`, then set `SDK_ARTIFACT` to
the resulting `a2a-schema-contract-0.1.0-rc.0.tgz` absolute path. From reference `js/`:

```sh
npm run artifact:install
npm run check
npm run scenarios
npm run security
npm run check:clean
```

The installer checks SHA-256 before touching the dependency lock or installed
package. `check:clean` copies only this reference, stages the reviewed bytes and
runs locked installation, formatting, lint, strict types, compiled applications,
37 inline scenarios and the independent protocol/security suite. The SDK and
workspace inputs are absent from that fresh consumer. Reports retain artifact
identity, exact source revision, runtime and individual scenario outcomes.

The [inline tutorial](inline-tutorial.md) explains discovery, selection,
activation, input validation before execution, staged output validation and
independent client validation. The security runner deliberately bypasses client
validation with raw A2A 1.0 requests, checks business counters, injects invalid
output/stream races, and supplies a dishonest peer. It also uses a controlled
HTTPS service for catalog/schema discovery, pins, redirect/address policy and
bounded failures. It never relies on arbitrary Internet hosts or model accounts.

## Run a local service

```sh
REFERENCE_HOST=127.0.0.1 REFERENCE_PORT=8080 REFERENCE_DEADLINE_MS=5000 npm start
```

On PowerShell, set the corresponding `$env:REFERENCE_HOST`,
`$env:REFERENCE_PORT` and `$env:REFERENCE_DEADLINE_MS` values before `npm start`.
`GET /health` returns `{ "ready": true }`; discovery uses
`/.well-known/agent-card.json`, and A2A 1.0 JSON-RPC/SSE uses `/rpc`.
The service prints its ready URL when started directly. Port zero chooses a
dynamic port for scenario harnesses. Use the SDK client against that URL. To run the evidence-based scenario runner
against a separately started service, explicitly set `REFERENCE_EVIDENCE=1` for
that test service; the normal service keeps its counters/fault fixtures disabled.

| Variable                | Default                | Meaning                                                                                        |
| ----------------------- | ---------------------- | ---------------------------------------------------------------------------------------------- |
| `REFERENCE_HOST`        | `127.0.0.1`            | Bind address; use an explicit trusted interface for deployment.                                |
| `REFERENCE_PORT`        | `0`                    | TCP port, integer 0–65535.                                                                     |
| `REFERENCE_DEADLINE_MS` | `30000`                | Business execution deadline, integer 1–30000 ms.                                               |
| `REFERENCE_REQUIRED`    | enabled                | Set `0` to exercise an optional extension and its baseline handler.                            |
| `REFERENCE_EVIDENCE`    | disabled               | Set `1` only for test harness counters, sanitized diagnostics and intentional fault injection. |
| `SDK_ARTIFACT`          | required during intake | Exact tarball path; does not affect runtime schema retrieval.                                  |

The external discovery harness additionally sets `REFERENCE_CATALOG_JSON` to its
trusted fixture catalog, `REFERENCE_RESOLVER_ORIGIN` to the exact controlled
`https://catalog.test:<port>` origin, and `REFERENCE_CATALOG_URI` to the resource
advertised by the agent. These settings are accepted only with evidence mode
enabled. The server prepares the same schema graph that the client discovers;
they are test fixture inputs, not administrator policy supplied by a remote peer.

The HTTP parser limits request bodies to 256 KiB. SDK staging is bounded to 128
events and 256 KiB; validation workers default to four concurrent operations and four active business executions,
2,000 ms per operation and 64 MiB V8 old-generation heap. Resolver preparation has
its own 10-second I/O budget and documented graph/byte/cache limits. Graceful
SIGTERM/SIGINT stops acceptance, aborts active contract work and closes validation
workers; connections that do not drain are closed within one second. The harness
also bounds readiness and escalates failed shutdown to process termination.

## Deployment and credentials

The deterministic reference uses the official SDK's unauthenticated user builder
and an in-memory TaskStore. They are local demonstration choices. A deployed
application must supply its authentication/user builder, trusted HTTP ingress,
bounded task retention and its own business/tool resource ownership. The SDK
retains the official TaskStore and request context; it does not install a new
orchestration layer. Disable `REFERENCE_EVIDENCE` outside tests. Use a host process
manager, readiness check, termination grace period and process memory limit.

For authenticated SDK integration, configure the existing official Client's fetch
and service parameters, wrap its response fetch with `guardResponseFetch`, and
pass that Client to `createContractClient`. The host's context builder retains
headers/user/tenant state for its executor. Do not put auth tokens in public
extension metadata. Resolver authorization belongs to an identity-owned resolver
and exact configured origins; credentials are stripped on origin changes.

The checked-in TLS key/certificate is a public local test fixture. The controlled
service binds loopback and permits only its exact hostname/address through
administrator configuration. This is an explicit fixture policy, not a
production recommendation to allow private addresses globally. Ordinary scenarios
require no external credentials, containers, cloud services or LLM providers.

## Troubleshooting

| Symptom                                 | Check                                                                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Tarball checksum/version mismatch       | Rebuild the exact accepted SDK revision and use the configured candidate; update pins only with reviewed consumer evidence.  |
| A2A version refusal                     | Raw requests must send `A2A-Version: 1.0`, the extension activation header and JSON-RPC method casing.                       |
| Required extension refusal              | Activate the advertised extension; optional baseline requests carry no contract metadata.                                    |
| Input refusal with no executions        | Check the discovered contract ID, representation, primary metadata, presence and schema; coercion is intentionally disabled. |
| Failed Task without successful Artifact | Correct output, echo or event grammar. The stream may contain a safe initial WORKING Task, then failure.                     |
| Validation timeout/resource limit       | Review schema work, configured concurrency and limits; every failed worker is terminated.                                    |
| Resolver policy/integrity error         | Review exact administrator origins, pins and transitive resources; do not trust policy from the peer's metadata.             |
| Hanging service/process                 | Cooperate with execution signals, close iterators and clients, call server `close()`, then drain the HTTP host.              |

No automatic retry of a side-effecting invocation occurs. Client disconnect does
not imply `CancelTask`; explicit cancellation is a separate protocol operation.
Root JSON null is refused by the official adapter, while nested null is retained.
Bundles/XML, other transports and full-dialect conformance remain excluded.

The candidate workflow builds a pinned SDK checkout outside the isolated runtime
consumer and checks Linux Node 22/24 plus macOS/Windows Node 24. Each hosted job
keeps its own sanitized consumer reports. The optional manual HTTPS tarball intake
also checks the committed hash. Workflow configuration alone is not validation
evidence; the candidate report links actual successful runs.

The harness requests graceful shutdown through its owned IPC channel on all
platforms. POSIX command owners also handle interruption signals; Windows command
cleanup targets the owned process tree with
[`taskkill /T /F`](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill).
