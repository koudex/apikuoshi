/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Central configuration file defining all URL patterns for the AniKoto
 *   anime streaming site. Provides both base domain and alternative
 *   mirror domains for resilience and fallback purposes.
 *
 * @exports
 *   BASE_URL, ALT_DOMAINS, URLS
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

// ══════════════════════════════════════════════════════════════
// BASE DOMAIN CONFIGURATION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Primary base URL for the AniKoto streaming service ----
/**
 * The primary base URL used for all API requests to AniKoto.
 * This serves as the canonical domain for the site.
 *
 * @type {string}
 * @default "https://anikototv.to"
 */
const BASE_URL = "https://anikototv.to";

// ---- FEATURE: Alternative mirror domains for fallback and redundancy ----
/**
 * Array of alternative domain mirrors for the AniKoto site.
 * Used when the primary domain is unavailable or blocked.
 * Each domain points to the same content but may have different
 * availability depending on region or network conditions.
 *
 * @type {string[]}
 * @example
 *   // Access alternative domains
 *   ALT_DOMAINS[0] // "https://anikoto.cz"
 */
const ALT_DOMAINS = [
  "https://anikoto.cz",
  "https://anikoto.me",
  "https://anikoto.net",
  "https://anikoto.se"
];

// ══════════════════════════════════════════════════════════════
// URL PATTERN DEFINITIONS
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Complete URL routing map for all site endpoints ----
/**
 * Object containing all URL patterns for the AniKoto site.
 * Functions return dynamically constructed URLs based on parameters.
 * Static URLs are provided as string properties.
 *
 * @type {Object}
 * @property {string} home - URL for the homepage
 * @property {string} search - URL for search/filter functionality
 * @property {Function} genre - Returns URL for genre-specific listings
 * @param {string} genre - Genre slug (e.g., "action", "comedy")
 * @returns {string} Complete URL for the genre page
 * @property {Function} type - Returns URL for anime type listings
 * @param {string} type - Anime type slug (e.g., "tv", "movie")
 * @returns {string} Complete URL for the type page
 * @property {Function} status - Returns URL for airing status listings
 * @param {string} status - Status slug (e.g., "currently-airing")
 * @returns {string} Complete URL for the status page
 * @property {Function} azList - Returns URL for alphabetical listings
 * @param {string} letter - Letter or "other" for non-alpha titles
 * @returns {string} Complete URL for the A-Z list page
 * @property {Function} watch - Returns URL for anime watch page
 * @param {string} slug - Anime series slug identifier
 * @returns {string} Complete URL for the watch page
 * @property {Function} episode - Returns URL for specific episode
 * @param {string} slug - Anime series slug identifier
 * @param {number} ep - Episode number to watch
 * @returns {string} Complete URL for the specific episode
 * @property {string} latestUpdated - URL for recently updated anime
 * @property {string} newRelease - URL for newly released anime
 * @property {string} mostViewed - URL for most popular anime
 * @property {string} random - URL for random anime selection
 * @property {string} serverList - URL for episode server listings
 *
 * @example
 *   // Get homepage URL
 *   URLS.home // "https://anikototv.to/home"
 *
 * @example
 *   // Get genre URL
 *   URLS.genre("action") // "https://anikototv.to/genre/action"
 *
 * @example
 *   // Get episode URL
 *   URLS.episode("one-piece", 100) // "https://anikototv.to/watch/one-piece/ep-100"
 */
const URLS = {
  home: `${BASE_URL}/home`,
  search: `${BASE_URL}/filter`,
  genre: (genre) => `${BASE_URL}/genre/${genre}`,
  type: (type) => `${BASE_URL}/type/${type}`,
  status: (status) => `${BASE_URL}/status/${status}`,
  azList: (letter) => `${BASE_URL}/az-list/${letter}`,
  watch: (slug) => `${BASE_URL}/watch/${slug}`,
  episode: (slug, ep) => `${BASE_URL}/watch/${slug}/ep-${ep}`,
  latestUpdated: `${BASE_URL}/latest-updated`,
  newRelease: `${BASE_URL}/new-release`,
  mostViewed: `${BASE_URL}/most-viewed`,
  random: `${BASE_URL}/random`,
  serverList: `${BASE_URL}/ajax/server/list`
};

export { BASE_URL, ALT_DOMAINS, URLS };
// ══════════════════════════════════════════════════════════════ END: dataUrl.js