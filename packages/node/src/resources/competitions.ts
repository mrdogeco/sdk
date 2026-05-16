import type { MethodParams, MethodResult } from "@mrdoge/protocol"
import type { CallOptions, Connection } from "../connection"

export class Competitions {
  constructor(private readonly conn: Connection, private readonly defaults: { locale?: string }) {}

  list(
    params: MethodParams<"competitions.list"> = {},
    options?: CallOptions,
  ): Promise<MethodResult<"competitions.list">> {
    return this.conn.call(
      "competitions.list",
      { locale: this.defaults.locale, ...params },
      options,
    )
  }
}
