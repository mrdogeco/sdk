import type { MethodParams, MethodResult } from "@mrdoge/protocol"
import type { CallOptions, Connection } from "../connection"

export class Teams {
  constructor(private readonly conn: Connection, private readonly defaults: { locale?: string }) {}

  list(
    params: MethodParams<"teams.list"> = {},
    options?: CallOptions,
  ): Promise<MethodResult<"teams.list">> {
    return this.conn.call(
      "teams.list",
      { locale: this.defaults.locale, ...params },
      options,
    )
  }

  get(
    params: MethodParams<"teams.get">,
    options?: CallOptions,
  ): Promise<MethodResult<"teams.get">> {
    return this.conn.call(
      "teams.get",
      { locale: this.defaults.locale, ...params },
      options,
    )
  }

  form(
    params: MethodParams<"teams.form">,
    options?: CallOptions,
  ): Promise<MethodResult<"teams.form">> {
    return this.conn.call(
      "teams.form",
      { locale: this.defaults.locale, ...params },
      options,
    )
  }
}
