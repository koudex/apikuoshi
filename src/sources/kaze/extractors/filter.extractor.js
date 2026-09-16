/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Provides advanced anime filtering on anikototv.to — supports filtering
 *   by genre, type, status, language, rating, sort order, season, year,
 *   source, episode range, and keyword with full pagination support.
 *
 * @exports
 *   extractFilter
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import { URLS } from "../configs/dataUrl.js";
import { GENRE_IDS, TYPE_IDS, STATUS_IDS, RATING_IDS, SORT_IDS, SOURCE_IDS, SEASON_IDS } from "../configs/ids.config.js";
import { countPages } from "../helper/countPages.helper.js";
import { extractPages } from "../helper/extractPages.helper.js";

// ══════════════════════════════════════════════════════════════
// PARAM NORMALIZER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Normalize any param value into a flat string[] of tokens ----
/**
 * Accepts ANY shape Express might hand us for a repeated query param and
 * returns a flat, de-duplicated array of trimmed string tokens.
 *
 * Handles:
 *   - string  → "action,comedy"      => ["action", "comedy"]
 *   - array   → ["action","comedy"]  => ["action", "comedy"]
 *   - mixed   → ["action","comedy,romance"] => ["action","comedy","romance"]
 *   - number  → 12                   => ["12"]
 *   - empty   → "" / null / undefined => []
 *
 * Without this, `?genre=action&genre=adventure,action` (duplicate `genre=`
 * params) makes Express parse `req.query.genre` as an array, and the old
 * `params.genre.split(",")` call would throw `TypeError: .split is not a
 * function` — silently turning a valid multi-genre query into count:0.
 */
function tokenizeParam(value) {
  if (value === null || value === undefined) return [];
  const arr = Array.isArray(value) ? value : [value];
  const out = new Set();
  for (const v of arr) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    for (const tok of s.split(",")) {
      const t = tok.trim();
      if (t) out.add(t);
    }
  }
  return Array.from(out);
}

// ══════════════════════════════════════════════════════════════
// FILTER EXTRACTOR
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Extract paginated anime results with multi-criteria filtering ----
/**
 * Builds a filter URL from the given parameters and fetches matching anime
 * from anikototv.to. Supports keyword, genre, type, status, language,
 * rating, sort, season, year, source, episode range, and exclude watchlist.
 *
 * @param {Object} params - Filter parameters object
 * @param {string} [params.keyword] - Search keyword to filter by name
 * @param {string} [params.genre] - Comma-separated genre names (e.g. "action,comedy")
 * @param {string} [params.type] - Comma-separated types (e.g. "tv,movie")
 * @param {string} [params.status] - Comma-separated statuses (e.g. "airing,completed")
 * @param {string} [params.language] - Comma-separated languages (e.g. "sub,dub")
 * @param {string} [params.rating] - Comma-separated ratings (e.g. "pg-13,r")
 * @param {string} [params.sort] - Sort order key (e.g. "score", "name-az")
 * @param {string} [params.season] - Comma-separated seasons (e.g. "winter,spring")
 * @param {string} [params.year] - Comma-separated years (e.g. "2024,2025")
 * @param {string} [params.source] - Comma-separated sources (e.g. "manga,light-novel")
 * @param {number} [params.epMin] - Minimum episode count filter
 * @param {number} [params.epMax] - Maximum episode count filter
 * @param {boolean} [params.excludeWatchlist=false] - Exclude watchlisted anime
 * @param {number} [params.page=1] - Page number for pagination
 * @returns {Promise<Object>} Object with totalPages count and data array of results
 *
 * @example
 *   const filtered = await extractFilter({ genre: "action", type: "tv", page: 1 });
 *   console.log(filtered.totalPages);
 *   console.log(filtered.data[0].title);
 *
 * @example
 *   // Advanced filter with episode range
 *   const filtered = await extractFilter({
 *     genre: "comedy,slice-of-life",
 *     type: "tv",
 *     year: "2024",
 *     epMin: 12,
 *     epMax: 24,
 *     sort: "score"
 *   });
 */
const extractFilter = async (params = {}) => {
  // Defensive: accept any object (including {}) and never throw on bad input.
  // The route layer relies on this returning { totalPages, data: [] } rather
  // than throwing, so "whatever param inserted" by the client always yields
  // a well-formed 200 response (possibly with count: 0).
  try {
    const queryParams = new URLSearchParams();

    // ---- FEATURE: Build keyword query parameter ----
    // WARNING: keyword param is always set — empty string if not provided (site requires it)
    queryParams.set("keyword", String(params.keyword || "").trim());

    // ---- FEATURE: Map genre names to IDs and append ----
    // NOTE: GENRE_IDS config maps human-readable slugs to site numeric IDs.
    // tokenizeParam() handles string, array, and mixed shapes so duplicate
    // `?genre=a&genre=b,c` params work the same as `?genre=a,b,c`.
    if (params.genre) {
      const genres = tokenizeParam(params.genre)
        .map(g => GENRE_IDS[g.toLowerCase()] || g);
      genres.forEach(g => queryParams.append("genre[]", g));
    }

    // ---- FEATURE: Map type names to site values and append ----
    if (params.type) {
      const types = tokenizeParam(params.type)
        .map(t => TYPE_IDS[t.toLowerCase()] || t);
      types.forEach(t => queryParams.append("term_type[]", t));
    }

    // ---- FEATURE: Map status names to site values and append ----
    if (params.status) {
      const statuses = tokenizeParam(params.status)
        .map(s => STATUS_IDS[s.toLowerCase()] || s);
      statuses.forEach(s => queryParams.append("status[]", s));
    }

    // ---- FEATURE: Append language filter ----
    // NOTE: Languages are passed directly without ID mapping
    if (params.language) {
      tokenizeParam(params.language)
        .forEach(l => queryParams.append("language[]", l));
    }

    // ---- FEATURE: Map rating names to site values and append ----
    if (params.rating) {
      const ratings = tokenizeParam(params.rating)
        .map(r => RATING_IDS[r.toLowerCase()] || r);
      ratings.forEach(r => queryParams.append("rating[]", r));
    }

    // ---- FEATURE: Map sort key to sort value ----
    if (params.sort) {
      const sortRaw = Array.isArray(params.sort) ? String(params.sort[0] ?? "") : String(params.sort);
      const sort = SORT_IDS[sortRaw.trim().toLowerCase()] ?? sortRaw.trim();
      if (sort) queryParams.set("sort", sort);
    }

    // ---- FEATURE: Append season filter ----
    if (params.season) {
      const seasons = tokenizeParam(params.season)
        .map(s => SEASON_IDS[s.toLowerCase()] || s);
      seasons.forEach(s => queryParams.append("season[]", s));
    }

    // ---- FEATURE: Append year filter ----
    if (params.year) {
      tokenizeParam(params.year)
        .forEach(y => queryParams.append("year[]", y));
    }

    // ---- FEATURE: Append source filter ----
    // NOTE: SOURCE_IDS maps source material slugs to site underscore-slugs
    if (params.source) {
      const sources = tokenizeParam(params.source)
        .map(s => SOURCE_IDS[s.toLowerCase()] || s);
      sources.forEach(s => queryParams.append("source[]", s));
    }

    // ---- FEATURE: Append episode range filter ----
    // NOTE: epMin and epMax filter by total episode count range
    if (params.epMin) {
      queryParams.set("ep_min", params.epMin);
    }
    if (params.epMax) {
      queryParams.set("ep_max", params.epMax);
    }

    // ---- FEATURE: Append exclude watchlist filter ----
    // NOTE: Only works for logged-in users — ignores for guests
    if (params.excludeWatchlist) {
      queryParams.set("exclude_watchlist", "1");
    }

    // NOTE: The filter URL is built by appending query params to the search base URL
    const filterUrl = `${URLS.search}?${queryParams.toString()}`;
    const $ = await extractPages(filterUrl, params.page || 1);
    const totalPages = countPages($);

    const results = [];
    $("#list-items > .item").each((i, el) => {
      const slug = $(el).find("a").attr("href")?.split("/watch/").pop() || "";
      const poster = $(el).find(".ani.poster.tip > a > img").attr("src") || "";
      const title = $(el).find(".info .b1 a.name.d-title").text().trim() || "";
      const japaneseTitle = $(el).find(".info .b1 a.name.d-title").attr("data-jp") || "";
      const animeId = $(el).find(".ani.poster.tip").attr("data-tip") || "";
      const sub = parseInt($(el).find(".ep-status.sub span").text().trim()) || 0;
      const dub = parseInt($(el).find(".ep-status.dub span").text().trim()) || 0;
      const total = parseInt($(el).find(".ep-status.total span").text().trim()) || 0;
      const type = $(el).find(".info .meta .m-item:nth-child(2) label").text().trim() || "";
      const rating = $(el).find(".info .meta .m-item.rated span").text().trim() || "";

      if (slug) {
        results.push({
          slug,
          animeId,
          poster,
          title,
          japaneseTitle,
          sub,
          dub,
          total,
          type,
          rating
        });
      }
    });

    return { totalPages, data: results };
  } catch (error) {
    throw error;
  }
};

export { extractFilter };

// ══════════════════════════════════════════════════════════════ END: filter.extractor.js
