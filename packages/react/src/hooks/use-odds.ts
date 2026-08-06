"use client"

import { useCallback, useSyncExternalStore } from "react"
import type { Market } from "@mrdoge/protocol"
import { getMrDogeClient } from "../client"
import { createResourceStore } from "../store"

export interface UseOddsOptions {
  /** The match to subscribe odds for. Pass undefined to skip subscribing. */
  matchId: string | undefined
  /**
   * Restrict which markets come back. Omit to get every market on the
   * match. Some bet types post one market per line instead of one market
   * total — filtering to a single-market bet type (like
   * `SOCCER_MATCH_RESULT`) is what makes indexing `markets?.[0]` safe. Some
   * bet types also split by sysname across match state, e.g.
   * `["SOCCER_MATCH_RESULT", "SOCCER_MATCH_RESULT_PRELIVE"]` for the
   * standard 1X2 line regardless of live/not-live.
   */
  betTypes?: string[]
}

const store = createResourceStore<Market[] | null | undefined>()

function start(matchId: string, betTypes: string[] | undefined) {
  return (set: (value: Market[] | null | undefined) => void) => {
    let cancelled = false
    let subscription: { cancel: () => Promise<void> } | null = null

    getMrDogeClient()
      .odds.subscribe({ matchId, betTypes })
      .then((sub) => {
        if (cancelled) {
          sub.cancel()
          return
        }
        subscription = sub
        set(sub.snapshot.length > 0 ? sub.snapshot : null)
        sub.on("snapshot", (next) => set(next.length > 0 ? next : null))
        sub.on("odds.upd", (next) => set(next.length > 0 ? next : null))
      })
      .catch(() => {
        if (!cancelled) set(null)
      })

    return () => {
      cancelled = true
      subscription?.cancel()
    }
  }
}

/**
 * One subscription covers both pre-live and in-play odds — whichever
 * markets are currently posted for the match, pushed over WS as they
 * change. undefined = loading, null = no markets match this filter for
 * this match (Business tier only — no fallback, that's an honest empty
 * state). Every component subscribing to the same matchId + betTypes
 * shares one underlying `odds.subscribe()` call and one copy of the data.
 */
export function useOdds({ matchId, betTypes }: UseOddsOptions): Market[] | null | undefined {
  const betTypesKey = betTypes?.join(",") ?? ""
  const key = matchId ? `odds.subscribe:${matchId}:${betTypesKey}` : undefined

  // Stable across renders for the same key — see useLiveMatch for why an
  // inline closure here would cause a resubscribe (and lose cached data)
  // on every unrelated re-render. Depends on betTypesKey (the stable
  // stringified form), not betTypes itself — a fresh array literal at the
  // call site would otherwise defeat the memoization the same way.
  const subscribe = useCallback(
    (listener: () => void) =>
      key ? store.subscribe(key, undefined, start(matchId!, betTypes), listener) : () => {},
    // eslint-disable-next-line react-hooks/exhaustive-deps -- betTypesKey is the stable form of betTypes
    [key, matchId, betTypesKey]
  )
  const getSnapshot = useCallback(() => (key ? store.getSnapshot(key, undefined) : undefined), [key])

  return useSyncExternalStore(subscribe, getSnapshot, () => undefined)
}
