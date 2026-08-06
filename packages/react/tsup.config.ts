import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2020",
  external: ["@mrdoge/client", "@mrdoge/protocol", "react"],
  platform: "neutral",
  // esbuild drops "use client" directives when bundling multiple source
  // files into one output — every export here is client-only (hooks), so
  // stamp it back on at the top of the bundle directly.
  banner: { js: '"use client"' },
})
