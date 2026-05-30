# Quickstart

Minimal runnable example showing the core of the Mr. Doge SDK in ~70 lines:

- Lazy connection
- Discovery (regions, competitions)
- Paginated match list
- Single-match detail with markets + stats
- Live subscription with typed event callbacks
- Reconnection and graceful shutdown

## Run it

```bash
# 1. Sign up at https://mrdoge.ai/developers, then mint a key at https://mrdoge.ai/dashboard/keys
export MRDOGE_API_KEY=sk_live_your_key_here

# 2. From this directory
npm install
npx tsx index.ts
```

The script will list today's matches, fetch one in detail, then stream live updates for 30 seconds before exiting cleanly.

## What you'll see

```
connected — tier growth, 1000 req/min
→ regions.list
   213 regions, e.g. England
→ competitions.list
   3315 competitions, e.g. Premier League
→ matches.list (date=2026-05-12)
   5 matches (hasMore=true)
     Arsenal vs Chelsea [upcoming] Premier League
     ...
→ matches.subscribeLive
   snapshot: 121 matches live right now
listening for live updates for 30s ...
     [updated] Real Madrid vs Barcelona
     [removed] 12345 (match ended)
     ...
done
```

## License

Apache 2.0 — same as the rest of the SDK.
