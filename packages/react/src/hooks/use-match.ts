"use client"

import { useCallback, useSyncExternalStore } from "react"
import type { MatchDetail } from "@mrdoge/protocol"
import { getMrDogeClient } from "../client"
import { createResourceStore } from "../store"

export interface UseMatchOptions {
  /** The match to fetch. Pass undefined to skip fetching — e.g. while some other lookup is still resolving which match to show. */
  matchId: string | undefined
}

const store = createResourceStore<MatchDetail | null | undefined>()

function start(matchId: string) {
  return (set: (value: MatchDetail | null | undefined) => void) => {
    let cancelled = false

    getMrDogeClient()
      // matches.get takes `id`, not `matchId` — unlike every other
      // matches.* method. Real SDK quirk, not a typo.
      .matches.get({ id: matchId })
      .then((result) => {
        if (!cancelled) set(result)
      })
      .catch(() => {
        if (!cancelled) set(null)
      })

    return () => {
      cancelled = true
    }
  }
}

/**
 * One-shot fetch of a single match — see `matches.get`. Fetched once per
 * matchId, shared by every component asking for it — a later mount with
 * the same matchId gets the cached value immediately instead of
 * refetching. Unlike `useLiveMatch`, nothing pushes updates into it after
 * that.
 *
 * undefined = loading (or no matchId yet), null = the request failed (no
 * fallback — that's an honest empty state, not a fictional one).
 */
export function useMatch({ matchId }: UseMatchOptions): MatchDetail | null | undefined {
  const key = matchId ? `matches.get:${matchId}` : undefined

  // Stable across renders for the same key — see useLiveMatch for why an
  // inline closure here would cause a resubscribe (and lose cached data)
  // on every unrelated re-render.
  const subscribe = useCallback(
    (listener: () => void) => (key ? store.subscribe(key, undefined, start(matchId!), listener) : () => {}),
    [key, matchId]
  )
  const getSnapshot = useCallback(() => (key ? store.getSnapshot(key, undefined) : undefined), [key])

  return useSyncExternalStore(subscribe, getSnapshot, () => undefined)
}
