import type { NextConfig } from "next"

const config: NextConfig = {
  // @mrdoge/client + @mrdoge/protocol get bundled into the browser build.
  transpilePackages: ["@mrdoge/client", "@mrdoge/protocol"],

  // @mrdoge/node (server-only) depends on `ws`, which has optional native
  // bindings (bufferutil, utf-8-validate). Next's bundler breaks the native-
  // fallback chain when it tries to inline these. Marking them external tells
  // Next to leave them as runtime `require()` calls in the server bundle.
  // `instrumentation.ts` additionally sets `WS_NO_BUFFER_UTIL=1` and
  // `WS_NO_UTF_8_VALIDATE=1` to force ws into its pure-JS path.
  serverExternalPackages: ["@mrdoge/node", "ws", "bufferutil", "utf-8-validate"],
}

export default config
