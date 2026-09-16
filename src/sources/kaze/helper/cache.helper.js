/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   In-memory LRU cache with configurable TTL per endpoint.
 *   Evicts least recently used entries when max size reached.
 *   Supports cache statistics and manual invalidation.
 *
 * @exports
 *   getCache, setCache, clearCache, getCacheStats, LRUCache
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

// ══════════════════════════════════════════════════════════════
// LRU CACHE CLASS
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: LRU Cache ----
/**
 * Least Recently Used (LRU) cache implementation.
 * Maintains access order by deleting and re-inserting on read.
 * Auto-evicts oldest entry when maxSize is reached.
 */
class LRUCache {
  /**
   * @param {number} maxSize - Maximum number of entries (default: 100)
   * @param {number} defaultTTL - Default time-to-live in ms (default: 300000 = 5min)
   */
  constructor(maxSize = 100, defaultTTL = 300000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
    this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0 };
  }

  /**
   * Get a value from the cache. Moves the entry to the end (most recent) on access.
   * Returns undefined if not found or expired.
   *
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined
   */
  get(key) {
    if (!this.cache.has(key)) {
      this.stats.misses++;
      return undefined;
    }

    const entry = this.cache.get(key);
    // NOTE: Lazy expiration — check expiry on access, not background timer
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // NOTE: Re-insert to move to end (most recently used position)
    this.stats.hits++;
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  /**
   * Set a value in the cache with optional TTL.
   * Evicts the oldest entry if at capacity.
   *
   * @param {string} key - Cache key
   * @param {*} value - Value to store
   * @param {number} [ttl] - Time-to-live in ms (uses defaultTTL if not provided)
   */
  set(key, value, ttl) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // NOTE: Evict oldest (first) entry when cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttl || this.defaultTTL)
    });
    this.stats.sets++;
  }

  /**
   * Delete a specific key from the cache.
   *
   * @param {string} key - Cache key to delete
   * @returns {boolean} True if the key existed before deletion
   */
  delete(key) {
    const existed = this.cache.delete(key);
    if (existed) this.stats.deletes++;
    return existed;
  }

  /**
   * Clear all entries from the cache.
   *
   * @returns {number} Number of entries cleared
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    return size;
  }

  /**
   * Get cache statistics including hit rate.
   *
   * @returns {Object} Stats object with hits, misses, sets, deletes, size, hitRate
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * Check if a key exists and is not expired.
   *
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and is valid
   */
  has(key) {
    if (!this.cache.has(key)) return false;
    const entry = this.cache.get(key);
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }
}

// ══════════════════════════════════════════════════════════════
// TTL CONFIGURATION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Per-Endpoint TTL ----
// NOTE: TTL values tuned per endpoint — stale data tolerance vs server load
const TTL = {
  home: 600000,        // 10min — homepage changes infrequently
  search: 300000,      // 5min  — search results update moderate
  info: 600000,        // 10min — anime info is relatively stable
  episodes: 300000,    // 5min  — episode lists update weekly
  servers: 600000,     // 10min — server URLs rarely change
  stream: 180000,      // 3min  — stream URLs rotate frequently
  spotlight: 600000,   // 10min — spotlight rotates daily
  trending: 600000,    // 10min — trending updates hourly
  schedule: 1800000,   // 30min — schedule changes daily
  genres: 3600000,     // 60min — genre list is static
  suggestions: 300000, // 5min  — suggestions update moderate
  default: 300000      // 5min  — safe default for unknown endpoints
};

// ══════════════════════════════════════════════════════════════
// SINGLETON CACHE INSTANCE
// ══════════════════════════════════════════════════════════════

// NOTE: Singleton pattern — single cache instance shared across all requests
const cache = new LRUCache(
  parseInt(process.env.CACHE_MAX_SIZE) || 200,
  parseInt(process.env.CACHE_DEFAULT_TTL) || 300000
);

// ══════════════════════════════════════════════════════════════
// EXPORTED HELPERS
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Cache Get/Set/Clear ----
/**
 * Get a value from the global cache.
 * @param {string} key - Cache key
 * @returns {*} Cached value or undefined
 */
const getCache = (key) => cache.get(key);

/**
 * Set a value in the global cache with optional TTL.
 * @param {string} key - Cache key
 * @param {*} data - Value to store
 * @param {number} [ttl] - Time-to-live in ms
 */
const setCache = (key, data, ttl) => cache.set(key, data, ttl);

/**
 * Clear all entries from the global cache.
 * @returns {number} Number of entries cleared
 */
const clearCache = () => cache.clear();

/**
 * Get cache statistics (hits, misses, hit rate, size).
 * @returns {Object} Cache stats
 */
const getCacheStats = () => cache.getStats();

export { getCache, setCache, clearCache, getCacheStats, LRUCache, TTL };
// ══════════════════════════════════════════════════════════════ END: cache.helper.js
