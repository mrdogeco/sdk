/**
 * Tiny typed event emitter — avoids depending on Node's `events` module so
 * we can target browsers later without a polyfill.
 *
 * Listeners registered via `on` return an unsubscribe function for that
 * specific listener.
 */
export class Emitter<Events extends Record<string, any>> {
  private listeners = new Map<keyof Events, Set<(payload: any) => void>>()

  on<E extends keyof Events>(event: E, fn: (payload: Events[E]) => void): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(fn)
    return () => set!.delete(fn)
  }

  off<E extends keyof Events>(event: E, fn: (payload: Events[E]) => void): void {
    this.listeners.get(event)?.delete(fn)
  }

  emit<E extends keyof Events>(event: E, payload: Events[E]): void {
    const set = this.listeners.get(event)
    if (!set || set.size === 0) return
    for (const fn of [...set]) {
      try {
        fn(payload)
      } catch (err) {
        queueMicrotask(() => {
          throw err
        })
      }
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}
