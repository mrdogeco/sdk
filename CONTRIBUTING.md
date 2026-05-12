# Contributing

Thanks for considering a contribution.

## Reporting issues

- Bugs in the Node SDK or protocol → [open an issue](https://github.com/mrdoge/sdk/issues).
- API behavior, account, billing → support@mrdoge.ai (these aren't open-source concerns).
- Security vulnerabilities → see [SECURITY.md](./SECURITY.md), do **not** open a public issue.

## Building locally

```bash
pnpm install
pnpm build
pnpm test
```

## Project layout

```
packages/
  protocol/   Wire spec + Zod schemas + JSON Schema artifact
  node/       Node / TypeScript SDK
examples/     Runnable example apps
```

The Node SDK depends on `@mrdoge/protocol` via a workspace reference. Edits in `protocol` propagate without a publish step.

## Pull requests

- One logical change per PR.
- Include tests for behavior changes.
- For protocol changes, also update `packages/protocol/PROTOCOL.md` and bump the change log at the bottom of that doc.
- The SDK's public surface is committed to — additive changes are easy, removals require deprecation notice + major version bump.

## Code style

- TypeScript strict mode.
- No raw `any`. Use `unknown` and narrow.
- One source of truth for types: Zod schemas in `@mrdoge/protocol`. Don't redefine response shapes in the SDK.

## License

By submitting a PR, you agree to license your contribution under [Apache 2.0](./LICENSE).
