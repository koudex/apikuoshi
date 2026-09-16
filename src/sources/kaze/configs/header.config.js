/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   HTTP request header configuration for making API calls to the
 *   AniKoto streaming site. Includes browser-like headers to
 *   mimic legitimate web traffic and avoid detection.
 *
 * @exports
 *   headers
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

// ══════════════════════════════════════════════════════════════
// HTTP REQUEST HEADER CONFIGURATION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Browser-mimicking headers for HTTP requests ----
/**
 * Standard HTTP headers that mimic a real browser request.
 * Used with axios/fetch to make requests appear as legitimate
 * browser traffic to the AniKoto streaming site.
 *
 * @type {Object}
 * @property {string} User-Agent - Browser identification string
 * @property {string} Accept - Accepted response content types
 * @property {string} Accept-Language - Preferred language settings
 * @property {string} Accept-Encoding - Supported compression algorithms
 * @property {string} Connection - Connection keep-alive preference
 * @property {string} Upgrade-Insecure-Requests - HTTPS upgrade preference
 *
 * @example
 *   // Use with axios
 *   axios.get(url, { headers })
 */
const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1"
};

export { headers };
// ══════════════════════════════════════════════════════════════ END: header.config.js