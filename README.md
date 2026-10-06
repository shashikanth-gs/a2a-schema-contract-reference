# A2A Schema Contract Reference Applications

Runnable **A2A (Agent2Agent) clients and agents** demonstrating Schema Contract
discovery, JSON Schema input/output validation, representation negotiation and
HTTP/SSE exchanges. The applications install the
[A2A Schema Contract SDK](https://github.com/shashikanth-gs/a2a-schema-contract-sdk)
as an npm artifact and use its public APIs.

The invoice agent advertises a versioned catalog in its Agent Card. A client
learns the schema at runtime, constructs a request, selects the contract and
representation, activates the extension, and validates the result. Deterministic
scenarios make the behavior reproducible without a model provider or cloud
credentials.

**Development preview:** the Node applications cover **37 inline scenarios**
against a hash-pinned SDK checkpoint. Python applications, external-resolution
security scenarios and cross-language interoperability are planned. Package
releases are not published. The community specification remains authoritative:
[A2A Schema Contract](https://github.com/shashikanth-gs/a2a-schema-contract).

## What the examples demonstrate

- Discovery of an unfamiliar agent's input/output schemas and explicit contract activation.
- All nine required/optional/absent input-output combinations.
- JSON/text alternatives, representation negotiation and companion Parts.
- Empty values and nested JSON null, with explicit unsupported-carrier refusal.
- Task and Message results, bounded atomic SSE results and INPUT_REQUIRED continuation.
- Plain JavaScript and compiled TypeScript clients consuming the installed SDK.

The reference imports public package paths and keeps its own expected results.
Application execution does not depend on an SDK source checkout or workspace
schema files.

## Get started

Use Node **22 >=22.23.3** or **24 >=24.21.0**, npm and ESM. The reference currently
accepts the SDK's original inline checkpoint. Build that exact revision so the
artifact matches the committed SHA-256 pin.

From a directory where you want both checkouts:

```sh
git clone https://github.com/shashikanth-gs/a2a-schema-contract-sdk.git
git -C a2a-schema-contract-sdk checkout --detach eb0dda05c0bf77d5250184006bb499691f454d3c
cd a2a-schema-contract-sdk/js
npm ci
npm run build
mkdir -p artifacts
npm pack --ignore-scripts --pack-destination artifacts
cd ../..
export SDK_ARTIFACT="$PWD/a2a-schema-contract-sdk/js/artifacts/shashikanth-gs-a2a-schema-contract-0.1.0-dev.0.tgz"
git clone https://github.com/shashikanth-gs/a2a-schema-contract-reference.git
cd a2a-schema-contract-reference/js
npm run artifact:install
npm run scenarios
```

`artifact:install` verifies the tarball before installing dependencies. The runner
starts an agent on a dynamic loopback port, executes the 37 scenarios and shuts
down its processes. Expected summary:

```json
{"result":"PASS","scenarios":37,"node":"v22.23.3"}
```

The `node` field reflects the supported runtime you use. Run one scenario with
`npm run scenarios -- --scenario invoice-json-discovery`. The
[Node quickstart](js/README.md) covers separate agent/client processes and all
commands. SDK source is used only to produce the initial artifact; the installed
reference runs independently thereafter.

## Documentation

| Guide | What it covers |
|---|---|
| [Node quickstart](js/README.md) | Artifact intake, agent/client commands and local execution |
| [Wire-flow tutorial](docs/inline-tutorial.md) | Discovery, schema construction, activation, validation and scenario behavior |
| [Validation report](docs/inline-reference-report.md) | Exact artifact/revision pins, test evidence and supported limits |
| [Scenario manifest](fixtures/scenarios.json) | Independent expected outcomes for the 37 scenarios |
| [SDK implementation](https://github.com/shashikanth-gs/a2a-schema-contract-sdk) | Reusable core, client/server adapters and HTTPS resolver |
| [Community specification](https://github.com/shashikanth-gs/a2a-schema-contract) | Normative draft and extension schemas |
| [Roadmap](PLAN.md) | Reference deliverables and remaining coverage |

The pinned artifact version, SHA-256 and SDK revision are in
[js/artifact-input.json](js/artifact-input.json). This reference checkpoint uses
SDK commit `eb0dda05c0bf77d5250184006bb499691f454d3c`, while the SDK's current main
branch also includes secure external resolution. A new artifact requires reviewed
pin updates and fresh consumer validation.

## Validate and contribute

After `artifact:install`, from `js/`:

```sh
npm run check
npm run check:clean
```

Both Node 22.23.3 and 24.21.0 passed **47 tests, including the 37 scenarios**, in
fresh reference-only consumers on macOS. The manual
[artifact-consumer workflow](.github/workflows/node-artifact-smoke.yml) accepts a
reviewed public HTTPS tarball URL and verifies the committed hash. Hosted
portability and security/operational evidence remain separate roadmap gates.

See [CONTRIBUTING.md](CONTRIBUTING.md) for scenario and artifact changes and
[SECURITY.md](SECURITY.md) for private vulnerability reporting. Use
[issues](https://github.com/shashikanth-gs/a2a-schema-contract-reference/issues)
for bugs and feature requests, and
[discussions](https://github.com/shashikanth-gs/a2a-schema-contract-reference/discussions)
for questions about the examples.

## Repository layout

| Directory | Contents |
|---|---|
| `js/` | TypeScript agent, JavaScript/TypeScript clients and isolated artifact checks |
| `fixtures/` | Versioned invoice catalog and language-neutral scenario expectations |
| `docs/` | Tutorial and reproducible validation evidence |
| `python/` | Scaffold for planned Python applications |
| `interoperability/` | Planned four-pairing language interoperability coverage |

Licensed under [Apache-2.0](LICENSE).
