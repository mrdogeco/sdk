<p align="center">
  <img src="./logo.svg" alt="Mr. Doge SDK" width="240" />
</p>

<p align="center">
  Realtime sports data over WebSocket. One connection, typed everything, no polling.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@mrdoge/sdk"><code>@mrdoge/sdk</code></a> •
  <a href="https://docs.mrdoge.co">Docs</a> •
  <a href="https://x.com/mrdogeapp">@mrdogeapp</a>
</p>

## Packages

| Package | What it is |
|---|---|
| [`@mrdoge/sdk`](./packages/node) | Node / TypeScript SDK — server-side. Holds your `sk_live_...` key, mints tokens, makes data calls. |
| [`@mrdoge/client`](./packages/client) | Browser / React Native / edge SDK — client-side. No API key; authenticates via tokens minted by your backend. |
| [`@mrdoge/protocol`](./packages/protocol) | Wire-format spec + Zod schemas + JSON Schema artifact. Read this to build an SDK in any language. |

## Get started

```bash
npm install @mrdoge/sdk
```

```ts
import { MrDoge } from "@mrdoge/sdk"

const mrdoge = new MrDoge({ apiKey: process.env.MRDOGE_API_KEY })
const matches = await mrdoge.matches.list({ date: "2026-05-12" })
```

Full example tour: [packages/node/README.md](./packages/node/README.md).

## Build your own SDK

The wire protocol is JSON-RPC 2.0 over WebSocket, fully specified in [PROTOCOL.md](./packages/protocol/PROTOCOL.md). Resource shapes are published as JSON Schema. Anyone can build a client in Go, Python, Rust, anything — the protocol is open and stable.

If you ship a community SDK, [open an issue](https://github.com/mrdoge/sdk/issues) so we can link it.

## Contributing

Bug reports and pull requests welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

Apache 2.0 — see [LICENSE](./LICENSE).

## Support

- API access, billing, account: support@mrdoge.ai
- Bugs, feature requests: [GitHub Issues](https://github.com/mrdoge/sdk/issues)
- Security disclosures: see [SECURITY.md](./SECURITY.md)
