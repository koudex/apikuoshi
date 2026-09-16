/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Extracts spotlight/featured anime items from the homepage.
 *   Scrapes the "hottest" carousel section for trending anime.
 *
 * @exports
 *   extractSpotlight
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import * as cheerio from "cheerio";
import { URLS } from "../configs/dataUrl.js";
import { fetchWithMirror } from "../helper/mirror.helper.js";

// ══════════════════════════════════════════════════════════════
// SPOTLIGHT EXTRACTION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Extract featured/spotlight anime from homepage ----
/**
 * Fetches and parses the spotlight carousel from the homepage.
 * Returns an array of featured anime with metadata like poster, title,
 * rating, quality, and episode counts.
 *
 * @returns {Promise<Array<Object>>} Array of spotlight anime objects
 * @returns {string} return.slug - URL slug for the anime
 * @returns {string} return.poster - Poster image URL
 * @returns {string} return.title - English title
 * @returns {string} return.japaneseTitle - Japanese title
 * @returns {string} return.description - Short description
 * @returns {string} return.rating - Anime rating
 * @returns {string} return.quality - Video quality (e.g., HD)
 * @returns {number} return.sub - Subbed episode count
 * @returns {number} return.dub - Dubbed episode count
 * @returns {string} return.date - Release date
 *
 * @example
 *   const spotlights = await extractSpotlight();
 *   console.log(spotlights[0].title);
 */
const extractSpotlight = async () => {
  try {
    const { data } = await fetchWithMirror("/home");
    const $ = cheerio.load(data);

    const spotlights = [];

    $("#hotest .swiper-slide.item").each((i, el) => {
      const slug = $(el).find("a.play").attr("href")?.split("/watch/").pop() || "";
      const poster = $(el).find(".image div").attr("style")?.match(/url\(['"]?(.+?)['"]?\)/)?.[1] || "";
      const title = $(el).find("h2.title.d-title").text().trim() || "";
      const japaneseTitle = $(el).find("h2.title.d-title").attr("data-jp") || "";
      const description = $(el).find(".desc").text().trim() || "";
      const rating = $(el).find("i.rating").text().trim() || "";
      const quality = $(el).find("i.quality").text().trim() || "";
      const sub = parseInt($(el).find("i.sub").text().trim()) || 0;
      const dub = parseInt($(el).find("i.dub").text().trim()) || 0;
      const date = $(el).find("i.date").text().trim() || "";

      if (slug) {
        spotlights.push({
          slug,
          poster,
          title,
          japaneseTitle,
          description,
          rating,
          quality,
          sub,
          dub,
          date
        });
      }
    });

    return spotlights;
  } catch (error) {
    throw error;
  }
};

export { extractSpotlight };

// ══════════════════════════════════════════════════════════════ END: spotlight.extractor.js
