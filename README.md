# Mr. Doge SDK

Open-source SDKs and protocol for the [Mr. Doge](https://mrdoge.ai) realtime sports data API.

## Packages

| Package | What it is |
|---|---|
| [`@mrdoge/sdk`](./packages/node) | Official Node / TypeScript SDK |
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
