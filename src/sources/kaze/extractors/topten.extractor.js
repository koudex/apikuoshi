/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Extracts top 10 anime rankings from the homepage.
 *   Parses daily, weekly, and monthly top anime lists.
 *
 * @exports
 *   extractTopTen
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import * as cheerio from "cheerio";
import { URLS } from "../configs/dataUrl.js";
import { fetchWithMirror } from "../helper/mirror.helper.js";

// ══════════════════════════════════════════════════════════════
// TOP TEN EXTRACTION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Extract daily, weekly, and monthly top 10 anime ----
/**
 * Fetches and parses the top 10 anime rankings from the homepage.
 * Returns three arrays: today, week, and month rankings.
 *
 * @returns {Promise<Object>} Object containing today, week, and month arrays
 * @returns {Array<Object>} return.today - Daily top 10 anime
 * @returns {Array<Object>} return.week - Weekly top 10 anime
 * @returns {Array<Object>} return.month - Monthly top 10 anime
 * @returns {string} return.today[].slug - URL slug for the anime
 * @returns {number} return.today[].rank - Ranking position (1-10)
 * @returns {string} return.today[].name - Anime name
 * @returns {string} return.today[].poster - Poster image URL
 * @returns {number} return.today[].sub - Subbed episode count
 * @returns {number} return.today[].dub - Dubbed episode count
 * @returns {string} return.today[].type - Anime type (TV, Movie, etc.)
 *
 * @example
 *   const topTen = await extractTopTen();
 *   console.log(topTen.today[0].name); // #1 anime today
 */
const extractTopTen = async () => {
  try {
    const { data } = await fetchWithMirror("/home");
    const $ = cheerio.load(data);

    const today = [];
    const week = [];
    const month = [];

    $("#top-anime .tab-content[data-name='day'] a.item").each((i, el) => {
      const slug = $(el).attr("href")?.split("/watch/").pop() || "";
      const poster = $(el).find(".poster img").attr("src") || "";
      const name = $(el).find(".name").text().trim() || "";
      const sub = parseInt($(el).find(".ep-status.sub span").text().trim()) || 0;
      const dub = parseInt($(el).find(".ep-status.dub span").text().trim()) || 0;
      const type = $(el).find(".type").text().trim() || "";
      const rank = i + 1;

      if (slug) {
        today.push({ slug, rank, name, poster, sub, dub, type });
      }
    });

    $("#top-anime .tab-content[data-name='week'] a.item").each((i, el) => {
      const slug = $(el).attr("href")?.split("/watch/").pop() || "";
      const poster = $(el).find(".poster img").attr("src") || "";
      const name = $(el).find(".name").text().trim() || "";
      const sub = parseInt($(el).find(".ep-status.sub span").text().trim()) || 0;
      const dub = parseInt($(el).find(".ep-status.dub span").text().trim()) || 0;
      const type = $(el).find(".type").text().trim() || "";
      const rank = i + 1;

      if (slug) {
        week.push({ slug, rank, name, poster, sub, dub, type });
      }
    });

    $("#top-anime .tab-content[data-name='month'] a.item").each((i, el) => {
      const slug = $(el).attr("href")?.split("/watch/").pop() || "";
      const poster = $(el).find(".poster img").attr("src") || "";
      const name = $(el).find(".name").text().trim() || "";
      const sub = parseInt($(el).find(".ep-status.sub span").text().trim()) || 0;
      const dub = parseInt($(el).find(".ep-status.dub span").text().trim()) || 0;
      const type = $(el).find(".type").text().trim() || "";
      const rank = i + 1;

      if (slug) {
        month.push({ slug, rank, name, poster, sub, dub, type });
      }
    });

    return { today, week, month };
  } catch (error) {
    throw error;
  }
};

export { extractTopTen };

// ══════════════════════════════════════════════════════════════ END: topten.extractor.js
