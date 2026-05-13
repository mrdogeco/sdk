/**
 * Next.js server-side instrumentation. Runs before any other module loads.
 *
 * Why this exists: `@mrdoge/sdk` depends on the `ws` package, which has two
 * optional native deps (`bufferutil`, `utf-8-validate`) for slightly faster
 * frame masking. Next.js's bundler doesn't reliably resolve their native
 * bindings, leaving them half-loaded and breaking ws's send path.
 *
 * The fix: set the two documented `ws` env vars to disable native deps and
 * force the pure-JS fallback path. Tiny performance hit, fully reliable.
 */
export function register() {
  process.env.WS_NO_BUFFER_UTIL = "1"
  process.env.WS_NO_UTF_8_VALIDATE = "1"
}
