/**
 * ============================================================
 *  APIKuoshi — src/core/kitsu.js
 * ============================================================
 *  Kitsu metadata provider (official JSON:API — keyless).
 *
 *  Ported from the AniVault-Scraper design (github.com/SH0MIK/AniVault-Scraper).
 *
 *  Unlike TMDB, Kitsu mirrors MAL's per-season split — Season 2 of an
 *  anime has its own distinct Kitsu anime ID, mapped directly from the
 *  Season 2 MAL ID via /mappings. So there is no season-stripping needed
 *  here; a MAL ID (whichever season) maps straight to the right Kitsu
 *  anime ID, falling back to a plain title search only when that mapping
 *  doesn't exist yet.
 *
 *  Kitsu has NO logo art type (only posterImage/coverImage) and no
 *  per-season art — each Kitsu anime ID has exactly one poster/cover pair.
 * ============================================================
 */
import axios from "axios";
import { cacheGet, cacheSet } from "./cache.js";

const CLIENT = axios.create({
  baseURL: "https://kitsu.app/api/edge",
  timeout: 10000,
  headers: { Accept: "application/vnd.api+json" },
});

/**
 * Resolve a MAL ID (and/or title) to a Kitsu anime ID: MAL mapping first,
 * title search as fallback. Cached under the long-lived mapping bucket
 * since this pairing never changes for a given MAL ID/title.
 */
export async function kitsuAnimeId(malId, animeTitle, log = []) {
  const cacheKey = malId ? `kitsu:id:mal:${malId}` : `kitsu:id:title:${(animeTitle ?? "").toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) {
    log.push("Kitsu ID lookup: cache hit");
    return cached;
  }

  let kitsuId = null;

  if (malId) {
    try {
      const mapRes = await CLIENT.get("/mappings", {
        params: { "filter[externalSite]": "myanimelist/anime", "filter[externalId]": malId, include: "item" },
      });
      for (const item of mapRes.data?.included ?? []) {
        if (item.type === "anime") {
          kitsuId = parseInt(item.id, 10);
          break;
        }
      }
      log.push(`Kitsu mapping: ${kitsuId ? `found ID ${kitsuId}` : "not found"}`);
    } catch (e) {
      log.push(`Kitsu mapping: request failed (${e?.response?.status ?? e?.message})`);
    }
  }

  if (!kitsuId && animeTitle) {
    try {
      const srchRes = await CLIENT.get("/anime", {
        params: { "filter[text]": animeTitle, "page[limit]": 3 },
      });
      const first = srchRes.data?.data?.[0]?.id;
      kitsuId = first ? parseInt(first, 10) : null;
      log.push(`Kitsu title search: ${kitsuId ? `found ID ${kitsuId}` : "not found"}`);
    } catch (e) {
      log.push(`Kitsu title search: request failed (${e?.response?.status ?? e?.message})`);
    }
  }

  cacheSet(cacheKey, kitsuId, 86400);
  return kitsuId;
}

/**
 * Poster + cover (banner) art for a known Kitsu anime ID.
 */
export async function kitsuAnimeImages(kitsuId, isList = false) {
  const log = [];
  const cacheKey = `kitsu:images:${kitsuId}`;
  if (!isList) {
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) {
      log.push("Kitsu images: cache hit");
      return { result: cached, kitsuAnimeId: kitsuId, log };
    }
  }

  try {
    const animeRes = await CLIENT.get(`/anime/${kitsuId}`);
    const attrs = animeRes.data?.data?.attributes;
    if (!attrs) {
      log.push(`Kitsu anime ${kitsuId}: not found`);
      cacheSet(cacheKey, null, 86400);
      return { result: null, kitsuAnimeId: kitsuId, log };
    }

    const posterImg = attrs.posterImage ?? {};
    const coverImg = attrs.coverImage ?? {};
    const poster = posterImg.large ?? posterImg.medium ?? posterImg.original ?? null;
    const posterOriginal = posterImg.original ?? poster;
    const cover = coverImg.large ?? coverImg.original ?? null;
    const coverOriginal = coverImg.original ?? cover;

    if (!poster && !cover) {
      log.push(`Kitsu anime ${kitsuId}: no poster or cover image available`);
      cacheSet(cacheKey, null, 86400);
      return { result: null, kitsuAnimeId: kitsuId, log };
    }

    const result = {
      kitsuAnimeId: kitsuId,
      canonicalTitle: attrs.canonicalTitle ?? null,
      poster,
      posterOriginal,
      cover,
      coverOriginal,
    };
    cacheSet(cacheKey, result, 86400);
    return { result, kitsuAnimeId: kitsuId, log };
  } catch (e) {
    const status = e?.response?.status;
    log.push(`Kitsu anime ${kitsuId}: ${status ? `HTTP ${status}` : `request failed (${e?.message})`}`);
    return { result: null, kitsuAnimeId: kitsuId, log };
  }
}

/**
 * Episode-specific data (title + thumbnail) for a known Kitsu anime ID +
 * episode number. Thumbnail sizes tried largest-first.
 */
export async function kitsuEpisodeData(kitsuId, epNum, isList = false) {
  const log = [];
  const cacheKey = `kitsu:epdata:${kitsuId}:${epNum}`;
  if (!isList) {
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) {
      log.push("Kitsu ep data: cache hit");
      return { result: cached, kitsuAnimeId: kitsuId, log };
    }
  }

  try {
    const epRes = await CLIENT.get(`/anime/${kitsuId}/episodes`, {
      params: { "filter[number]": epNum, "page[limit]": 1 },
    });
    const epData = epRes.data?.data?.[0] ?? null;
    if (!epData) {
      log.push(`Kitsu ep ${epNum}: episode record not found`);
      cacheSet(cacheKey, null, 86400);
      return { result: null, kitsuAnimeId: kitsuId, log };
    }

    const attrs = epData.attributes ?? {};
    const title = attrs.canonicalTitle ?? attrs.titles?.en ?? attrs.titles?.en_us ?? null;
    const titleJapanese = attrs.titles?.ja_jp ?? null;
    const aired = attrs.airdate ?? null;
    const imgs = attrs.thumbnail ?? {};
    let thumbnail = null;
    for (const size of ["original", "large", "medium", "small", "tiny"]) {
      if (imgs[size]) {
        thumbnail = imgs[size];
        break;
      }
    }

    if (!title && !thumbnail) {
      log.push(`Kitsu ep ${epNum}: no title or thumbnail on Kitsu`);
      cacheSet(cacheKey, null, 86400);
      return { result: null, kitsuAnimeId: kitsuId, log };
    }

    const result = {
      kitsuAnimeId: kitsuId,
      episodeId: parseInt(epData.id, 10),
      title,
      titleJapanese,
      aired,
      thumbnail,
    };
    cacheSet(cacheKey, result, 86400);
    return { result, kitsuAnimeId: kitsuId, log };
  } catch (e) {
    const status = e?.response?.status;
    log.push(`Kitsu ep ${epNum}: ${status ? `HTTP ${status}` : `request failed (${e?.message})`}`);
    return { result: null, kitsuAnimeId: kitsuId, log };
  }
}
