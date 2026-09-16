/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Utility function to extract total page count from paginated
 *   HTML content. Parses pagination links from Cheerio DOM to
 *   determine the maximum page number available.
 *
 * @exports
 *   countPages
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

// ══════════════════════════════════════════════════════════════
// PAGINATION EXTRACTION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Extract maximum page number from pagination elements ----
/**
 * Parses HTML pagination elements to extract the total number of pages.
 * Looks for numeric page links in .pagination li a elements and
 * returns the highest page number found.
 *
 * @param {CheerioAPI} $ - Cheerio instance with loaded HTML content
 * @returns {number} Maximum page number (defaults to 1 if no pagination found)
 *
 * @example
 *   // Count pages from search results
 *   const $ = await extractPages(searchUrl);
 *   const totalPages = countPages($);
 *   // totalPages: 5 (if pages 1-5 exist)
 *
 * @note
 *   This function assumes standard pagination HTML structure with
 *   numeric page links inside .pagination > li > a elements.
 */
const countPages = ($) => {
  const pages = [];
  $(".pagination li a").each((i, el) => {
    const text = $(el).text().trim();
    if (!isNaN(text) && text !== "") {
      pages.push(parseInt(text));
    }
  });
  return pages.length > 0 ? Math.max(...pages) : 1;
};

export { countPages };
// ══════════════════════════════════════════════════════════════ END: countPages.helper.js