"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  MrDoge,
  type Match,
  type MatchDetail,
  type MatchSelect,
} from "@mrdoge/client"

// Project the list response server-side. The match-list view doesn't render
// odds inline, so we drop `markets` and most of `stats` — only the clock
// display + score travel over the wire. Detail screen fetches full Match
// via matches.get when a row expands.
const LIST_SELECT: MatchSelect = {
  id: true,
  startTime: true,
  status: true,
  homeTeam: true,
  awayTeam: true,
  competition: { name: true },
  stats: { clock: { display: true }, homeScore: true, awayScore: true },
}

type ConnState = "idle" | "connecting" | "connected" | "error"

export default function Page() {
  const [connState, setConnState] = useState<ConnState>("idle")
  const [tier, setTier] = useState<string | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<MatchDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mrdogeRef = useRef<MrDoge | null>(null)

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  useEffect(() => {
    setConnState("connecting")

    // The client never sees the API key. It calls /api/mrdoge/token, our
    // server-side route mints a JWT via @mrdoge/node, returns it here.
    const mrdoge = new MrDoge({
      authEndpoint: "/api/mrdoge/token",
    })
    mrdogeRef.current = mrdoge

    mrdoge.on("connected", ({ welcome }) => {
      setConnState("connected")
      setTier(welcome.tier)
    })
    mrdoge.on("disconnected", () => setConnState("connecting"))
    mrdoge.on("reconnecting", () => setConnState("connecting"))

    let cancelled = false

    async function load() {
      try {
        const page = await mrdoge.matches.list({
          date: today,
          limit: 20,
          select: LIST_SELECT,
        })
        if (cancelled) return
        setMatches(page.data)
      } catch (err) {
        setConnState("error")
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    load()

    return () => {
      cancelled = true
      mrdoge.close().catch(() => {})
    }
  }, [today])

  // Lazy-load full match detail when a row is expanded.
  useEffect(() => {
    if (!selectedId || !mrdogeRef.current) {
      setDetail(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    setDetail(null)
    mrdogeRef.current.matches
      .get({ id: selectedId })
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  return (
    <main>
      <h1>Mr. Doge SDK — Next.js example</h1>
      <p className="subtitle">
        Browser client using <code>@mrdoge/client</code>. Token minted by{" "}
        <code>/api/mrdoge/token</code> (server-side, uses{" "}
        <code>@mrdoge/node</code>). API key never leaves the server.
      </p>

      <div className={`status ${connState}`}>
        <span className="dot" />
        <span>
          {connState === "connected" && tier && `Connected — tier "${tier}"`}
          {connState === "connecting" && "Connecting..."}
          {connState === "error" && "Connection error"}
          {connState === "idle" && "Idle"}
        </span>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="section">
        <h2>
          Today's matches ({matches.length}) — {today}
        </h2>
        {matches.length === 0 && connState === "connected" && (
          <p style={{ color: "#777", fontSize: "0.9rem" }}>
            No matches today, or none matched your filter.
          </p>
        )}
        {matches.map((m) => {
          const expanded = selectedId === m.id
          return (
            <div
              key={m.id}
              className={`match ${expanded ? "expanded" : ""}`}
              onClick={() => setSelectedId(expanded ? null : m.id)}
            >
              <div>
                <div className="teams">
                  {m.homeTeam.name} <span style={{ color: "#555" }}>vs</span>{" "}
                  {m.awayTeam.name}
                  {m.stats && (
                    <span style={{ marginLeft: 8, color: "#aaa" }}>
                      {m.stats.homeScore}–{m.stats.awayScore}
                      {m.stats.clock?.display && (
                        <span style={{ marginLeft: 8, color: "#777" }}>
                          {m.stats.clock.display}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div className="meta">{m.competition.name}</div>
                {expanded && (
                  <div className="detail">
                    {detailLoading && <span>Loading detail…</span>}
                    {detail && (
                      <>
                        <div>{detail.markets.length} markets available</div>
                        {detail.stats && (
                          <div>
                            Score: {detail.stats.homeScore} –{" "}
                            {detail.stats.awayScore}
                            {detail.stats.clock?.display && (
                              <> · {detail.stats.clock.display}</>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="meta">
                <span className={m.status === "live" ? "live" : ""}>
                  {m.status}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
