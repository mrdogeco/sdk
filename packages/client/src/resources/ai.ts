import type { AiPick, MethodParams, MethodResult } from "@mrdoge/protocol"
import type { CallOptions, Connection, ListAllOptions } from "../connection"

class Picks {
  constructor(private readonly conn: Connection, private readonly defaults: { locale?: string }) {}

  list(
    params: MethodParams<"ai.picks.list"> = {},
    options?: CallOptions,
  ): Promise<MethodResult<"ai.picks.list">> {
    return this.conn.call(
      "ai.picks.list",
      { locale: this.defaults.locale, ...params },
      options,
    )
  }

  /**
   * Walk every page of `ai.picks.list` and return one combined array. Same
   * shape as `matches.listAll` — pass params (no `cursor`, the helper drives
   * it), an optional AbortSignal, and an optional `onPage` callback for
   * progressive rendering. Server-side keyset pagination keeps the walk
   * drift-safe.
   */
  async listAll(
    params: Omit<MethodParams<"ai.picks.list">, "cursor"> = {},
    options?: ListAllOptions<AiPick>,
  ): Promise<AiPick[]> {
    const { onPage, ...callOptions } = options ?? {}
    const result: AiPick[] = []
    let cursor: string | undefined
    do {
      const page = await this.list({ ...params, cursor }, callOptions)
      const pageData = page.data as AiPick[]
      result.push(...pageData)
      onPage?.(pageData, result)
      cursor = page.pagination.nextCursor ?? undefined
    } while (cursor)
    return result
  }
}

class Recommendations {
  constructor(private readonly conn: Connection, private readonly defaults: { locale?: string }) {}

  list(
    params: MethodParams<"ai.recommendations.list"> = {},
    options?: CallOptions,
  ): Promise<MethodResult<"ai.recommendations.list">> {
    return this.conn.call(
      "ai.recommendations.list",
      { locale: this.defaults.locale, ...params },
      options,
    )
  }
}

export class Ai {
  readonly picks: Picks
  readonly recommendations: Recommendations

  constructor(conn: Connection, defaults: { locale?: string }) {
    this.picks = new Picks(conn, defaults)
    this.recommendations = new Recommendations(conn, defaults)
  }
}
