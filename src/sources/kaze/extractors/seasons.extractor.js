/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Extracts season information for a specific anime from the
 *   watch page HTML. Returns available seasons from the page
 *   sidebar and metadata.
 *
 * @exports
 *   extractSeasons
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import * as cheerio from "cheerio";
import { fetchWithMirror } from "../helper/mirror.helper.js";

// ══════════════════════════════════════════════════════════════
// SEASONS EXTRACTOR
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Season Information Extraction ----
/**
 * Fetches and parses season information for an anime.
 * Extracts season data from the watch page sidebar.
 *
 * NOTE: The source site's AJAX endpoints (/ajax/seasons/) don't exist,
 * so we extract from the watch page HTML sidebar instead.
 *
 * @param {string|number} slugOrId - The anime slug or numeric ID
 * @returns {Promise<Object>} Object with animeId, totalSeasons, and seasons array
 *
 * @example
 *   const seasons = await extractSeasons("one-piece-odmau");
 *   console.log(seasons.totalSeasons);
 */
const extractSeasons = async (slugOrId) => {
  try {
    const path = `/watch/${slugOrId}`;
    const { data } = await fetchWithMirror(path);

    const html = typeof data === "string" ? data : String(data);
    const $ = cheerio.load(html);

    const animeId = parseInt($("#watch-main").attr("data-id")) || 0;
    const seasons = [];

    // NOTE: Try dedicated seasons section first (#ani-seasons)
    $("#ani-seasons .swiper-slide, .seasons .item, #w-seasons .item").each((_, el) => {
      const link = $(el).find("a").first();
      const href = link.attr("href") || "";
      const poster = $(el).find("img").attr("src") || "";
      const title = $(el).find(".name, .title").text().trim() || link.text().trim() || "";
      let slug = href.split("/watch/").pop() || "";
      if (!slug) {
        slug = $(el).find(".poster").attr("data-tip") || "";
      }

      if (slug || title) {
        seasons.push({ title, slug, poster, url: href });
      }
    });

    // NOTE: Fallback — extract from episode list sidebar if no dedicated section
    if (seasons.length === 0) {
      $(".w-side-section .item").each((_, el) => {
        const link = $(el).find("a").first();
        const href = link.attr("href") || "";
        const poster = $(el).find("img").attr("src") || "";
        const title = $(el).find(".name").text().trim() || "";
        let slug = href.split("/watch/").pop() || "";
        // NOTE: Items may not have <a> tags — fall back to data-tip attribute
        if (!slug) {
          slug = $(el).find(".poster").attr("data-tip") || "";
        }
        const score = $(el).find(".score").text().trim() || "";
        const episodes = $(el).find(".meta .dot:last-child").text().trim() || "";

        if (slug && slug !== slugOrId) {
          seasons.push({ title, slug, poster, url: href, score, episodes });
        }
      });
    }

    return {
      animeId,
      slug: slugOrId,
      totalSeasons: seasons.length,
      seasons,
    };
  } catch (error) {
    throw error;
  }
};

export { extractSeasons };
// ══════════════════════════════════════════════════════════════ END: seasons.extractor.js
