/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Extracts anime schedule for a specific date.
 *   Returns airing times and episode numbers for scheduled anime.
 *
 * @exports
 *   extractSchedule
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import * as cheerio from "cheerio";
import { URLS } from "../configs/dataUrl.js";
import { fetchWithMirror } from "../helper/mirror.helper.js";

// ══════════════════════════════════════════════════════════════
// SCHEDULE EXTRACTION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Extract anime schedule for a specific date ----
/**
 * Fetches and parses the anime schedule for a given date.
 * Returns airing times and episode numbers for scheduled anime.
 *
 * @param {string} date - Date to fetch schedule for (format: YYYY-MM-DD)
 * @returns {Promise<Array<Object>>} Array of scheduled anime objects
 * @returns {string} return.slug - URL slug for the anime
 * @returns {string} return.title - Anime title
 * @returns {string} return.time - Airing time
 * @returns {number} return.episode_no - Episode number
 *
 * @example
 *   const schedule = await extractSchedule("2024-01-15");
 *   console.log(schedule[0].time); // Airing time
 *   console.log(schedule[0].episode_no); // Episode number
 */
const extractSchedule = async (date) => {
  try {
    // NOTE: The schedule data is loaded via AJAX endpoint, not a static page
    const path = `/ajax/schedule?date=${date}`;
    const { data: raw } = await fetchWithMirror(path, {
      headers: { "X-Requested-With": "XMLHttpRequest" }
    });

    // NOTE: Parse JSON response first — fetchWithMirror returns raw text by default
    let parsed = raw;
    if (typeof raw === "string") {
      try { parsed = JSON.parse(raw); } catch { parsed = {}; }
    }
    const html = parsed?.result || "";
    const $ = cheerio.load(html);

    const schedule = [];

    // NOTE: Schedule items live inside .item with .time, .ep, .title structure
    $(".item").each((i, el) => {
      const title = $(el).find(".title").text().trim() || "";
      const jpTitle = $(el).find(".title").attr("data-jp") || "";
      const time = $(el).find(".time").text().trim() || "";
      const episodeText = $(el).find(".ep span").text().trim() || "";
      const episodeNo = parseInt(episodeText.replace(/\D/g, "")) || 0;
      // NOTE: Items may not have direct links — use title as identifier
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "";

      if (title) {
        schedule.push({
          slug,
          title,
          japaneseTitle: jpTitle,
          time,
          episode_no: episodeNo
        });
      }
    });

    return schedule;
  } catch (error) {
    throw error;
  }
};

export { extractSchedule };

// ══════════════════════════════════════════════════════════════ END: schedule.extractor.js
