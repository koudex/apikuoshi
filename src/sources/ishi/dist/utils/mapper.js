"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.malToAnilist = malToAnilist;
exports.getSiteIds = getSiteIds;
exports.getSiteIdsByMal = getSiteIdsByMal;
exports.searchAnilist = searchAnilist;
const axios_1 = __importDefault(require("axios"));
const fetch_1 = require("./fetch");
const cache_1 = require("./cache");
const animeheaven_1 = require("../scrapers/animeheaven");
const anikoto_1 = require("../scrapers/anikoto");
const desidub_1 = require("../scrapers/desidub");
const mal_1 = require("../scrapers/mal");
async function enrichAnimeHeaven(result, altTitle) {
    if (result.siteIds.animeheaven || result.title === 'Unknown')
        return result;
    const id = await (0, animeheaven_1.findAnimeHeavenId)(result.title).catch(() => null);
    if (id) {
        result.siteIds.animeheaven = id;
        return result;
    }
    if (altTitle && altTitle !== result.title) {
        const altId = await (0, animeheaven_1.findAnimeHeavenId)(altTitle).catch(() => null);
        if (altId)
            result.siteIds.animeheaven = altId;
    }
    return result;
}
// Anikoto's own site displays/searches by the localized English title, not
// the JP romaji — so callers whose `result.title` is romaji (e.g. the
// MAL-fallback path) MUST also pass the English title here, or every match
// will legitimately score too low and get rejected (see findAnikotoSlug's
// MIN_MATCH_SCORE). Tries `result.title` first, falls back to `altTitle`.
async function enrichAnikoto(result, altTitle) {
    if (result.siteIds.anikoto || result.title === 'Unknown')
        return result;
    const slug = await (0, anikoto_1.findAnikotoSlug)(result.title).catch(() => null);
    if (slug) {
        result.siteIds.anikoto = slug;
        return result;
    }
    if (altTitle && altTitle !== result.title) {
        const altSlug = await (0, anikoto_1.findAnikotoSlug)(altTitle).catch(() => null);
        if (altSlug)
            result.siteIds.anikoto = altSlug;
    }
    return result;
}
async function enrichDesidub(result, altTitle) {
    if (result.siteIds.desidub || result.title === 'Unknown')
        return result;
    const slug = await (0, desidub_1.findDesidubSlug)(result.title).catch(() => null);
    if (slug) {
        result.siteIds.desidub = slug;
        return result;
    }
    if (altTitle && altTitle !== result.title) {
        const altSlug = await (0, desidub_1.findDesidubSlug)(altTitle).catch(() => null);
        if (altSlug)
            result.siteIds.desidub = altSlug;
    }
    return result;
}
// MAL ID → AniList ID
// Returns null (never throws) if AniList is down/unreachable -- callers use
// that as the signal to fall back to the MAL-only path (getSiteIdsByMal).
async function malToAnilist(malId) {
    const cacheKey = `mal2al:${malId}`;
    const cached = (0, cache_1.cacheGet)(cacheKey);
    if (cached)
        return cached;
    try {
        const query = `query ($malId: Int) {
      Media(idMal: $malId, type: ANIME) { id idMal title { romaji english } }
    }`;
        const res = await fetch_1.anilistClient.post('', { query, variables: { malId } });
        const id = res.data?.data?.Media?.id ?? null;
        if (id)
            (0, cache_1.cacheSet)(cacheKey, id);
        return id;
    }
    catch {
        return null;
    }
}
// Fetch title from AniList for a given anilistId
async function getAnilistTitle(anilistId) {
    const query = `query ($id: Int) {
    Media(id: $id, type: ANIME) { idMal title { romaji english } }
  }`;
    const res = await fetch_1.anilistClient.post('', { query, variables: { id: anilistId } });
    const media = res.data?.data?.Media;
    const english = media?.title?.english ?? null;
    const romaji = media?.title?.romaji ?? null;
    return {
        title: english ?? romaji ?? 'Unknown',
        altTitle: english && romaji && english !== romaji ? romaji : null,
        malId: media?.idMal ?? null,
    };
}
// AniList ID → metadata + site-specific IDs
async function getSiteIds(anilistId) {
    const cacheKey = `siteids:${anilistId}`;
    const cached = (0, cache_1.cacheGet)(cacheKey);
    if (cached) {
        const wasMissingAnimeHeaven = !cached.siteIds.animeheaven;
        const wasMissingAnikoto = !cached.siteIds.anikoto;
        const wasMissingDesidub = !cached.siteIds.desidub;
        const enriched = await enrichDesidub(await enrichAnikoto(await enrichAnimeHeaven(cached, cached.altTitle), cached.altTitle), cached.altTitle);
        if ((wasMissingAnimeHeaven && enriched.siteIds.animeheaven) || (wasMissingAnikoto && enriched.siteIds.anikoto) || (wasMissingDesidub && enriched.siteIds.desidub)) {
            (0, cache_1.cacheSet)(cacheKey, enriched);
        }
        return enriched;
    }
    // Build result shell using AniList (always reliable for title + malId)
    const alInfo = await getAnilistTitle(anilistId).catch(() => ({ title: 'Unknown', altTitle: null, malId: null }));
    const result = {
        anilistId,
        malId: alInfo.malId,
        title: alInfo.title,
        altTitle: alInfo.altTitle,
        siteIds: {},
    };
    // Try Anify for site mappings
    try {
        const res = await axios_1.default.get(`https://api.anify.tv/info/${anilistId}`, {
            params: { fields: 'mappings' },
            timeout: 8000,
        });
        const mappings = res.data?.mappings ?? [];
        for (const m of mappings) {
            if (m.providerId === 'zoro')
                result.siteIds.zoro = m.id;
            if (m.providerId === 'gogoanime')
                result.siteIds.gogoanime = m.id;
            if (m.providerId === 'mal' && !result.malId)
                result.malId = parseInt(m.id);
        }
    }
    catch {
        // Anify down or missing — fall through to direct scraper fallbacks below
    }
    await enrichAnimeHeaven(result, result.altTitle);
    await enrichAnikoto(result, result.altTitle);
    await enrichDesidub(result, result.altTitle);
    // If still no zoro ID, try a slug guess (title-anilistId format common on HiAnime clones)
    // This is a heuristic and may not always work
    if (!result.siteIds.zoro && result.title !== 'Unknown') {
        const slug = result.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        result.siteIds.zoro = `${slug}-${anilistId}`;
    }
    (0, cache_1.cacheSet)(cacheKey, result);
    return result;
}
// AniList-free fallback: build SiteIds from a MAL ID alone (title comes from
// your own MAL scraper instead of AniList's getAnilistTitle). Used when
// malToAnilist can't resolve an AniList ID (AniList down/blocked). Note:
// zoro/gogoanime via Anify both key off anilistId, so
// those stay unavailable here -- everything keyed off title (animeheaven,
// anikoto, desidub) still works normally.
async function getSiteIdsByMal(malId) {
    const cacheKey = `siteids:mal:${malId}`;
    const cached = (0, cache_1.cacheGet)(cacheKey);
    if (cached) {
        const wasMissingAnimeHeaven = !cached.siteIds.animeheaven;
        const wasMissingAnikoto = !cached.siteIds.anikoto;
        const wasMissingDesidub = !cached.siteIds.desidub;
        const enriched = await enrichDesidub(await enrichAnikoto(await enrichAnimeHeaven(cached, cached.altTitle), cached.altTitle), cached.altTitle);
        if ((wasMissingAnimeHeaven && enriched.siteIds.animeheaven) || (wasMissingAnikoto && enriched.siteIds.anikoto) || (wasMissingDesidub && enriched.siteIds.desidub)) {
            (0, cache_1.cacheSet)(cacheKey, enriched);
        }
        return enriched;
    }
    const details = await (0, mal_1.getAnimeDetails)(malId).catch(() => null);
    if (!details)
        return null;
    // details.title is MAL's romaji/native title; details.titleEnglish is the
    // localized one. Anikoto (and most streaming clones) index by the English
    // title, so that has to be tried too, not just whichever MAL calls
    // "the" title.
    const romajiTitle = details.title || null;
    const englishTitle = details.titleEnglish || null;
    const result = {
        anilistId: null,
        malId,
        title: romajiTitle || englishTitle || 'Unknown',
        altTitle: englishTitle && romajiTitle && englishTitle !== romajiTitle ? englishTitle : null,
        siteIds: {},
    };
    await enrichAnimeHeaven(result, result.altTitle);
    await enrichAnikoto(result, result.altTitle);
    await enrichDesidub(result, result.altTitle);
    (0, cache_1.cacheSet)(cacheKey, result);
    return result;
}
// Search AniList by title
async function searchAnilist(query) {
    const cacheKey = `alsearch:${query.toLowerCase().trim()}`;
    const cached = (0, cache_1.cacheGet)(cacheKey);
    if (cached)
        return cached;
    const gql = `query ($search: String) {
    Page(page: 1, perPage: 10) {
      media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
        id idMal episodes
        title { romaji english }
        coverImage { large medium }
        status format
      }
    }
  }`;
    const res = await fetch_1.anilistClient.post('', { query: gql, variables: { search: query } });
    const list = res.data?.data?.Page?.media ?? [];
    const results = list.map((m) => ({
        id: m.id,
        malId: m.idMal ?? null,
        title: m.title?.english ?? m.title?.romaji,
        coverImage: m.coverImage?.large ?? m.coverImage?.medium ?? '',
        episodes: m.episodes ?? null,
        status: m.status,
        format: m.format,
    }));
    (0, cache_1.cacheSet)(cacheKey, results, 'episodes');
    return results;
}
//# sourceMappingURL=mapper.js.map