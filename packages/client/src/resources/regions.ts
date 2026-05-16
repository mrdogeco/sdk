import type { MethodParams, MethodResult } from "@mrdoge/protocol"
import type { CallOptions, Connection } from "../connection"

export class Regions {
  constructor(private readonly conn: Connection, private readonly defaults: { locale?: string }) {}

  list(
    params: MethodParams<"regions.list"> = {},
    options?: CallOptions,
  ): Promise<MethodResult<"regions.list">> {
    return this.conn.call(
      "regions.list",
      { locale: this.defaults.locale, ...params },
      options,
    )
  }
}
