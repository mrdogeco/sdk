export interface BackoffConfig {
  minMs: number
  maxMs: number
  /** Jitter as a fraction of the computed delay (0.2 = ±20%). */
  jitter: number
}

export const DEFAULT_BACKOFF: BackoffConfig = {
  minMs: 1_000,
  maxMs: 30_000,
  jitter: 0.2,
}

/**
 * Returns the delay (ms) for a given reconnect attempt (1-indexed). Capped
 * exponential growth with random jitter.
 */
export function nextDelay(attempt: number, cfg: BackoffConfig = DEFAULT_BACKOFF): number {
  const exp = Math.min(cfg.maxMs, cfg.minMs * 2 ** (attempt - 1))
  const jitter = exp * cfg.jitter * (Math.random() * 2 - 1)
  return Math.max(0, Math.round(exp + jitter))
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("aborted"))
      return
    }
    const t = setTimeout(resolve, ms)
    signal?.addEventListener("abort", () => {
      clearTimeout(t)
      reject(new Error("aborted"))
    })
  })
}
