# A2A Schema Contract Reference Implementation

Runnable clients and agents that demonstrate the Schema Contract SDK packages over A2A.

**Status: scaffold only.** No runnable implementations exist yet.

## Layout

| Directory | Purpose |
|---|---|
| `js/` | Node clients and servers consuming the JavaScript SDK package |
| `python/` | Python clients and servers consuming the Python SDK package |
| `interoperability/` | Cross-language scenarios and expected outcomes |

The SDK libraries live in the separate `shashikanth-gs/a2a-schema-contract-sdk` repository. Consumers will install built package artifacts or released packages; they must not import internal SDK source files.

The specification remains https://github.com/shashikanth-gs/a2a-schema-contract. The initial supported draft is recorded in [contract-source.json](contract-source.json).

Start with deterministic JSON request/response agents, then add optional LLM-driven input construction. Validation must cover invalid inputs, invalid generated outputs, activation, negotiation, and presence semantics.

No dependencies, run commands, or CI workflows are configured yet.

See [PLAN.md](PLAN.md) for the tracked reference applications, interoperability tasks and completion criteria.
