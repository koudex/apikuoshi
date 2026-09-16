/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Shared helper for parsing anime list items from Cheerio DOM.
 *   Eliminates code duplication across multiple extractors by
 *   providing a unified parsing function for standard list items.
 *
 * @exports
 *   parseListItems, parseListItem
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

// ══════════════════════════════════════════════════════════════
// SINGLE ITEM PARSER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Parse a single anime list item from a Cheerio element ----
/**
 * Parses a single anime list item from a Cheerio element.
 * Handles multiple CSS selector patterns for different page layouts
 * by falling through comma-separated selectors until one matches.
 *
 * @param {CheerioAPI} $ - Cheerio instance with loaded HTML
 * @param {CheerioElement} el - DOM element to parse
 * @param {object} [options] - Parsing options
 * @param {boolean} [options.includeAnimeId=false] - Include animeId field from data-tip attribute
 * @param {boolean} [options.includeRating=true] - Include rating field from .rated span
 * @returns {object|null} Parsed anime object or null if slug is missing (invalid item)
 *
 * @example
 *   const item = parseListItem($, el, { includeAnimeId: true });
 *   if (item) results.push(item);
 */
const parseListItem = ($, el, options = {}) => {
  const { includeAnimeId = false, includeRating = true } = options;

  // NOTE: slug is the primary key — skip items without a valid watch link
  // NOTE: item may BE the <a> tag itself, so check both self and children
  let slug = "";
  if ($(el).is("a")) {
    slug = $(el).attr("href")?.split("/watch/").pop() || "";
  }
  if (!slug) {
    slug = $(el).find("a").attr("href")?.split("/watch/").pop() || "";
  }
  if (!slug) return null;

  // NOTE: Multiple selectors handle different page layouts (#list-items vs .film_list-wrap vs .item)
  const poster = $(el).find("img").attr("src") || "";
  const title = $(el).find(".name").text().trim() || $(el).children(".info").find(".name").text().trim() || "";
  const japaneseTitle = $(el).find(".name").attr("data-jp") || "";
  const sub = parseInt($(el).find(".ep-status.sub span").text().trim()) || 0;
  const dub = parseInt($(el).find(".ep-status.dub span").text().trim()) || 0;
  const total = parseInt($(el).find(".ep-status.total span").text().trim()) || 0;
  const type = $(el).find(".meta .dot:last-child, .fdi-item:nth-child(2)").text().trim() || "";

  const item = { slug, poster, title, japaneseTitle, sub, dub, total, type };

  // NOTE: animeId comes from data-tip on .ani.poster.tip — only present on some page layouts
  if (includeAnimeId) {
    item.animeId = $(el).find(".ani.poster.tip").attr("data-tip") || "";
  }

  // NOTE: Rating uses different selectors depending on whether it's a list page or detail page
  if (includeRating) {
    item.rating = $(el).find(".rated span, .rating, .fdi-item:nth-child(3)").text().trim() || "";
  }

  return item;
};

// ══════════════════════════════════════════════════════════════
// MULTI-ITEM PARSER
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Parse multiple anime list items from a Cheerio instance ----
/**
 * Parses multiple anime list items from a Cheerio instance.
 * Uses multiple CSS selectors to handle different page layouts,
 * returning only items with valid slugs.
 *
 * @param {CheerioAPI} $ - Cheerio instance with loaded HTML
 * @param {string} [selector] - CSS selector for list items (default: auto-detect all layouts)
 * @param {object} [options] - Parsing options (passed to parseListItem)
 * @returns {Array<object>} Array of parsed anime objects (empty if none found)
 *
 * @example
 *   const $ = await extractPages("/most-popular");
 *   const items = parseListItems($);
 *   console.log(items.length); // Number of parsed items
 */
const parseListItems = ($, selector = "#list-items > .item, .film_list-wrap .flw-item, .film-detail, .item", options = {}) => {
  const results = [];

  $(selector).each((i, el) => {
    const item = parseListItem($, el, options);
    if (item) results.push(item);
  });

  return results;
};

export { parseListItems, parseListItem };

// ══════════════════════════════════════════════════════════════ END: parseListItem.helper.js
