import type { MethodParams, MethodResult } from "@mrdoge/protocol"
import type { Connection } from "../connection"

class Picks {
  constructor(private readonly conn: Connection, private readonly defaults: { locale?: string }) {}

  list(
    params: MethodParams<"ai.picks.list"> = {},
  ): Promise<MethodResult<"ai.picks.list">> {
    return this.conn.call("ai.picks.list", { locale: this.defaults.locale, ...params })
  }
}

class Recommendations {
  constructor(private readonly conn: Connection, private readonly defaults: { locale?: string }) {}

  list(
    params: MethodParams<"ai.recommendations.list"> = {},
  ): Promise<MethodResult<"ai.recommendations.list">> {
    return this.conn.call("ai.recommendations.list", { locale: this.defaults.locale, ...params })
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
