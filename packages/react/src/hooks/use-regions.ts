"use client"

import { useCallback, useSyncExternalStore } from "react"
import type { Region } from "@mrdoge/protocol"
import { getMrDogeClient } from "../client"
import { createResourceStore } from "../store"

export interface UseRegionsOptions {
  /** Restrict to specific sports, e.g. ["soccer"]. Omit for all sports. */
  sports?: string[]
  /** Restrict to specific match statuses, e.g. ["upcoming"]. Omit for all statuses. */
  status?: ("upcoming" | "live" | "completed")[]
  /** Single day, YYYY-MM-DD. Mutually exclusive with startDate/endDate. */
  date?: string
  /** Start of a date range, YYYY-MM-DD, inclusive. */
  startDate?: string
  /** End of a date range, YYYY-MM-DD, inclusive. */
  endDate?: string
  /** IANA timezone for any timezone-dependent fields server-side. */
  timezone?: string
  /** Locale for any localized fields server-side. */
  locale?: string
}

const store = createResourceStore<Region[] | null | undefined>()

function start(params: UseRegionsOptions) {
  return (set: (value: Region[] | null | undefined) => void) => {
    let cancelled = false

    getMrDogeClient()
      .regions.list(params)
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

function cacheKey(options: UseRegionsOptions): string {
  const { sports, status, date, startDate, endDate, timezone, locale } = options
  return `regions.list:${sports?.join(",") ?? ""}:${status?.join(",") ?? ""}:${date ?? ""}:${startDate ?? ""}:${endDate ?? ""}:${timezone ?? ""}:${locale ?? ""}`
}

/**
 * Every region, with `eventCount`/`competitionCount` populated whenever at
 * least one filter (`date`, `sports`, `status`) is passed — see
 * `regions.list`. Fetched once per unique params, shared by every
 * component asking for the same ones. Doesn't push live updates.
 *
 * undefined = loading, null = the request failed (no fallback — that's an
 * honest empty state, not a fictional one).
 */
export function useRegions(options: UseRegionsOptions = {}): Region[] | null | undefined {
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
