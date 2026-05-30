import type { Recommendation, MethodParams, MethodResult } from "@mrdoge/protocol"
import type { CallOptions, Connection, ListAllOptions } from "../connection"

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

  /**
   * Walk every page of `ai.recommendations.list` and return one combined
   * array. Same shape as `matches.listAll` — pass params (no `cursor`, the
   * helper drives it), an optional AbortSignal, and an optional `onPage`
   * callback for progressive rendering. Server-side keyset pagination keeps
   * the walk drift-safe.
   */
  async listAll(
    params: Omit<MethodParams<"ai.recommendations.list">, "cursor"> = {},
    options?: ListAllOptions<Recommendation>,
  ): Promise<Recommendation[]> {
    const { onPage, ...callOptions } = options ?? {}
    const result: Recommendation[] = []
    let cursor: string | undefined
    do {
      const page = await this.list({ ...params, cursor }, callOptions)
      const pageData = page.data as Recommendation[]
      result.push(...pageData)
      onPage?.(pageData, result)
      cursor = page.pagination.nextCursor ?? undefined
    } while (cursor)
    return result
  }

  get(
    params: MethodParams<"ai.recommendations.get">,
    options?: CallOptions,
  ): Promise<MethodResult<"ai.recommendations.get">> {
    return this.conn.call(
      "ai.recommendations.get",
      { locale: this.defaults.locale, ...params },
      options,
    )
  }
}

export class Ai {
  readonly recommendations: Recommendations

  constructor(conn: Connection, defaults: { locale?: string }) {
    this.recommendations = new Recommendations(conn, defaults)
  }
}
