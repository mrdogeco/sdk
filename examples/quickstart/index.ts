/**
 * Mr. Doge SDK — Quickstart
 *
 * Walks through the core SDK surface in ~100 lines:
 *   • Connect (lazy — opens on first await)
 *   • Discovery: regions/competitions with per-day event counts
 *   • List today's matches with a field selector (only what you render)
 *   • Fetch one match's full detail (markets, odds, stats with unified clock)
 *   • Subscribe to live updates filtered to a single sport
 *
 * Setup:
 *   1. Sign up at https://mrdoge.ai and create an API key.
 *   2. export MRDOGE_API_KEY=sk_live_your_key_here
 *   3. From this directory: `npm install && npx tsx index.ts`
 *      (or use pnpm/yarn — works the same)
 */

import {
  MrDoge,
  RateLimitError,
  UnauthorizedError,
  type MatchSelect,
} from "@mrdoge/sdk"

const apiKey = process.env.MRDOGE_API_KEY
if (!apiKey) {
  console.error("Set MRDOGE_API_KEY in your environment. Get a key at https://mrdoge.ai")
  process.exit(1)
}

// The constructor doesn't open a connection — the first `await` below does.
// `locale` and `timezone` are global defaults; you can override either per-call.
const mrdoge = new MrDoge({
  apiKey,
  locale: "en",
})

// Lifecycle events are optional. Wire them up if you want to surface
// connection state to users or your observability stack.
mrdoge.on("connected", ({ welcome }) => {
  console.log(`connected — tier ${welcome.tier}, ${welcome.rateLimit.requestsPerMinute} req/min`)
})
mrdoge.on("disconnected", ({ code, reason }) => {
  console.log(`disconnected (${code}): ${reason}`)
})
mrdoge.on("reconnecting", ({ attempt, delayMs }) => {
  console.log(`reconnecting attempt ${attempt} in ${delayMs}ms`)
})

async function main() {
  const today = new Date().toISOString().slice(0, 10)

  // ─── Discovery ─────────────────────────────────────────────────────────
  // With filters (date / sportName / status), regions and competitions come
  // back with `eventCount` so you can size empty states or sort by activity
  // without a separate `matches.list` round-trip.
  console.log(`→ regions.list (date=${today}, sport=soccer)`)
  const regions = await mrdoge.regions.list({ date: today, sportName: "soccer" })
  console.log(`   ${regions.length} regions with soccer today`)
  for (const r of regions.slice(0, 3)) {
    console.log(`     ${r.name} — ${r.eventCount ?? 0} events, ${r.competitionCount ?? 0} competitions`)
  }

  console.log(`→ competitions.list (date=${today}, sport=soccer, limit=5)`)
  const competitions = await mrdoge.competitions.list({
    date: today,
    sportName: "soccer",
    limit: 5,
  })
  for (const c of competitions) {
    console.log(`     ${c.name} (region ${c.regionId}) — ${c.eventCount ?? 0} events`)
  }

  // ─── Matches with a field selector ─────────────────────────────────────
  // Selectors (GraphQL-style) project the response shape server-side.
  // For a match-list view that only renders teams and clock, drop markets
  // and player arrays to shrink the payload by 10-20×.
  const listSelect: MatchSelect = {
    id: true,
    startTime: true,
    status: true,
    homeTeam: true,
    awayTeam: true,
    sport: true,
    competition: { name: true },
    region: { name: true },
    stats: { clock: { display: true }, homeScore: true, awayScore: true },
  }

  console.log(`→ matches.list (date=${today}, sport=soccer) with select`)
  const page = await mrdoge.matches.list({
    date: today,
    sportName: "soccer",
    limit: 5,
    select: listSelect,
  })
  console.log(`   ${page.data.length} matches (hasMore=${page.pagination.hasMore})`)
  for (const m of page.data) {
    const score =
      m.stats != null ? `${m.stats.homeScore}-${m.stats.awayScore}` : "—"
    const clock = m.stats?.clock?.display ?? m.status
    console.log(
      `     ${m.homeTeam.name} vs ${m.awayTeam.name}  ${score}  [${clock}]`,
    )
  }

  if (page.data[0]) {
    console.log(`→ matches.get (${page.data[0].id})`)
    const detail = await mrdoge.matches.get({ id: page.data[0].id })
    console.log(`   ${detail.markets.length} markets · ${detail.stats ? "with stats" : "no stats"}`)
  }

  // ─── Live subscription (server-side filter + projected pushes) ─────────
  // Subscribing returns a handle with the initial snapshot plus typed `.on(...)`
  // listeners for incoming pushes. Each push carries the FULL latest state
  // (projected by the selector) — replace your local copy, don't merge.
  console.log("→ matches.subscribeLive (sport=soccer)")
  const live = await mrdoge.matches.subscribeLive({
    sportName: "soccer",
    select: listSelect,
  })
  console.log(`   snapshot: ${live.snapshot.length} live soccer matches`)

  live.on("match.upd", (m) => {
    const display = m.stats?.clock?.display ?? m.status
    const score =
      m.stats != null ? `${m.stats.homeScore}-${m.stats.awayScore}` : "—"
    console.log(`     [updated] ${m.homeTeam.name} vs ${m.awayTeam.name}  ${score}  [${display}]`)
  })
  live.on("match.del", ({ id }) => {
    console.log(`     [removed] ${id} (match ended)`)
  })
  // Fired on reconnect — server sends a fresh snapshot so you can replace state.
  live.on("snapshot", (snap) => {
    console.log(`     [resnapshot] ${snap.length} matches after reconnect`)
  })

  console.log("listening for live updates for 30s ...")
  await new Promise((r) => setTimeout(r, 30_000))

  // Cancel subscriptions you don't need, then close the client on exit.
  await live.cancel()
  await mrdoge.close()
  console.log("done")
}

// Errors are typed classes. Discriminate by `instanceof` or by `.code`.
main().catch((err) => {
  if (err instanceof UnauthorizedError) {
    console.error("Invalid API key. Check your MRDOGE_API_KEY.")
  } else if (err instanceof RateLimitError) {
    console.error(`Rate limited — retry after ${err.retryAfterMs}ms`)
  } else {
    console.error("Unexpected error:", err)
  }
  process.exit(1)
})
