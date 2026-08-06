"use client"

import { useCallback, useSyncExternalStore } from "react"
import type { Match } from "@mrdoge/protocol"
import { getMrDogeClient } from "../client"
import { createResourceStore } from "../store"

export interface UseLiveMatchesOptions {
  /** Restrict to specific sports, e.g. ["soccer"]. Omit for all sports. */
  sports?: string[]
  /** Restrict to matches in these regions. */
  regionIds?: number[]
  /** Restrict to matches in these competitions. */
  competitionIds?: number[]
}

const store = createResourceStore<Match[] | null | undefined>()

function start(params: UseLiveMatchesOptions) {
  return (set: (value: Match[] | null | undefined) => void) => {
    let cancelled = false
    let subscription: { cancel: () => Promise<void> } | null = null
    let latest: Match[] = []

    getMrDogeClient()
      .matches.subscribeLive(params)
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
        sub.on("match.upd", (match) => {
          const index = latest.findIndex((m) => m.id === match.id)
          latest = index === -1 ? [...latest, match] : latest.map((m, i) => (i === index ? match : m))
          set(latest)
        })
        sub.on("match.del", ({ id }) => {
          latest = latest.filter((m) => m.id !== id)
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

function cacheKey(options: UseLiveMatchesOptions): string {
  const { sports, regionIds, competitionIds } = options
  return `matches.subscribeLive:${sports?.join(",") ?? ""}:${regionIds?.join(",") ?? ""}:${competitionIds?.join(",") ?? ""}`
}

/**
 * Live matches right now, filtered by sports/region/competition — see
 * `matches.subscribeLive`. Updates in place as matches start/finish or
 * their score/clock changes. Every component asking for the same filters
 * shares one underlying subscription and one copy of the data.
 *
 * undefined = loading, null = subscribe failed (no fallback — that's an
 * honest empty state, not a fictional one).
 */
export function useLiveMatches(options: UseLiveMatchesOptions = {}): Match[] | null | undefined {
  const key = cacheKey(options)

  // Stable across renders for the same key — see useLiveMatch for why an
  // inline closure here would cause a resubscribe (and lose cached data)
  // on every unrelated re-render.
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(key, undefined, start(options), listener),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key is the stable form of options
    [key]
  )
  const getSnapshot = useCallback(() => store.getSnapshot(key, undefined), [key])

  return useSyncExternalStore(subscribe, getSnapshot, () => undefined)
}
