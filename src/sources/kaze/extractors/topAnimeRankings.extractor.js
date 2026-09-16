/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Extracts top anime rankings from the homepage with sort options.
 *   Supports both "top" (all-time) and "newest" ranking modes.
 *   Parses ranked items with position numbers 1-9.
 *
 * @exports
 *   extractTopAnimeRankings
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import * as cheerio from "cheerio";
import { fetchWithMirror } from "../helper/mirror.helper.js";

// ══════════════════════════════════════════════════════════════
// TOP ANIME RANKINGS EXTRACTION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Extract top anime rankings with sort option ----
/**
 * Fetches and parses the top anime rankings from the homepage.
 * Supports switching between "top" (all-time) and "newest" rankings.
 *
 * @param {string} sort - Ranking sort mode: "day", "week", or "month" (default: "day")
 * @returns {Promise<Array<Object>>} Array of ranked anime objects
 * @returns {number} return[].rank - Ranking position (1-9)
 * @returns {string} return[].slug - URL slug for the anime
 * @returns {string} return[].poster - Poster image URL
 * @returns {string} return[].title - Anime title
 * @returns {string} return[].japaneseTitle - Japanese title
 * @returns {number} return[].sub - Subbed episode count
 * @returns {number} return[].dub - Dubbed episode count
 * @returns {string} return[].type - Anime type
 * @returns {string} return[].views - View count
 *
 * @example
 *   const topAnime = await extractTopAnimeRankings("top");
 *   console.log(topAnime[0].rank); // 1
 *   console.log(topAnime[0].title); // #1 anime
 *
 *   const newest = await extractTopAnimeRankings("newest");
 *   console.log(newest[0].title); // #1 newest anime
 */
const extractTopAnimeRankings = async (sort = "top") => {
  try {
    // NOTE: Homepage contains both top and newest rankings in tabbed sections
    const { data } = await fetchWithMirror("/home");
    const $ = cheerio.load(data);

    const results = [];

    // NOTE: Ranking items live inside #top-anime .tab-content .scaff.side.items
    // Each item is an <a class="item rankN"> with rank classes rank1..rank9
    // The data-name on .tab-content controls which tab: day/week/month
    const tabSelector = sort === "week" ? "[data-name='week']"
      : sort === "month" ? "[data-name='month']"
      : "[data-name='day']";

    $(`#top-anime .tab-content${tabSelector} a.item, #top-anime .scaff.side.items a.item`).each((i, el) => {
      const slug = $(el).attr("href")?.split("/watch/").pop() || "";
      if (!slug) return;

      const poster = $(el).find("img").attr("src") || "";
      const title = $(el).find(".name").text().trim() || "";
      const japaneseTitle = $(el).find(".name").attr("data-jp") || "";
      const sub = parseInt($(el).find(".ep-status.sub span").text().trim()) || 0;
      const dub = parseInt($(el).find(".ep-status.dub span").text().trim()) || 0;
      const type = $(el).find(".meta .dot:last-child").text().trim() || "";

      // NOTE: Rank is extracted from the rankN class on the <a> element
      const rankClass = [...$(el).attr("class") || ""].join(" ").match(/rank(\d+)/);
      const rank = rankClass ? parseInt(rankClass[1]) : i + 1;

      results.push({ rank, slug, poster, title, japaneseTitle, sub, dub, type });
    });

    return results;
  } catch (error) {
    throw error;
  }
};

export { extractTopAnimeRankings };

// ══════════════════════════════════════════════════════════════ END: topAnimeRankings.extractor.js
