"use client"

import { useCallback, useSyncExternalStore } from "react"
import type { MatchDetail } from "@mrdoge/protocol"
import { getMrDogeClient } from "../client"
import { createResourceStore } from "../store"

export interface UseLiveMatchOptions {
  /** The match to subscribe to. Pass undefined to skip subscribing — e.g. while some other lookup is still resolving which match to show. */
  matchId: string | undefined
}

const store = createResourceStore<MatchDetail | null | undefined>()

function start(matchId: string) {
  return (set: (value: MatchDetail | null | undefined) => void) => {
    let cancelled = false
    let subscription: { cancel: () => Promise<void> } | null = null
    let latest: MatchDetail | undefined

    getMrDogeClient()
      .matches.subscribe({ matchId })
      .then((sub) => {
        if (cancelled) {
          sub.cancel()
          return
        }
        subscription = sub
        latest = sub.snapshot
        set(latest)
        sub.on("snapshot", (snapshot) => {
          latest = snapshot
          set(latest)
        })
        sub.on("stats.upd", (stats) => {
          if (!latest) return
          latest = { ...latest, stats }
          set(latest)
        })
        sub.on("status.upd", ({ status }) => {
          if (!latest) return
          latest = { ...latest, status }
          set(latest)
        })
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
 * undefined = loading (or no matchId yet), null = subscribe failed (no
 * fallback — that's an honest empty state). Every component subscribing to
 * the same matchId shares one underlying `matches.subscribe()` call and one
 * copy of the data.
 */
export function useLiveMatch({ matchId }: UseLiveMatchOptions): MatchDetail | null | undefined {
  const key = matchId ? `matches.subscribe:${matchId}` : undefined

  // Stable across renders for the same key — an inline closure here would
  // get a new identity every render, and React re-subscribes (tearing down
  // the real subscription and losing any data already in the cache)
  // whenever `subscribe`'s identity changes, not just when `key` does.
  const subscribe = useCallback(
    (listener: () => void) => (key ? store.subscribe(key, undefined, start(matchId!), listener) : () => {}),
    [key, matchId]
  )
  const getSnapshot = useCallback(() => (key ? store.getSnapshot(key, undefined) : undefined), [key])

  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    // Server-rendered too (Next.js renders "use client" components on the
    // server for the initial HTML) — there's no subscription there, so
    // always render the loading state and let the client take over.
    () => undefined
  )
}
