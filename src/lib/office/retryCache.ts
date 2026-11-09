// Load-once cache for things the office fetches mid-session (a new background at
// noon or 5 PM). A failed load is retried after `retryMs` instead of being given
// up on, so a network blip on a page left open all day doesn't end the scene.

type Entry<V> = { value?: V; loading: boolean; retryAt: number };

export function retryCache<K, V>(
  load: (key: K) => Promise<V>,
  onReady: () => void,
  retryMs = 30_000,
  now: () => number = Date.now,
) {
  const entries = new Map<K, Entry<V>>();
  return {
    /** The value if loaded; otherwise starts (or retries) loading and returns null. */
    get(key: K): V | null {
      let e = entries.get(key);
      if (e?.value !== undefined) return e.value;
      if (!e) entries.set(key, (e = { loading: false, retryAt: 0 }));
      if (e.loading || now() < e.retryAt) return null;
      const entry = e;
      entry.loading = true;
      load(key).then(
        (value) => { entry.value = value; entry.loading = false; onReady(); },
        () => { entry.loading = false; entry.retryAt = now() + retryMs; },
      );
      return null;
    },
  };
}
