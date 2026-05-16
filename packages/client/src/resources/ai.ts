import type { MethodParams, MethodResult } from "@mrdoge/protocol"
import type { CallOptions, Connection } from "../connection"

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
