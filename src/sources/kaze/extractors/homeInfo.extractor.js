/*
 * ======= • ======= • ======= • ======= • =======• =======
 * APIKuoshi — internal lane module

 *
 * @description
 *   Extracts homepage data from anikototv.to including spotlight carousel,
 *   trending anime, top airing list, and available genre filters.
 *
 * @exports
 *   extractHomeInfo
 *
 * @author  Shinei Nouzen
 * @license MIT
 * ======= • ======= • ======= • ======= • =======• =======
 */

import * as cheerio from "cheerio";
import { fetchWithMirror } from "../helper/mirror.helper.js";

// ══════════════════════════════════════════════════════════════
// HOME INFO EXTRACTOR
// ══════════════════════════════════════════════════════════════

// ---- FEATURE: Extract full homepage data (spotlights, trending, top airing, genres) ----
/**
 * Fetches and parses the anikototv.to homepage to extract spotlight carousel,
 * recently updated trending anime, top airing of the day, and genre list.
 *
 * @returns {Promise<Object>} Object containing spotlights, trending, topAiring, and genres arrays
 *
 * @example
 *   const home = await extractHomeInfo();
 *   console.log(home.spotlights.length); // number of spotlight items
 */
const extractHomeInfo = async () => {
  try {
    const { data } = await fetchWithMirror("/home");
    const $ = cheerio.load(data);

    const spotlights = [];
    // NOTE: #hotest .swiper-slide.item = spotlight carousel on homepage
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

    const trending = [];
    // NOTE: Dual selector — .section-updated = new layout, #recent-update = old layout
    $(".section-updated .item, #recent-update .item").each((i, el) => {
      const slug = $(el).find("a.name.d-title").attr("href")?.split("/watch/").pop() || "";
      const poster = $(el).find(".poster img").attr("src") || "";
      const title = $(el).find("a.name.d-title").text().trim() || "";
      const japaneseTitle = $(el).find("a.name.d-title").attr("data-jp") || "";
      const sub = parseInt($(el).find(".ep-status.sub span").text().trim()) || 0;
      const dub = parseInt($(el).find(".ep-status.dub span").text().trim()) || 0;
      const total = parseInt($(el).find(".ep-status.total span").text().trim()) || 0;
      const type = $(el).find(".meta .inner .right").text().trim() || "";

      if (slug) {
        trending.push({
          slug,
          poster,
          title,
          japaneseTitle,
          sub,
          dub,
          total,
          type
        });
      }
    });

    const topAiring = [];
    $("#top-anime .tab-content[data-name='day'] a.item").each((i, el) => {
      const slug = $(el).attr("href")?.split("/watch/").pop() || "";
      const poster = $(el).find(".poster img").attr("src") || "";
      const title = $(el).find(".name").text().trim() || "";
      const sub = parseInt($(el).find(".ep-status.sub span").text().trim()) || 0;
      const dub = parseInt($(el).find(".ep-status.dub span").text().trim()) || 0;
      const type = $(el).find(".type").text().trim() || "";

      if (slug) {
        topAiring.push({ slug, poster, title, sub, dub, type });
      }
    });

    const genres = [];
    $("#menu ul.c4 li a").each((i, el) => {
      const genre = $(el).text().trim();
      const href = $(el).attr("href") || "";
      if (genre && href.includes("/genre/")) {
        genres.push(genre);
      }
    });

    return {
      spotlights,
      trending,
      topAiring,
      genres
    };
  } catch (error) {
    throw error;
  }
};

export { extractHomeInfo };

// ══════════════════════════════════════════════════════════════ END: homeInfo.extractor.js
