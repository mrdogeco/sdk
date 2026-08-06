# @mrdoge/react

React hooks for [`@mrdoge/client`](../client) — live matches, live odds, and one-shot lookups, backed by a shared cache so components watching the same data never duplicate a subscription or a fetch.

```bash
npm install @mrdoge/react
```

No Provider required. The client and its cache are both module-level, same zero-setup shape as calling `@mrdoge/client` directly — you still need a token-mint route on your backend (see [`@mrdoge/client`'s README](../client/README.md#setup)).

## Usage

```tsx
import { useLiveMatch } from "@mrdoge/react"

function Match({ matchId }: { matchId: string }) {
  const match = useLiveMatch({ matchId })

  if (match === undefined) return <p>Loading…</p>
  if (match === null) return <p>Couldn't load this match.</p>

  return <p>{match.homeTeam.name} vs {match.awayTeam.name}</p>
}
```

Mount `useLiveMatch({ matchId: "123" })` in ten different components and they share one `matches.subscribe()` call and one copy of the data — the first mount starts it, the last unmount cancels it.

## Hooks

| Hook | Wraps | Shape |
|---|---|---|
| `useLiveMatch` | `matches.subscribe()` | Shared subscription |
| `useMatch` | `matches.get()` | Shared one-shot fetch |
| `useLiveOdds` | `odds.subscribe()` | Shared subscription |
| `useTrendingMatches` | `matches.trending()` | Shared one-shot fetch |
| `useMatches` | `matches.list()` | Shared one-shot fetch |
| `useOddsMovement` | — | Pure diff, no cache |

One-shot hooks cache their result for the lifetime of the page — a second mount with the same params reads the cache instead of refetching. There's no invalidation yet; call `getMrDogeClient()` directly for anything that needs a forced refresh.

## Custom client config

```ts
import { configureMrDoge } from "@mrdoge/react"

// Call once, before any hook runs — e.g. at the top of your app's entry file.
configureMrDoge({ authEndpoint: "/api/mrdoge/token" })
```

Same options as [`MrDogeOptions`](../client/README.md) in `@mrdoge/client`. Omit this entirely and it defaults to `authEndpoint: "/api/mrdoge/token"`.
