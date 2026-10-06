# Independent Node inline checkpoint evidence

REF-001 and REF-002 completed locally on 2026-10-06. The reference application
consumes the public installed artifact and does not import SDK internals. This
report supports root M2; it does not close security/release milestones M3–M5.
Implementation provenance is recorded in the workspace `CHECKPOINTS.md`.

| Input                 | Validated value                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| SDK package           | `a2a-schema-contract@0.1.0-dev.0`                                                                               |
| SDK source checkpoint | `eb0dda05c0bf77d5250184006bb499691f454d3c`                                                                      |
| Artifact SHA-256      | `3476778550e9b570bb60d7529faa6c7a63c4fee9d67f0911e879809cdd8f1bd4`                                              |
| Contract revision     | `v0.1.0-draft.1`, `a5c007510faa3fce85190f2e76e402faf0e897ad`                                                    |
| Extension URI         | `https://w3id.org/a2a-schema-contract/draft/0.1`                                                                |
| Official SDK          | `@a2a-js/sdk@1.3.0`                                                                                             |
| Runtime evidence      | Node 22.23.3 and 24.21.0 on macOS (`darwin`)                                                                    |
| Transport             | A2A 1.0 JSON-RPC over HTTP; SSE for companion/status and atomic results                                         |
| Isolation             | Temporary reference-only checkout, `npm ci`, hash-verified tarball install; SDK/source-input directories absent |

## Reproduction and results

From `js/`, set `SDK_ARTIFACT` to either accepted integration checkpoint tarball.
These exact commands were run:

```sh
npm exec --yes --package=node@22.23.3 -- npm run check:clean
npm exec --yes --package=node@24.21.0 -- npm run check:clean
```

Each gate passes dependency installation, formatting, ESLint, strict TypeScript,
application compilation, 47 Node tests including all 37 named scenarios, and the
full and single-scenario documented runner commands. No tests are skipped.
Both dependency installation audits report zero vulnerabilities. The SDK tarball
is verified before installation and package/version/public-path checks follow it.

Machine-readable evidence:

- `js/reports/clean-node22.json`, `js/reports/clean-node24.json`: gate provenance and environment.
- `js/reports/scenarios-node22.json`, `js/reports/scenarios-node24.json`: each independently expected semantic outcome, execution count, representation and final state.
- `js/artifact-input.json`: immutable artifact and source pins.
- `fixtures/scenarios.json`: language-neutral expected outcomes, owned by this reference repository.

## REF-001 evidence

The artifact installer rejects altered bytes before npm runs and preserves the
lock and installed SDK on rejection. Installed imports and schema resources
resolve under this consumer's `node_modules`. npm link, editable installs,
sibling source imports and schema downloads are unused. The npm lock contains the SDK tarball and its transitive graph using
`file:artifacts/sdk.tgz`, without a machine-specific source path. The installer
stages the hash-verified bytes, then uses `npm ci --ignore-scripts`.

The compiled TypeScript agent signals readiness only after binding its dynamic
port and setting its advertised endpoint. The launcher waits for IPC readiness
and a `/health` check. The plain JavaScript runner also executes the compiled
strict TypeScript invocation function. Application failure, invocation abort,
pre-aborted startup, readiness timeout, startup abort, premature exit and an
agent ignoring SIGTERM all have automated cleanup evidence. Shutdown closes
listeners and reaps tracked children; command deadlines kill Unix process groups.

The initial Linux Node 22/24 CI workflow accepts an explicit public HTTPS tarball
URL and verifies the committed artifact hash. Retrieval is capped at 8 MiB and
30 seconds, rejects redirects and credential-bearing URLs, and uses no secrets.
This workflow has not run: remote repository/artifact hosting is not configured.
Its download step is configuration, not new runtime resolver support or hosted
portability evidence. The tested local mode accepts a file and works without any
remote SDK checkout; normal dependency installation still requires npm access or
an already populated npm cache.

## REF-002 evidence

The independently authored invoice schema is learned from the Agent Card. The
client constructs a candidate from its own scenario values, selects the contract,
activates it, and validates the response. Server evidence records business entry,
input presence and Part count separately from validation. The tests assert exact
semantic values, Task/Message metadata, representation identity and primary role.

All nine required/optional/none input/output combinations and all four optional
presence combinations run over HTTP. No-input execution carries an actual
companion; no-output completion has no Artifacts. Schemaless false/zero/empty
string/array/object, nested null, empty text, and Boolean true/false schemas have
explicit outcomes. Root null is refused locally before business execution. The
none-input misuse diagnostic is representation selection failure because that
direction advertises no representation; wire-level malicious presence tests
remain REF-003.

Rich/compact JSON and text alternatives demonstrate contract selection and the
intersection with A2A accepted media. Same-media input and output companions do
not become primaries. Standalone Message results include a valid echo. SSE checks
atomic non-append updates, status companions, one final result and correlated
Task/context IDs; no-output SSE uses only real companion/status carriers. The
INPUT_REQUIRED continuation preserves its Task/context and negotiated contract,
then completes on the second activated turn. Completion evidence is scoped to the
bounded inline profile already defined by SDK-004/005.

## Remaining scope

SDK-006 has since completed in the [SDK repository](https://github.com/shashikanth-gs/a2a-schema-contract-sdk/blob/main/docs/resolver-report.md): policy-controlled HTTPS external catalogs/schema graphs.
REF-003 waits for SDK-007 and will add direct invalid-wire, malformed-peer,
invalid-output, cancellation/race and security demonstrations. Hosted Linux and
Windows checks remain unverified; no Windows portability claim is made. Python,
external resources, worker isolation, bundle/XML coverage and optional LLM
construction remain incomplete. No external publication or normative input
change occurred during the original inline checkpoint. Public source repository
hosting was authorized later; package publishing remains disabled.
