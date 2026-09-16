/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Extracts the full watch/episode page data from anikototv.to including
 *   anime metadata, server list, trending sidebar, and recommended anime.
 *
 * @exports
 *   extractWatchPage
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import * as cheerio from "cheerio";
import { fetchWithMirror } from "../helper/mirror.helper.js";

// ══════════════════════════════════════════════════════════════
// WATCH PAGE EXTRACTOR
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Extract complete watch page data for a specific episode ----
/**
 * Fetches and parses the episode watch page from anikototv.to. Extracts
 * anime metadata, episode details, available streaming servers, trending
 * sidebar, and recommended anime.
 *
 * @param {string} slug - The anime slug (e.g. "one-piece")
 * @param {string|number} ep - The episode number to watch
 * @returns {Promise<Object>} Full watch page data object
 *
 * @example
 *   const watchData = await extractWatchPage("one-piece", 100);
 *   console.log(watchData.servers.length); // number of available servers
 *   console.log(watchData.title);          // anime title
 */
const extractWatchPage = async (slug, ep) => {
  try {
    const path = `/watch/${slug}/ep-${ep}`;
    const { data } = await fetchWithMirror(path);
    const $ = cheerio.load(data);

    const animeId = parseInt($("#watch-main").attr("data-id")) || 0;
    const animeUrl = $("#watch-main").attr("data-url") || "";
    const title = $("h1[itemprop='name'].title.d-title").text().trim() || slug;
    const japaneseTitle = $("h1[itemprop='name'].title.d-title").attr("data-jp") || "";
    const episodeNumber = parseInt(ep) || 0;

    const synopsis = $(".synopsis .content").text().trim() || "";
    const rating = $("#w-rating .score .value").text().trim() || "";
    const poster = $("img[itemprop='image']").attr("src") || "";
    const backgroundImage = $("#player").css("background-image")?.match(/url\(['"]?(.+?)['"]?\)/)?.[1] || "";

    const type = $(".bmeta .meta:first-child > div:nth-child(1) span").text().trim() || "";
    const status = $(".bmeta .meta:first-child > div:nth-child(4) span a").text().trim() || "";
    const malScore = $(".bmeta .meta:nth-child(2) > div:nth-child(1) span").text().trim() || "";
    const duration = $(".bmeta .meta:nth-child(2) > div:nth-child(2) span").text().trim() || "";
    const episodes = $(".bmeta .meta:nth-child(2) > div:nth-child(3) span").text().trim() || "";

    const genres = [];
    $(".bmeta .meta:first-child > div:nth-child(5) span a[href*='/genre/']").each((i, el) => {
      genres.push($(el).text().trim());
    });

    const studios = [];
    $(".bmeta .meta:nth-child(2) > div:nth-child(4) span a[itemprop='director'] span[itemprop='name']").each((i, el) => {
      studios.push($(el).text().trim());
    });

    const nextEpisodeDate = $(".next-episode, .alert.next-episode").text().trim() || "";
    const nextEpisodeTimestamp = parseInt($(".count-down").attr("data-target")) || 0;

    const servers = [];
    $("#w-servers .servers .type li, #w-servers li[data-link-id]").each((i, el) => {
      const linkId = $(el).attr("data-link-id") || "";
      const epId = $(el).attr("data-ep-id") || "";
      const cmId = $(el).attr("data-cmid") || "";
      const svId = $(el).attr("data-sv-id") || "";
      const serverName = $(el).text().trim() || "";
      const serverType = $(el).closest(".type").attr("data-type") || "";

      if (linkId) {
        servers.push({
          linkId,
          epId,
          cmId,
          svId,
          name: serverName,
          type: serverType
        });
      }
    });

    const trending = [];
    $(".w-side-section:first .scaff.side.items a.item, #watch-order a.item").each((i, el) => {
      const trendSlug = $(el).attr("href")?.split("/watch/").pop() || "";
      const trendPoster = $(el).find(".poster img").attr("src") || "";
      const trendTitle = $(el).find(".name").text().trim() || "";
      const trendType = $(el).find(".dot:last-child").text().trim() || "";
      const trendScore = $(el).find(".score").text().trim() || "";

      if (trendSlug) {
        trending.push({
          slug: trendSlug,
          poster: trendPoster,
          title: trendTitle,
          type: trendType,
          score: trendScore
        });
      }
    });

    const recommended = [];
    $(".w-side-section:has(.title:contains('Recommended')) a.item, aside.sidebar:last .w-side-section a.item").each((i, el) => {
      const recSlug = $(el).attr("href")?.split("/watch/").pop() || "";
      const recPoster = $(el).find(".poster img").attr("src") || "";
      const recTitle = $(el).find(".name").text().trim() || "";
      const recType = $(el).find(".dot:last-child").text().trim() || "";

      if (recSlug) {
        recommended.push({
          slug: recSlug,
          poster: recPoster,
          title: recTitle,
          type: recType
        });
      }
    });

    return {
      slug,
      animeId,
      animeUrl,
      title,
      japaneseTitle,
      episodeNumber,
      synopsis,
      type,
      status,
      malScore,
      duration,
      episodes,
      studios,
      genres,
      rating,
      poster,
      backgroundImage,
      nextEpisodeDate,
      nextEpisodeTimestamp,
      servers,
      trending,
      recommended
    };
  } catch (error) {
    throw error;
  }
};

export { extractWatchPage };

// ══════════════════════════════════════════════════════════════ END: watchPage.extractor.js
