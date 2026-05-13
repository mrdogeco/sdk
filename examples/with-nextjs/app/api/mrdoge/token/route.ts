import { MrDoge } from "@mrdoge/sdk"
import { NextResponse } from "next/server"

const apiKey = process.env.MRDOGE_API_KEY

// Server-side singleton. The connection opens lazily on the first .tokens.create()
// call and is reused for subsequent token mints — no per-request overhead.
const mrdoge = new MrDoge({
  apiKey: apiKey!,
})

/**
 * POST /api/mrdoge/token
 *
 * Mints a short-lived auth token for the browser client. In a real app you'd
 * gate this route with your own auth (session cookie, CSRF token, rate limit,
 * whatever your product needs). For this demo we leave it open.
 */
export async function POST() {
  if (!apiKey) {
    return NextResponse.json(
      { error: "MRDOGE_API_KEY is not configured on the server" },
      { status: 500 },
    )
  }
  try {
    const { token, expiresAt } = await mrdoge.tokens.create({ ttl: 600 })
    return NextResponse.json({ token, expiresAt })
  } catch (err) {
    console.error("token mint failed:", err)
    return NextResponse.json(
      { error: (err as Error).message ?? "Failed to mint token" },
      { status: 500 },
    )
  }
}
