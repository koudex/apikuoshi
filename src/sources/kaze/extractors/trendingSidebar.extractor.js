/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Extracts trending sidebar data including top anime rankings
 *   and latest episodes. Provides comprehensive sidebar content.
 *
 * @exports
 *   extractTrendingSidebar
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import * as cheerio from "cheerio";
import { fetchWithMirror } from "../helper/mirror.helper.js";

// ══════════════════════════════════════════════════════════════
// TRENDING SIDEBAR EXTRACTION
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Extract trending sidebar with top rankings and latest episodes ----
/**
 * Fetches and parses the trending sidebar from the homepage.
 * Returns daily, weekly, and monthly top anime plus latest episodes.
 *
 * @returns {Promise<Object>} Object containing day, week, month, and latestEpisodes
 * @returns {Array<Object>} return.day - Daily top anime
 * @returns {Array<Object>} return.week - Weekly top anime
 * @returns {Array<Object>} return.month - Monthly top anime
 * @returns {Array<Object>} return.latestEpisodes - Recently updated episodes
 * @returns {string} return.day[].slug - URL slug for the anime
 * @returns {number} return.day[].rank - Ranking position
 * @returns {string} return.day[].name - Anime name
 * @returns {string} return.day[].poster - Poster image URL
 * @returns {number} return.day[].sub - Subbed episode count
 * @returns {number} return.day[].dub - Dubbed episode count
 * @returns {string} return.day[].type - Anime type
 *
 * @example
 *   const sidebar = await extractTrendingSidebar();
 *   console.log(sidebar.day[0].name); // Top anime today
 *   console.log(sidebar.latestEpisodes[0].title); // Latest episode
 */
const extractTrendingSidebar = async () => {
  try {
    const { data } = await fetchWithMirror("/home");
    const $ = cheerio.load(data);

    const day = [];
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
        day.push({ slug, rank, name, poster, sub, dub, type });
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

    const latestEpisodes = [];
    $("#recent-update .item, .section-updated .item").each((i, el) => {
      const slug = $(el).find("a.name.d-title").attr("href")?.split("/watch/").pop() || "";
      const poster = $(el).find(".poster img").attr("src") || "";
      const title = $(el).find("a.name.d-title").text().trim() || "";
      const japaneseTitle = $(el).find("a.name.d-title").attr("data-jp") || "";
      const sub = parseInt($(el).find(".ep-status.sub span").text().trim()) || 0;
      const dub = parseInt($(el).find(".ep-status.dub span").text().trim()) || 0;
      const total = parseInt($(el).find(".ep-status.total span").text().trim()) || 0;
      const type = $(el).find(".meta .inner .right").text().trim() || "";

      if (slug) {
        latestEpisodes.push({ slug, poster, title, japaneseTitle, sub, dub, total, type });
      }
    });

    return { day, week, month, latestEpisodes };
  } catch (error) {
    throw error;
  }
};

export { extractTrendingSidebar };

// ══════════════════════════════════════════════════════════════ END: trendingSidebar.extractor.js
