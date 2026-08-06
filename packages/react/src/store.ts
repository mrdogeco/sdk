type Listener = () => void

interface Entry<T> {
  value: T
  listeners: Set<Listener>
  refCount: number
  cleanup: (() => void) | null
}

/**
 * Generic per-key cache backing every hook in this package. Any number of
 * hook instances subscribing to the same key share one underlying resource
 * (a WS subscription, or a one-shot fetch's result) and one copy of the
 * data — the first subscriber starts it, the last one to leave tears it
 * down. A later resubscribe starts a fresh one from scratch; there's no
 * grace period, so rapid unmount/remount (e.g. React StrictMode in dev)
 * pays for a real resubscribe. Not worth the complexity to avoid until
 * that's an actual problem.
 */
export function createResourceStore<T>() {
  const entries = new Map<string, Entry<T>>()

  function getSnapshot(key: string, initialValue: T): T {
    return entries.get(key)?.value ?? initialValue
  }

  function subscribe(
    key: string,
    initialValue: T,
    start: (set: (value: T) => void) => (() => void) | void,
    listener: Listener
  ): () => void {
    let entry = entries.get(key)
    if (!entry) {
      entry = { value: initialValue, listeners: new Set(), refCount: 0, cleanup: null }
      entries.set(key, entry)
    }
    const current = entry

    current.listeners.add(listener)
    current.refCount++

    if (current.refCount === 1) {
      current.cleanup =
        start((value) => {
          current.value = value
          for (const notify of current.listeners) notify()
        }) ?? null
    }

    return () => {
      current.listeners.delete(listener)
      current.refCount--
      if (current.refCount === 0) {
        current.cleanup?.()
        entries.delete(key)
      }
    }
  }

  return { getSnapshot, subscribe }
}
