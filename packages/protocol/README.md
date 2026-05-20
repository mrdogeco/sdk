# @mrdoge/protocol

Wire-format spec and shared schemas for the Mr. Doge SDK.

This package is what makes language-neutral SDKs possible:

- **[PROTOCOL.md](./PROTOCOL.md)** — the human-readable wire spec. Read this to build an SDK in any language.
- **TypeScript schemas** (source of truth for resource shapes and method signatures).
- **JSON Schema artifact** (emitted at build time as `dist/schema.json`). Use this to generate types in Python, Go, Rust, etc.

## Why this exists separately

All three official SDKs — [`@mrdoge/node`](../node), [`@mrdoge/client`](../client), and [`@mrdoge/http`](../http) — import from here. Future Python / Go / Rust SDKs read `dist/schema.json` and generate their own types. The server validates incoming requests and outgoing responses against the same schemas — one source of truth, everywhere.

## Install

```bash
npm install @mrdoge/protocol
```

You usually don't import this directly — the [`@mrdoge/node`](../node), [`@mrdoge/client`](../client), and [`@mrdoge/http`](../http) SDKs re-export the types you need. Use this package directly if you're building a custom client or generating types for a non-TypeScript SDK.

## License

Apache 2.0
