/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Extracts upcoming anime from the homepage section.
 *   Scrapes the #upcoming-anime section for future releases.
 *
 * @exports
 *   extractUpcomingAnime
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import * as cheerio from "cheerio";
import { fetchWithMirror } from "../helper/mirror.helper.js";

// ══════════════════════════════════════════════════════════════
// UPCOMING ANIME EXTRACTION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Extract upcoming anime from homepage section ----
/**
 * Fetches and parses the upcoming anime section from the homepage.
 * Returns a list of anime that are scheduled for future release.
 *
 * @returns {Promise<Array<Object>>} Array of upcoming anime objects
 * @returns {string} return[].slug - URL slug for the anime
 * @returns {string} return[].poster - Poster image URL
 * @returns {string} return[].title - English title
 * @returns {string} return[].japaneseTitle - Japanese title
 * @returns {string} return[].type - Anime type (TV, Movie, etc.)
 * @returns {string} return[].releaseDate - Expected release date
 *
 * @example
 *   const upcoming = await extractUpcomingAnime();
 *   console.log(upcoming.length); // number of upcoming anime
 *   console.log(upcoming[0].title); // first upcoming anime title
 */
const extractUpcomingAnime = async () => {
  try {
    const { data } = await fetchWithMirror("/home");
    const $ = cheerio.load(data);

    const results = [];

    // NOTE: upcoming-anime section contains future releases
    $("#upcoming-anime .item, .upcoming .item").each((i, el) => {
      const slug = $(el).find("a").attr("href")?.split("/watch/").pop() || "";
      if (!slug) return;

      const poster = $(el).find("img").attr("src") || "";
      const title = $(el).find(".film-name a, .name.d-title, a.name").text().trim() || "";
      const japaneseTitle = $(el).find(".name.d-title, a.name").attr("data-jp") || "";
      const type = $(el).find(".type, .fdi-item:nth-child(2)").text().trim() || "";
      const releaseDate = $(el).find(".date, .release-date").text().trim() || "";

      results.push({ slug, poster, title, japaneseTitle, type, releaseDate });
    });

    return results;
  } catch (error) {
    throw error;
  }
};

export { extractUpcomingAnime };

// ══════════════════════════════════════════════════════════════ END: upcomingAnime.extractor.js
