# Contributing

Use the [Node quickstart](js/README.md) to install the hash-pinned SDK artifact,
then run `npm run check` and `npm run check:clean` from `js/` on a supported Node
22 or 24 runtime. See the [roadmap](PLAN.md) and
[validation report](docs/inline-reference-report.md) before changing supported
behavior.

Keep the reference independent of SDK internals. Application code imports public
installed-package paths. Domain catalogs and expected scenario outcomes belong
in `fixtures/`; assertions should establish behavior, values, execution timing
and cleanup. Normative extension changes belong in the
[specification repository](https://github.com/shashikanth-gs/a2a-schema-contract).
Reusable validation changes belong in the
[SDK repository](https://github.com/shashikanth-gs/a2a-schema-contract-sdk).

Use `npm run format` for formatting. Follow the committed lockfile and keep the
artifact's version, source revision and SHA-256 in `js/artifact-input.json` aligned.
An SDK artifact update needs new consumer evidence; changing a hash alone does
not establish compatibility. Record the exact commands, runtime, scenario
results and remaining limitations in the owning task/report.

Open an issue describing the scenario or bug, with a small reproduction and
expected behavior. Keep example data synthetic and omit credentials/private
payloads. Send security findings through [SECURITY.md](SECURITY.md). Package
publication and broader release work remain separate from repository changes.
