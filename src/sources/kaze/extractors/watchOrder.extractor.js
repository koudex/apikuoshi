/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Extracts watch order and related anime information from the
 *   watch page sidebar. Returns trending/related anime with their
 *   metadata for continuous viewing.
 *
 * @exports
 *   extractWatchOrder
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import * as cheerio from "cheerio";
import { fetchWithMirror } from "../helper/mirror.helper.js";

// ══════════════════════════════════════════════════════════════
// WATCH ORDER EXTRACTOR
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Watch Order / Related Anime Extraction ----
/**
 * Fetches and parses watch order / related anime for an anime.
 * Extracts related anime from the watch page sidebar.
 *
 * NOTE: The source site's AJAX endpoints (/ajax/related/) don't exist,
 * so we extract from the watch page HTML sidebar instead.
 *
 * @param {string|number} slugOrId - The anime slug or numeric ID
 * @returns {Promise<Object>} Object with animeId, totalRelated, related array
 *
 * @example
 *   const data = await extractWatchOrder("one-piece-odmau");
 *   console.log(data.totalRelated);
 */
const extractWatchOrder = async (slugOrId) => {
  try {
    const path = `/watch/${slugOrId}`;
    const { data } = await fetchWithMirror(path);

    const html = typeof data === "string" ? data : String(data);
    const $ = cheerio.load(html);

    const animeId = parseInt($("#watch-main").attr("data-id")) || 0;
    const related = [];

    // NOTE: Try dedicated related section first (#w-related)
    $("#w-related .item, .w-side-section:has(.title:contains('Related')) .item").each((_, el) => {
      const link = $(el).find("a").first();
      const href = link.attr("href") || "";
      const title = $(el).find(".name").text().trim() || "";
      const poster = $(el).find("img").attr("src") || "";
      const slug = href.split("/watch/").pop() || $(el).find(".poster").attr("data-tip") || "";
      const relation = $(el).find(".relation, .serieslabelitem").text().trim() || "related";

      if (slug) {
        related.push({ title, slug, poster, url: href, relation });
      }
    });

    // NOTE: Fallback — extract from #watch-order section (trending sidebar items as suggested watch order)
    if (related.length === 0) {
      $("#watch-order .item, .w-side-section:has(.title:contains('Trending')) .item, .w-side-section:first .item").each((_, el) => {
        const link = $(el).find("a").first();
        const href = link.attr("href") || "";
        const title = $(el).find(".name").text().trim() || "";
        const poster = $(el).find("img").attr("src") || "";
        // NOTE: Items may not have <a> tags — fall back to data-tip attribute for slug
        let slug = href.split("/watch/").pop() || "";
        if (!slug) {
          const dataTip = $(el).find(".poster").attr("data-tip") || "";
          if (dataTip) slug = dataTip;
        }
        const score = $(el).find(".score").text().trim() || "";
        // NOTE: .meta .dot elements: [0]=score, [1]=type, [2]=episodes
        const metaDots = $(el).find(".meta .dot");
        const type = metaDots.eq(1).text().trim() || "";
        const episodes = metaDots.eq(2).text().trim() || "";

        if (slug && slug !== slugOrId) {
          related.push({ title, slug, poster, url: href, relation: "trending", score, type, episodes });
        }
      });
    }

    return {
      animeId,
      slug: slugOrId,
      totalRelated: related.length,
      related,
    };
  } catch (error) {
    throw error;
  }
};

export { extractWatchOrder };
// ══════════════════════════════════════════════════════════════ END: watchOrder.extractor.js
