/**
 * ============================================================
 *  APIKuoshi — src/core/cache.js
 * ============================================================
 *  Tiny TTL memory cache used by the UNIFIED layer only.
 *  (Each engine keeps its own original caching behaviour.)
 * ============================================================
 */

const store = new Map();
let stats = { hits: 0, misses: 0, sets: 0 };

const MAX_ENTRIES = 500;

export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) {
    stats.misses++;
    return undefined;
  }
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    stats.misses++;
    return undefined;
  }
  stats.hits++;
  // refresh LRU position
  store.delete(key);
  store.set(key, entry);
  return entry.value;
}

export function cacheSet(key, value, ttlSeconds = 180) {
  if (ttlSeconds <= 0) return;
  if (store.size >= MAX_ENTRIES) {
    // evict oldest (first inserted)
    const firstKey = store.keys().next().value;
    if (firstKey !== undefined) store.delete(firstKey);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  stats.sets++;
}

export function cacheStats() {
  const total = stats.hits + stats.misses;
  return {
    ...stats,
    size: store.size,
    hitRate: total > 0 ? ((stats.hits / total) * 100).toFixed(1) + "%" : "0%",
  };
}

/**
 * Cache-through helper: returns cached value or runs `fn`,
 * caching the result (only successful results are cached).
 */
export async function withCache(key, ttlSeconds, fn) {
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;
  const value = await fn();
  cacheSet(key, value, ttlSeconds);
  return value;
}
