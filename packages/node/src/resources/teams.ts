import type { MethodParams, MethodResult } from "@mrdoge/protocol"
import type { Connection } from "../connection"

export class Teams {
  constructor(private readonly conn: Connection, private readonly defaults: { locale?: string }) {}

  list(
    params: MethodParams<"teams.list"> = {},
  ): Promise<MethodResult<"teams.list">> {
    return this.conn.call("teams.list", { locale: this.defaults.locale, ...params })
  }

  get(params: MethodParams<"teams.get">): Promise<MethodResult<"teams.get">> {
    return this.conn.call("teams.get", { locale: this.defaults.locale, ...params })
  }

  form(params: MethodParams<"teams.form">): Promise<MethodResult<"teams.form">> {
    return this.conn.call("teams.form", { locale: this.defaults.locale, ...params })
  }
}
