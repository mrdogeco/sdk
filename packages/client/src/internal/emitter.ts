/**
 * Tiny typed event emitter — works in any JS runtime (browser, RN, edge, Node).
 * Identical shape to the Node SDK's emitter; kept duplicated for now rather
 * than sharing via a third package (zero deps, easy to reason about).
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
