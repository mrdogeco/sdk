/**
 * Emits a single `dist/schema.json` containing JSON Schema for every resource
 * and every method's params + result. Consumed by non-TypeScript SDKs (Python,
 * Go, etc.) to generate native types.
 *
 * Run: `pnpm build:schema` (or as part of `pnpm build`).
 */

import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { zodToJsonSchema } from "zod-to-json-schema"
import { z } from "zod"

import * as resources from "../src/resources"
import * as events from "../src/events"
import { methods, type MethodName } from "../src/methods"
import { ErrorCode, RpcError, RpcRequest, RpcSuccess, RpcErrorResponse, RpcNotification, PROTOCOL_VERSION } from "../src/envelope"

const RESOURCE_SCHEMAS = {
  Region: resources.Region,
  Competition: resources.Competition,
  Team: resources.Team,
  Sport: resources.Sport,
  MatchStatus: resources.MatchStatus,
  MatchStats: resources.MatchStats,
  BetItem: resources.BetItem,
  Market: resources.Market,
  Match: resources.Match,
  MatchDetail: resources.MatchDetail,
  Pagination: resources.Pagination,
  PickConfidence: resources.PickConfidence,
  PickResult: resources.PickResult,
  AiPick: resources.AiPick,
  Recommendation: resources.Recommendation,
}

const EVENT_SCHEMAS = {
  WelcomeParams: events.WelcomeParams,
  SubscriptionEventParams: events.SubscriptionEventParams,
  SubscriptionClosedParams: events.SubscriptionClosedParams,
  SubscriptionEventName: events.SubscriptionEventName,
  SubscriptionClosedReason: events.SubscriptionClosedReason,
  NotificationName: events.NotificationName,
}

const ENVELOPE_SCHEMAS = {
  ErrorCode,
  RpcError,
  RpcRequest,
  RpcSuccess,
  RpcErrorResponse,
  RpcNotification,
}

function toSchema(schema: z.ZodTypeAny) {
  return zodToJsonSchema(schema, { target: "jsonSchema7" })
}

const out = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://schemas.mrdoge.co/protocol/v1/schema.json",
  title: "Mr. Doge SDK Protocol",
  description:
    "Wire-format spec for the Mr. Doge SDK. Generated from Zod schemas in @mrdoge/protocol. Do not edit by hand.",
  protocolVersion: PROTOCOL_VERSION,
  envelope: Object.fromEntries(
    Object.entries(ENVELOPE_SCHEMAS).map(([name, schema]) => [name, toSchema(schema)]),
  ),
  resources: Object.fromEntries(
    Object.entries(RESOURCE_SCHEMAS).map(([name, schema]) => [name, toSchema(schema)]),
  ),
  events: Object.fromEntries(
    Object.entries(EVENT_SCHEMAS).map(([name, schema]) => [name, toSchema(schema)]),
  ),
  methods: Object.fromEntries(
    (Object.keys(methods) as MethodName[]).map((name) => {
      const def = methods[name]
      return [
        name,
        {
          params: toSchema(def.params),
          result: toSchema(def.result),
          ...("pushEvents" in def ? { pushEvents: def.pushEvents } : {}),
        },
      ]
    }),
  ),
}

const distDir = join(__dirname, "..", "dist")
mkdirSync(distDir, { recursive: true })

const outPath = join(distDir, "schema.json")
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8")

console.log(
  `Wrote ${outPath} — ${Object.keys(RESOURCE_SCHEMAS).length} resources, ${Object.keys(methods).length} methods, ${Object.keys(EVENT_SCHEMAS).length} event shapes.`,
)
