# A2A Schema Contract reference applications

Independent Node clients and agents now consume the installed SDK tarball over
A2A 1.0 JSON-RPC/HTTP and SSE. REF-001/002 cover 37 deterministic inline scenarios
and the process/artifact harness. Python remains a scaffold. External resolution
and security/operations demonstrations are the next planned work.

| Directory | Purpose |
| --- | --- |
| `js/` | Runnable compiled TypeScript agent, JavaScript/TypeScript clients and isolated artifact gates |
| `fixtures/` | Versioned domain catalog and language-neutral scenario/expected-result manifest |
| `docs/` | Inline tutorial and exact validation evidence |
| `python/` | Planned independent Python reference applications |
| `interoperability/` | Later four-pairing parity coverage |

Start with the [Node quickstart](js/README.md), [wire-flow tutorial](docs/inline-tutorial.md)
and [validation report](docs/inline-reference-report.md). Task status and remaining
scope are recorded in [PLAN.md](PLAN.md).

The reusable SDK lives in a separate repository. This application installs a
hash-verified npm artifact and imports only public package paths; it never reads
SDK implementation sources or normative schemas from sibling checkouts. The
specification remains authoritative and is pinned in [contract-source.json](contract-source.json).

Normal scenarios require no cloud account, public schema service, paid API or
model credentials. No repository or package has been published. The manual
artifact-consumer workflow is configured but has no hosted execution evidence.
