/**
 * Mr. Doge SDK — Quickstart
 *
 * Walks through the core SDK surface in ~70 lines:
 *   • Connect (lazy — opens on first await)
 *   • Discovery: list regions and competitions
 *   • List today's matches, paginated
 *   • Fetch one match's full detail (markets, odds, stats)
 *   • Subscribe to live updates and stream them for 30 seconds
 *
 * Setup:
 *   1. Sign up at https://mrdoge.ai and create an API key.
 *   2. export MRDOGE_API_KEY=sk_live_your_key_here
 *   3. From this directory: `npm install && npx tsx index.ts`
 *      (or use pnpm/yarn — works the same)
 */

import { MrDoge, RateLimitError, UnauthorizedError } from "@mrdoge/sdk"

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
  // ─── Discovery ─────────────────────────────────────────────────────────
  console.log("→ regions.list")
  const regions = await mrdoge.regions.list()
  console.log(`   ${regions.length} regions, e.g. ${regions[0]?.name}`)

  console.log("→ competitions.list")
  const competitions = await mrdoge.competitions.list()
  console.log(`   ${competitions.length} competitions, e.g. ${competitions[0]?.name}`)

  // ─── Matches ───────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  console.log(`→ matches.list (date=${today})`)
  const page = await mrdoge.matches.list({ date: today, limit: 5 })
  console.log(`   ${page.data.length} matches (hasMore=${page.pagination.hasMore})`)
  for (const m of page.data) {
    console.log(`     ${m.homeTeam.name} vs ${m.awayTeam.name} [${m.status}] ${m.competition.name}`)
  }

  if (page.data[0]) {
    console.log(`→ matches.get (${page.data[0].id})`)
    const detail = await mrdoge.matches.get({ id: page.data[0].id })
    console.log(`   ${detail.markets.length} markets · ${detail.stats ? "with stats" : "no stats"}`)
  }

  // ─── Live subscription ─────────────────────────────────────────────────
  // Subscribing returns a handle with the initial snapshot plus typed `.on(...)`
  // listeners for incoming pushes. Each push carries the FULL latest state —
  // replace your local copy, don't merge.
  console.log("→ matches.subscribeLive")
  const live = await mrdoge.matches.subscribeLive({})
  console.log(`   snapshot: ${live.snapshot.length} matches live right now`)

  live.on("match.upd", (m) => {
    console.log(`     [updated] ${m.homeTeam.name} vs ${m.awayTeam.name}`)
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
