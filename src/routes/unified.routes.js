/**
 * ============================================================
 *  APIKuoshi — src/routes/unified.routes.js          v2.0.0
 * ============================================================
 *  THE API SURFACE. One shape, one schema, one identity.
 *
 *  Families:
 *    CORE     /search /suggestions /resolve
 *    ANIME    /anime /anime/episodes /anime/servers
 *    PLAYBACK /watch /download /chain
 *    BROWSE   /home /spotlight /trending /trending-sidebar /top-ten
 *             /top-rankings /popular /random /upcoming /completed
 *             /new-release /newly-added /latest-updated
 *             /recently-updated /schedule /airing
 *    CATALOG  /az-list/:letter /filter /genre/:genre /type/:type
 *             /status/:status /seasons/:slug /watch-order/:slug
 *    META     /meta /meta/characters /meta/recommendations
 *             /meta/season /meta/mal /meta/external /meta/trending
 *             /meta/art /meta/tmdb /meta/kitsu /meta/episode
 *             /meta/episodes
 *    INFRA    /proxy/hls /proxy/video /proxy/subtitle
 *
 *  Every list-shaped response is normalized to:
 *    { success, api, kind?, count, results: [...] }
 *  Every anime-shaped response is keyed canonically:
 *    ?key=anilist:<id> | mal:<id> | <anilist id> | <title>
 * ============================================================
 */
import { Router as expressRouter } from "express";
import axios from "axios";
import { withFallback, unifiedSearch } from "../core/fallback.js";
import {
  anilistById, anilistDetail,
  anilistCharacters, anilistRecommendations, anilistSeason,
} from "../core/anilist.js";
import { getLane } from "../core/registry.js";
import { resolveArt } from "../core/art.js";
import { extractSeasonHint, tmdbAnimeImages, tmdbEpisodeData, tmdbEnabled, tmdbShowEpisodeCount } from "../core/tmdb.js";
import { kitsuAnimeId, kitsuAnimeImages, kitsuEpisodeData } from "../core/kitsu.js";
import { anilistStreamingEpisodes } from "../core/anilist.js";
import { runStreamingChain, malEpisodeIndex } from "../core/chain.js";
import { resolveKeyToAnilist, matchSlug, canonicalFor, keyFor } from "../core/keys.js";
import { CustomError } from "../core/errors.js";
import { withCache, cacheGet, cacheSet } from "../core/cache.js";
import config from "../config.js";

const router = expressRouter();

// ---------------------------------------------------------------- helpers

const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (err) {
    next(err);
  }
};

const page = (req) => parseInt(req.query.page, 10) || 1;
const keyOf = (req) => req.query.key || req.query.id;

/** Referer some stream CDNs expect — they 403 without it. */
const STREAM_REFERER = process.env.STREAM_PROXY_REFERER || "https://megaplay.buzz/";

const isHlsUrl = (url = "") => String(url).toLowerCase().includes(".m3u8");

/** Build a same-origin playback URL through the built-in CORS proxies. */
function proxiedUrl(url, referer = null) {
  if (!url) return null;
  const ref = referer ? `&ref=${encodeURIComponent(referer)}` : "";
  const enc = encodeURIComponent(url);
  return isHlsUrl(url) ? `/api/proxy/hls?url=${enc}${ref}` : `/api/proxy/video?url=${enc}${ref}`;
}

/** Strip internal bookkeeping fields from any public item (recursive).
 *  Also removes upstream page-tracing URLs — clients never need the
 *  internal fetcher's own page links, and responses stay origin-neutral. */
const INTERNAL_FIELDS = ["lane", "listingId", "source", "sourceId", "subSource", "channel", "raw", "kind"];
const SITE_HOST_RE = /^https?:\/\/[^/]*anikoto/i;

function cleanValue(v) {
  if (Array.isArray(v)) return v.map(cleanValue).filter((x) => x !== undefined);
  if (v && typeof v === "object") return stripInternal(v);
  return v;
}

function stripInternal(item) {
  if (!item || typeof item !== "object") return item;
  const out = {};
  for (const [k, v] of Object.entries(item)) {
    if (INTERNAL_FIELDS.includes(k)) continue;
    if (typeof v === "string" && SITE_HOST_RE.test(v)) continue;
    out[k] = cleanValue(v);
  }
  return out;
}

/** Normalize one playable stream for the public surface.
 *
 *  kind = "direct"  — url is a real m3u8/mp4 a <video> tag can play;
 *                     carries proxiedUrl (same-origin CORS-free playback)
 *  kind = "embed"   — url/embedUrl is a player PAGE (iframe playback);
 *                     proxiedUrl is null because proxying an embed page
 *                     yields HTML, not media
 */
function publicStream(s, referer = null) {
  if (!s?.url && !s?.embedUrl) return null;
  const url = s.url || null;
  const isDirect = Boolean(url) && (isHlsUrl(url) || /\.(mp4|mkv|webm)(\?|$)/i.test(url));
  const kind = url ? (isDirect ? "direct" : "embed") : "embed";
  const out = {
    provider: s.provider || "server",
    type: s.type || null,
    url,
    embedUrl: s.embedUrl || null,
    proxiedUrl: url && isDirect ? proxiedUrl(url, s.referer || referer) : null,
    isHls: Boolean(s.isHls) || isHlsUrl(url || ""),
    kind,
  };
  if (s.subtitles?.length) out.subtitles = s.subtitles;
  if (s.skipIntro) out.skipIntro = s.skipIntro;
  if (s.qualities?.length) out.qualities = s.qualities;
  return out;
}

/** Public anime object from the canonical AniList entry. */
function publicAnime(canonical, extra = {}) {
  if (!canonical) return { ...extra };
  return {
    key: keyFor(canonical.anilistId),
    anilistId: canonical.anilistId ?? null,
    malId: canonical.malId ?? null,
    title: canonical.title ?? null,
    titleRomaji: canonical.titleRomaji ?? null,
    titleEnglish: canonical.titleEnglish ?? null,
    poster: canonical.poster ?? null,
    banner: canonical.banner ?? null,
    year: canonical.year ?? null,
    type: canonical.format ?? null,
    episodes: canonical.episodes ?? null,
    status: canonical.status ?? null,
    genres: canonical.genres ?? [],
    synonyms: canonical.synonyms ?? [],
    synopsis: canonical.synopsis ?? null,
    ...extra,
  };
}

// ================================================================ CORE
/**
 * GET /api/search?q=naruto [&page=1]
 * One deduplicated list — romaji/English duplicates are merged silently.
 */
router.get("/search", wrap(async (req, res) => {
  const q = req.query.q || req.query.keyword || req.query.query;
  if (!q) throw new CustomError("Missing ?q= (search term)", 400);
  const data = await unifiedSearch(q, page(req));
  const results = data.groups.map(({ lanes, _first, ...pub }) => pub);
  res.json({ success: true, api: "APIKuoshi", query: q, page: data.page, count: results.length, results });
}));

/**
 * GET /api/suggestions?keyword=one
 * Live typeahead — light and fast.
 */
router.get("/suggestions", wrap(async (req, res) => {
  const keyword = req.query.keyword || req.query.q;
  if (!keyword) throw new CustomError("Missing ?keyword=", 400);
  const lane = getLane("kaze");
  const suggestions = await lane.suggestions(keyword);
  res.json({ success: true, api: "APIKuoshi", keyword, suggestions: Array.isArray(suggestions) ? suggestions : [] });
}));

/**
 * GET /api/resolve?title=frieren
 * Turn any title into the canonical key + confirm playability.
 */
router.get("/resolve", wrap(async (req, res) => {
  const title = req.query.title || req.query.q;
  if (!title) throw new CustomError("Missing ?title=", 400);

  const { anilistId, canonical } = await canonicalFor(title);
  const key = keyFor(anilistId);

  // quick playability probe (both probes are internally cached)
  const kaze = getLane("kaze");
  const ishi = getLane("ishi");
  const [slugMatch, siteIds] = await Promise.allSettled([
    matchSlug(kaze, canonical),
    import("../sources/ishi/dist/utils/mapper.js").then((m) => m.getSiteIds(anilistId)).catch(() => null),
  ]);
  const playable = Boolean(slugMatch.status === "fulfilled" && slugMatch.value) ||
    Boolean(siteIds.status === "fulfilled" && siteIds.value?.siteIds);

  res.json({
    success: true,
    api: "APIKuoshi",
    title,
    found: true,
    playable,
    key,
    anime: publicAnime(canonical),
  });
}));

// ================================================================ ANIME
/**
 * GET /api/anime?key=anilist:154587
 * Full info for one anime + the endpoint map for it.
 */
router.get("/anime", wrap(async (req, res) => {
  const key = keyOf(req);
  const { anilistId, canonical } = await canonicalFor(key);
  const enc = encodeURIComponent(key || String(anilistId));

  res.json({
    success: true,
    api: "APIKuoshi",
    key: keyFor(anilistId),
    anime: publicAnime(canonical),
    endpoints: {
      episodes: `/api/anime/episodes?key=${enc}`,
      servers: `/api/anime/servers?key=${enc}&ep=1`,
      watch: `/api/watch?key=${enc}&ep=1`,
      download: `/api/download?key=${enc}&ep=1`,
      meta: `/api/meta?key=${enc}`,
      chain: `/api/chain?key=${enc}&ep=1`,
    },
  });
}));

/**
 * GET /api/anime/episodes?key=...
 * One flat episode list with REAL per-episode titles (when MAL has them).
 *
 * The kaze listing lane returns episode numbers + ids, but only placeholder
 * titles ("Episode 1", "Episode 2", ...). To surface the actual episode
 * NAME (e.g. "The Journey's End", "It Didn't Have to Be Magic…"), we
 * additionally merge MAL's crowd-sourced episode list (via the shared
 * malEpisodeIndex helper in core/chain.js — the SAME index and cache entry
 * /api/chain uses, so an anime's titles are scraped at most once per cache
 * window regardless of which endpoint asks first). Merged fields:
 * `title`, `titleJapanese`, `aired`, `filler`, `recap`.
 *
 * Fallback chain:
 *   1. kaze listing  -> episode numbers + ids + placeholder titles
 *   2. ishi channels -> episode numbers + ids (different slugs)
 *   3. MAL index     -> real per-episode titles, airdate, filler flag
 *   4. If both listing lanes fail but MAL has the episode list, return
 *      the MAL list directly (no playback id, but the client at least
 *      gets the titles).
 */
router.get("/anime/episodes", wrap(async (req, res) => {
  const key = keyOf(req);
  const { anilistId, canonical } = await canonicalFor(key);

  const episodes = await withCache(`episodes:${anilistId}:v2`, config.cacheSeconds, async () => {
    // ---- 1. primary listing lane (kaze) -----------------------------------
    const kaze = getLane("kaze");
    let primary = null;
    try {
      const match = await matchSlug(kaze, canonical);
      if (match) {
        const list = await kaze.episodes(match.listingId);
        if (list?.length) {
          primary = list.map((e) => ({
            number: Number(e.episode),
            title: e.title || null,           // usually "Episode N" placeholder
            id: e.id ?? null,
            filler: e.isFiller ?? undefined,
            url: e.url || undefined,
          }));
        }
      }
    } catch { /* silent — fall through */ }

    // ---- 2. playback-channel lane (ishi) ---------------------------------
    if (!primary) {
      const ishi = getLane("ishi");
      for (const channel of ishi.channels) {
        try {
          const data = await ishi.episodes(anilistId, null, channel);
          if (data?.episodes?.length) {
            primary = data.episodes.map((e) => ({
              number: Number(e.episode),
              title: e.title || null,
              id: e.id ?? null,
            }));
            break;
          }
        } catch { /* try next channel */ }
      }
    }

    // ---- 3. MAL per-episode index (shared with /chain) -------------------
    const malIdx = await malEpisodeIndex(canonical?.malId ?? null);
    const hasMal = malIdx && Object.keys(malIdx).length > 0;

    // ---- 4. merge ---------------------------------------------------------
    if (primary && primary.length) {
      if (hasMal) {
        return primary.map((ep) => {
          const mal = malIdx[ep.number] || null;
          return {
            ...ep,
            title: mal?.title || ep.title || null,
            titleJapanese: mal?.titleJapanese || null,
            aired: mal?.aired || null,
            filler: mal?.filler ?? ep.filler ?? false,
            recap: mal?.recap || false,
          };
        });
      }
      return primary;
    }

    // ---- 5. fallback: MAL-only list --------------------------------------
    // No kaze/ishi listing worked, but MAL has episode titles — return them.
    if (hasMal) {
      return Object.values(malIdx)
        .sort((a, b) => Number(a.malId) - Number(b.malId))
        .map((m) => ({
          number: Number(m.malId),
          title: m.title || null,
          titleJapanese: m.titleJapanese || null,
          id: null,
          aired: m.aired || null,
          filler: m.filler || false,
          recap: m.recap || false,
          url: m.url || undefined,
        }));
    }

    return [];
  });

  if (!episodes.length) throw new CustomError(`No episode list available for this anime`, 404);

  res.json({ success: true, api: "APIKuoshi", key: keyFor(anilistId), count: episodes.length, episodes });
}));

/**
 * GET /api/anime/servers?key=...&ep=1 [&type=sub|dub|all]
 * The server list for one episode.
 */
router.get("/anime/servers", wrap(async (req, res) => {
  const key = keyOf(req);
  const ep = parseInt(req.query.ep, 10) || 1;
  const type = String(req.query.type || "all").toLowerCase();
  const { anilistId, canonical } = await canonicalFor(key);

  const servers = await withCache(`servers:${anilistId}:${ep}:${type}`, config.cacheSeconds, async () => {
    // 1. primary listing lane
    const kaze = getLane("kaze");
    try {
      const match = await matchSlug(kaze, canonical);
      if (match) {
        const list = await kaze.servers(match.listingId, ep);
        if (list?.length) {
          return list
            .map((s) => ({
              name: s?.name || s?.server || "server",
              type: s?.type || null,
              id: s?.link_id || s?.linkId || s?.id || s?.sourceId || null,
            }))
            .filter((s) => s.id);
        }
      }
    } catch { /* silent — fall through */ }

    // 2. playback-channel lane
    const ishi = getLane("ishi");
    for (const channel of ishi.channels) {
      try {
        const list = await ishi.servers(anilistId, null, ep, channel);
        const arr = Array.isArray(list) ? list : list?.servers ?? [];
        if (arr.length) {
          return arr
            .map((s) => ({ name: s?.name || "server", type: s?.type || null, id: s?.sourceId || s?.id || null }))
            .filter((s) => s.id);
        }
      } catch { /* try next channel */ }
    }
    return [];
  });

  if (!servers.length) throw new CustomError(`No servers found for episode ${ep}`, 404);

  res.json({ success: true, api: "APIKuoshi", key: keyFor(anilistId), episode: ep, count: servers.length, servers });
}));

// ================================================================ PLAYBACK
/**
 * GET /api/watch?key=...&ep=1 [&type=sub|dub|all] [&server=<name hint>]
 * The stream resolver: returns playable links, each with a same-origin
 * proxiedUrl so browsers can play them cross-origin out of the box.
 */
router.get("/watch", wrap(async (req, res) => {
  const key = keyOf(req);
  const ep = parseInt(req.query.ep, 10) || 1;
  const type = ["sub", "dub", "all"].includes(req.query.type) ? req.query.type : "sub";
  const serverHint = req.query.server || null;
  const { anilistId, canonical } = await canonicalFor(key);

  const streams = await withCache(`watch:${anilistId}:${ep}:${type}:${serverHint || ""}`, 60, async () => {
    const out = [];
    const seenUrls = new Set(); // several servers often share one upstream file

    const push = (pub) => {
      if (!pub?.url) return;
      const dedup = `${pub.url}|${pub.type || ""}`;
      if (seenUrls.has(dedup)) return;
      seenUrls.add(dedup);
      out.push(pub);
    };

    // 1. primary listing lane
    const kaze = getLane("kaze");
    try {
      const match = await matchSlug(kaze, canonical);
      if (match) {
        const data = await kaze.watch(match.listingId, ep, type === "all" ? "all" : type);
        for (const s of data?.streams || []) {
          const pub = publicStream(s, STREAM_REFERER);
          if (pub?.url) push(pub);
        }
      }
    } catch (err) {
      console.error(`[APIKUOSHI][watch] primary lane failed:`, err.message);
    }

    // 2. playback-channel lane — always run if we still lack a direct stream
    const hasDirect = out.some((s) => s.kind === "direct");
    if (!hasDirect) {
      const ishi = getLane("ishi");
      for (const channel of ishi.channels) {
        try {
          const data = await ishi.watch(anilistId, null, ep, type, channel, serverHint);
          for (const s of data?.streams || []) {
            const pub = publicStream(s);
            if (pub?.url) push(pub);
          }
        } catch (err) {
          console.error(`[APIKUOSHI][watch] channel failed:`, err.message);
        }
        if (out.some((s) => s.kind === "direct")) break; // direct stream wins
      }
    }
    return out;
  });

  if (!streams.length) {
    throw new CustomError(`No playable streams available for episode ${ep} right now`, 502);
  }

  // best = first direct stream matching the requested type, else first direct
  const direct = streams.filter((s) => s.kind === "direct");
  const pool = direct.length ? direct : streams;
  const preferred = pool.find((s) => type === "all" || !s.type || s.type === type) || pool[0];

  res.json({
    success: true,
    api: "APIKuoshi",
    key: keyFor(anilistId),
    episode: ep,
    type,
    stream: preferred,
    streams,
  });
}));

/**
 * GET /api/download?key=...&ep=1
 * Download links for one episode.
 */
router.get("/download", wrap(async (req, res) => {
  const key = keyOf(req);
  const ep = parseInt(req.query.ep, 10) || 1;
  const { anilistId, canonical } = await canonicalFor(key);

  const kaze = getLane("kaze");
  const match = await matchSlug(kaze, canonical);
  if (!match) throw new CustomError(`No download links available for episode ${ep}`, 404);
  const data = await kaze.download(match.listingId, ep);
  const downloads = Array.isArray(data) ? data : data?.downloads ?? [];
  if (!downloads.length) throw new CustomError(`No download links available for episode ${ep}`, 404);

  res.json({ success: true, api: "APIKuoshi", key: keyFor(anilistId), episode: ep, count: downloads.length, downloads });
}));

/**
 * GET /api/chain?q=... | key=... | id=... | slug=... [&ep=1] [&type=sub] [&probe=0] [&all=1]
 * THE STREAMING CHAIN — one call, whole journey, nested functions:
 *   resolve -> info -> episodes -> servers -> streams -> probe -> episode-titles
 * Every hop is timed and reported in steps[]. Every stream URL is probed
 * against the real CDN and the response ends with a ready-to-play `best`
 * stream (proxied through the built-in CORS proxies). The response also
 * carries the requested episode's REAL title (MAL-backed, same source as
 * /api/anime/episodes): see `episode` and top-level `episodeTitle`.
 */
router.get("/chain", wrap(async (req, res) => {
  const q = req.query.q || null;
  const key = req.query.key || req.query.id || null;
  const slug = req.query.slug || null;
  if (!q && !key && !slug) {
    throw new CustomError("Provide one of: ?q=<search> | ?key=<anime key> | ?id=<anilist id> | ?slug=<listing slug>", 400);
  }
  const result = await runStreamingChain({
    q,
    key,
    slug,
    ep: parseInt(req.query.ep, 10) || 1,
    type: req.query.type || "sub",
    channel: req.query.channel || null,
    probe: req.query.probe !== "0",
    all: req.query.all === "1",
  });
  res.json({ success: true, api: "APIKuoshi", ...result });
}));

// ================================================================ BROWSE
// Discovery surface. List endpoints always answer with
// { success, api, kind, count, results: [...] }.

const sendList = (res, kind, result) => {
  let items = result;
  // unwrap common container fields
  if (items && !Array.isArray(items) && typeof items === "object") {
    if (Array.isArray(items.data)) items = items.data;
    else if (Array.isArray(items.results)) items = items.results;
  }
  if (Array.isArray(items)) {
    const results = items.map(stripInternal);
    res.json({ success: true, api: "APIKuoshi", kind, count: results.length, results });
    return;
  }
  // object-shaped payload (home sections, top-ten groups, season maps, single item)
  const data = items && typeof items === "object" ? stripInternal(items) : items;
  res.json({ success: true, api: "APIKuoshi", kind, data });
};

const browseList = (kazeFn, { ishiFallback = null, label } = {}) =>
  wrap(async (req, res) => {
    const result = await withFallback(
      async (lane) => {
        if (lane.id === "kaze") {
          const out = await kazeFn(lane, req);
          return out || null;
        }
        if (lane.id === "ishi" && ishiFallback) return ishiFallback(lane, req);
        return null;
      },
      { label }
    );
    sendList(res, label, result);
  });

/**
 * Variant of `browseList` that NEVER 502s on an empty result.
 *
 * Use this for endpoints where "no matches" is a legitimate client-facing
 * state, not a server failure — e.g. /api/filter with restrictive params,
 * or /api/genre with multiple genres that yield no overlap.
 *
 * Behaviour:
 *   - Try the kaze lane directly (no ishi fallback for catalog filters).
 *   - On any error or empty result, respond 200 with count: 0 instead of 502.
 */
const browseListAllowEmpty = (kazeFn, { label } = {}) =>
  wrap(async (req, res) => {
    const kaze = getLane("kaze");
    let result = null;
    try {
      result = await kazeFn(kaze, req);
    } catch (err) {
      // Log for operators but never surface as 502 — empty filter result is valid.
      console.error(`[APIKUOSHI][${label}] kaze failed:`, err.message);
    }
    sendList(res, label, result || { data: [] });
  });

router.get("/home", browseList(
  (kaze) => kaze.home(),
  { ishiFallback: async (ishi) => ({ data: await ishi.airing() }), label: "home" }
));

router.get("/spotlight", browseList(
  (kaze) => kaze.spotlight(),
  { ishiFallback: async (ishi) => ({ data: (await ishi.airing()).slice(0, 12) }), label: "spotlight" }
));

router.get("/trending", browseList(
  (kaze) => kaze.trending(),
  { ishiFallback: async (ishi) => ({ data: (await ishi.airing()).slice(0, 24) }), label: "trending" }
));

router.get("/trending-sidebar", browseList((kaze) => kaze.trendingSidebar(), { label: "trending-sidebar" }));

router.get("/top-ten", browseList((kaze) => kaze.topTen(), { label: "top-ten" }));

router.get("/top-rankings", browseList(
  (kaze, req) => kaze.topRankings(req.query.sort || "most-favorite"),
  { label: "top-rankings" }
));

router.get("/popular", browseList(
  (kaze) => kaze.popular(),
  { ishiFallback: async (ishi) => ({ data: (await ishi.airing()).slice(0, 24) }), label: "popular" }
));

router.get("/random", browseList((kaze) => kaze.random(), { label: "random" }));

router.get("/upcoming", browseList((kaze) => kaze.upcoming(), { label: "upcoming" }));

router.get("/completed", browseList((kaze, req) => kaze.completed(page(req)), { label: "completed" }));

router.get("/new-release", browseList((kaze, req) => kaze.newRelease(page(req)), { label: "new-release" }));

router.get("/newly-added", browseList((kaze, req) => kaze.newlyAdded(page(req)), { label: "newly-added" }));

router.get("/latest-updated", browseList((kaze, req) => kaze.latestUpdated(page(req)), { label: "latest-updated" }));

router.get("/recently-updated", browseList(
  (kaze, req) => kaze.recentlyUpdated(req.query.tab || "all"),
  { label: "recently-updated" }
));

router.get("/schedule", browseList((kaze) => kaze.schedule(), { label: "schedule" }));

/**
 * GET /api/airing [&page=]
 * Currently airing anime.
 */
router.get("/airing", wrap(async (req, res) => {
  const result = await withFallback(
    async (lane) => {
      if (lane.id === "ishi") return { data: await lane.airing() };
      if (lane.id === "kaze") return lane.schedule();
      return null;
    },
    { label: "airing" }
  );
  sendList(res, "airing", result);
}));

// ================================================================ CATALOG
router.get("/az-list/:letter", browseList(
  (kaze, req) => kaze.azList(req.params.letter, page(req)),
  { label: "az-list" }
));

router.get("/filter", browseListAllowEmpty(
  (kaze, req) => kaze.filter({
    keyword: req.query.keyword || "",
    genre: req.query.genre || "",
    type: req.query.type || "",
    status: req.query.status || "",
    season: req.query.season || "",
    language: req.query.language || "",
    rating: req.query.rating || "",
    source: req.query.animesource || req.query.source || "",
    sort: req.query.sort || "",
    year: req.query.year || "",
    epMin: req.query.ep_min || "",
    epMax: req.query.ep_max || "",
    excludeWatchlist: req.query.exclude_watchlist === "1" || req.query.exclude_watchlist === "true",
    page: page(req),
  }),
  { label: "filter" }
));

/**
 * GET /api/genre/:genre
 * Single-genre path delegates to the kaze category page (e.g. /genre/action).
 * Multi-genre path (comma-separated, e.g. /api/genre/action,comedy) routes
 * through kaze.filter() which the upstream /filter endpoint supports natively
 * via repeated genre[]=ID query params.
 *
 * Both paths use browseListAllowEmpty so an unmatched genre never 502s —
 * the client simply gets { success: true, count: 0, results: [] }.
 */
router.get("/genre/:genre", browseListAllowEmpty(
  (kaze, req) => {
    const genreParam = req.params.genre || "";
    if (genreParam.includes(",")) {
      // Multi-genre: route through the filter extractor (supports genre[]=ID).
      return kaze.filter({
        genre: genreParam,
        page: page(req),
      });
    }
    return kaze.category("genre", genreParam, page(req));
  },
  { label: "genre" }
));

router.get("/type/:type", browseList(
  (kaze, req) => kaze.category("type", req.params.type, page(req)),
  { label: "type" }
));

router.get("/status/:status", browseList(
  (kaze, req) => kaze.status(req.params.status, page(req)),
  { label: "status" }
));

router.get("/seasons/:slug", browseList((kaze, req) => kaze.seasons(req.params.slug), { label: "seasons" }));

router.get("/watch-order/:slug", browseList((kaze, req) => kaze.watchOrder(req.params.slug), { label: "watch-order" }));

// ================================================================ META
// Rich canonical metadata + MAL-shaped views.

router.get("/meta", wrap(async (req, res) => {
  const key = keyOf(req);
  const { anilistId, canonical } = await canonicalFor(key);
  const detail = await anilistDetail(anilistId).catch(() => null);
  let indexed = null;
  try {
    const { getSiteIds } = await import("../sources/ishi/dist/utils/mapper.js");
    indexed = await getSiteIds(anilistId);
  } catch { /* mapper offline */ }

  // Cross-provider art (AniList -> TMDB -> Kitsu). TMDB is skipped
  // gracefully when no TMDB_API_KEY is configured.
  const art = await resolveArt({
    anilistId,
    malId: detail?.malId ?? canonical?.malId ?? null,
    title: detail?.titleEnglish || detail?.titleRomaji || detail?.title || canonical?.title || null,
    titleRomaji: detail?.titleRomaji || canonical?.titleRomaji || null,
    seasonHint: req.query.season ? parseInt(req.query.season, 10) : null,
  }).catch(() => ({ art: null, log: [] }));

  const enc = encodeURIComponent(key || String(anilistId));
  res.json({
    success: true,
    api: "APIKuoshi",
    key: keyFor(anilistId),
    anime: publicAnime(detail || canonical),
    art: art.art,
    availability: {
      indexed: Boolean(indexed?.siteIds),
      watch: `/api/watch?key=${enc}&ep=1`,
      chain: `/api/chain?key=${enc}&ep=1`,
    },
  });
}));

router.get("/meta/characters", wrap(async (req, res) => {
  const { anilistId } = await canonicalFor(keyOf(req));
  const characters = await anilistCharacters(anilistId, parseInt(req.query.limit, 10) || 24);
  res.json({ success: true, api: "APIKuoshi", key: keyFor(anilistId), count: characters.length, characters });
}));

router.get("/meta/recommendations", wrap(async (req, res) => {
  const { anilistId } = await canonicalFor(keyOf(req));
  const recommendations = await anilistRecommendations(anilistId, parseInt(req.query.limit, 10) || 12);
  res.json({ success: true, api: "APIKuoshi", key: keyFor(anilistId), count: recommendations.length, recommendations });
}));

router.get("/meta/season", wrap(async (req, res) => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const season = (req.query.season || (month <= 3 ? "WINTER" : month <= 6 ? "SPRING" : month <= 9 ? "SUMMER" : "FALL")).toUpperCase();
  const year = parseInt(req.query.year, 10) || now.getFullYear();
  const data = await anilistSeason(season, year, page(req));
  const results = (data.results || data.data || []).map(stripInternal);
  res.json({ success: true, api: "APIKuoshi", season, year, count: results.length, results });
}));

/**
 * GET /api/meta/mal?key=mal:52991 [&episodes=1]
 * MyAnimeList-shaped details (queued + cached internally).
 */
router.get("/meta/mal", wrap(async (req, res) => {
  const ishi = getLane("ishi");
  const key = String(keyOf(req) || "").trim();
  if (!key) throw new CustomError("Missing ?key= (use mal:<id> or anilist:<id> or a title)", 400);

  let malId = null;
  if (/^mal:\d+$/i.test(key)) malId = parseInt(key.split(":")[1], 10);
  else {
    const { anilistId } = await canonicalFor(key);
    const canonical = await anilistById(anilistId);
    malId = canonical?.malId ?? null;
    if (!malId) throw new CustomError(`No MAL id known for ${key}`, 404);
  }

  const details = await ishi.malDetails(malId);
  if (!details) throw new CustomError(`Anime ${malId} not found on MAL`, 404);
  const payload = { success: true, api: "APIKuoshi", key: /^mal:/i.test(key) ? key.toLowerCase() : keyFor(null) || key, malId, mal: details };

  if (req.query.episodes === "1") {
    payload.episodes = await ishi.malEpisodes(malId, page(req)).catch(() => null);
  }
  res.json(payload);
}));

router.get("/meta/external", wrap(async (req, res) => {
  const ishi = getLane("ishi");
  const key = String(keyOf(req) || "").trim();
  if (!key) throw new CustomError("Missing ?key=", 400);

  let malId = null;
  if (/^mal:\d+$/i.test(key)) malId = parseInt(key.split(":")[1], 10);
  else {
    const { anilistId } = await canonicalFor(key);
    const canonical = await anilistById(anilistId);
    malId = canonical?.malId ?? null;
  }
  if (!malId) throw new CustomError(`No MAL id known for ${key}`, 404);

  const [external, streaming] = await Promise.allSettled([
    ishi.malExternalLinks(malId),
    ishi.malStreaming(malId),
  ]);
  res.json({
    success: true,
    api: "APIKuoshi",
    malId,
    externalLinks: external.status === "fulfilled" ? external.value : null,
    streamingPlatforms: streaming.status === "fulfilled" ? streaming.value : null,
  });
}));

/**
 * GET /api/meta/trending
 * Top-banners view of what's airing now.
 */
router.get("/meta/trending", wrap(async (req, res) => {
  const result = await withFallback(
    async (lane) => {
      if (lane.id === "ishi" && lane.airingBanners) return { data: await lane.airingBanners() };
      if (lane.id === "ishi") return { data: await lane.airing() };
      if (lane.id === "kaze") return lane.trending();
      return null;
    },
    { label: "meta-trending" }
  );
  sendList(res, "trending", result);
}));

// ================================================================ META —
// Cross-provider ART & EPISODE imagery (AniList → TMDB → Kitsu),
// ported from the AniVault-Scraper design. TMDB needs TMDB_API_KEY
// (see .env.example) and is skipped gracefully without it; AniList and
// Kitsu are keyless and always available.

/** Resolve ?key= to the identity block every art/episode route needs. */
async function metaIdentity(req) {
  const { anilistId, canonical } = await canonicalFor(keyOf(req));
  const malId = canonical?.malId ?? null;
  const title = canonical?.titleEnglish || canonical?.title || null;
  const titleRomaji = canonical?.titleRomaji || null;
  // An optional &season= overrides the auto-detected hint ("Show II" -> 2).
  const seasonHint = req.query.season ? parseInt(req.query.season, 10) : null;
  return { anilistId, malId, title, titleRomaji, seasonHint, canonical };
}

/**
 * GET /api/meta/art?key= [&season=N] [&list=1]
 * The full art fallback chain in ONE call: AniList → TMDB → Kitsu.
 * poster/banner/logo + originals, each tagged with its source provider,
 * plus a per-provider `sources[]` provenance breakdown.
 */
router.get("/meta/art", wrap(async (req, res) => {
  const { anilistId, malId, title, titleRomaji, seasonHint } = await metaIdentity(req);
  const { art, log } = await resolveArt({
    anilistId, malId, title, titleRomaji, seasonHint,
    isList: req.query.list === "1",
  });
  if (!art || (!art.poster && !art.banner && !art.logo)) {
    throw new CustomError(`No art found for ${keyOf(req)}`, 404);
  }
  res.json({
    success: true,
    api: "APIKuoshi",
    key: keyFor(anilistId),
    chain: ["anilist", tmdbEnabled() ? "tmdb" : "tmdb (skipped — no TMDB_API_KEY)", "kitsu"],
    art,
    log: req.query.verbose === "1" ? log : undefined,
  });
}));

/**
 * GET /api/meta/tmdb?key= [&ep=N] [&season=N]
 * TMDB show art (poster / backdrop / transparent logo, per-season posters)
 * — or, with &ep=N, one episode's still + title + air date.
 */
router.get("/meta/tmdb", wrap(async (req, res) => {
  const { title, titleRomaji, seasonHint } = await metaIdentity(req);
  if (!tmdbEnabled()) {
    throw new CustomError("TMDB provider disabled — set TMDB_API_KEY in .env (free at themoviedb.org)", 501);
  }
  const titles = [...new Set([title, titleRomaji].filter(Boolean))];
  const epNum = req.query.ep ? parseInt(req.query.ep, 10) : null;

  if (epNum) {
    for (const t of titles) {
      const { base, season: hinted } = extractSeasonHint(t);
      const hint = seasonHint ?? hinted;
      const { result, log } = await tmdbEpisodeData(base, epNum, hint, false);
      if (result) {
        return res.json({ success: true, api: "APIKuoshi", key: keyFor(null) || `tmdb:${result.showId}`, provider: "tmdb", episode: result, log });
      }
    }
    throw new CustomError(`No TMDB episode data for ep ${epNum}`, 404);
  }

  for (const t of titles) {
    const { base, season: hinted } = extractSeasonHint(t);
    const { result, log } = await tmdbAnimeImages(base, seasonHint ?? hinted, false);
    if (result) {
      return res.json({ success: true, api: "APIKuoshi", key: keyFor(null) || `tmdb:${result.showId}`, provider: "tmdb", images: result, log });
    }
  }
  throw new CustomError("No TMDB images found for this title", 404);
}));

/**
 * GET /api/meta/kitsu?key= [&ep=N]
 * Kitsu show art (poster / cover) — or, with &ep=N, one episode's
 * thumbnail + title. Keyless.
 */
router.get("/meta/kitsu", wrap(async (req, res) => {
  const { malId, title } = await metaIdentity(req);
  const log = [];
  const kitsuId = await kitsuAnimeId(malId, title, log);
  if (!kitsuId) throw new CustomError(`No Kitsu mapping for ${keyOf(req)}`, 404);

  const epNum = req.query.ep ? parseInt(req.query.ep, 10) : null;
  if (epNum) {
    const { result } = await kitsuEpisodeData(kitsuId, epNum, false);
    if (!result) throw new CustomError(`No Kitsu episode data for ep ${epNum}`, 404);
    return res.json({ success: true, api: "APIKuoshi", provider: "kitsu", episode: result, log });
  }

  const { result } = await kitsuAnimeImages(kitsuId, false);
  if (!result) throw new CustomError(`No Kitsu images for ${keyOf(req)}`, 404);
  res.json({ success: true, api: "APIKuoshi", provider: "kitsu", images: result, log });
}));

/**
 * GET /api/meta/episode?key=&ep=N [&expectedAired=YYYY-MM-DD]
 * One episode's full metadata — title + air date + thumbnail — resolved
 * through the TMDB → Kitsu → AniList streamingEpisodes fallback chain.
 * `thumbnailSource` says which provider won.
 */
router.get("/meta/episode", wrap(async (req, res) => {
  const { anilistId, malId, title, titleRomaji, seasonHint } = await metaIdentity(req);
  const epNum = parseInt(req.query.ep, 10);
  if (!epNum || epNum < 1) throw new CustomError("Missing/invalid ?ep= (episode number)", 400);
  const expectedAired = req.query.expectedAired || null;
  const log = [];

  let titleOut = null, aired = null, thumbnail = null, thumbnailSource = null;
  let season = null, epInSeason = null, providerDetail = null;

  // ── 1) TMDB (best stills + real titles; needs key) ──────────────────
  if (tmdbEnabled() && title) {
    const titles = [...new Set([title, titleRomaji].filter(Boolean))];
    for (const t of titles) {
      const { base, season: hinted } = extractSeasonHint(t);
      const { result, log: tlog } = await tmdbEpisodeData(base, epNum, seasonHint ?? hinted, false, expectedAired);
      log.push(...tlog);
      if (result) {
        titleOut = result.title; aired = result.aired; thumbnail = result.thumbnail;
        thumbnailSource = "tmdb"; season = result.season; epInSeason = result.season;
        providerDetail = { tmdbShowId: result.showId, tmdbShowName: result.showName, thumbnailOriginal: result.thumbnailOriginal };
        break;
      }
    }
  }

  // ── 2) Kitsu (keyless; MAL-id mapping makes season resolution exact) ─
  if (!thumbnailSource && (malId || title)) {
    const kitsuId = await kitsuAnimeId(malId, title, log);
    if (kitsuId) {
      const { result, log: klog } = await kitsuEpisodeData(kitsuId, epNum, false);
      log.push(...klog);
      if (result) {
        titleOut = titleOut || result.title;
        aired = aired || result.aired;
        thumbnail = result.thumbnail ?? thumbnail;
        thumbnailSource = result.thumbnail ? "kitsu" : thumbnailSource;
        providerDetail = providerDetail || { kitsuAnimeId: kitsuId, kitsuEpisodeId: result.episodeId, titleJapanese: result.titleJapanese };
      }
    }
  }

  // ── 3) AniList streamingEpisodes (keyless last resort) ───────────────
  if (!thumbnailSource && malId) {
    const streaming = await anilistStreamingEpisodes(malId);
    const hit = streaming.find((e) => e.number === epNum) || streaming[epNum - 1] || null;
    if (hit) {
      log.push("Episode info: found via AniList streamingEpisodes");
      titleOut = titleOut || hit.title;
      thumbnail = thumbnail || hit.thumbnail;
      if (hit.thumbnail) thumbnailSource = "anilist";
      providerDetail = providerDetail || { site: hit.site, url: hit.url };
    }
  }

  if (!titleOut && !thumbnail) {
    throw new CustomError(`No metadata found for ep ${epNum} (tried tmdb${tmdbEnabled() ? "" : ":no-key"}, kitsu, anilist)`, 404);
  }

  res.json({
    success: true,
    api: "APIKuoshi",
    key: keyFor(anilistId),
    ep: epNum,
    episode: {
      number: epNum,
      title: titleOut,
      aired,
      thumbnail,
      thumbnailSource,
      season,
      epInSeason,
      ...providerDetail,
    },
    log: req.query.verbose === "1" ? log : undefined,
  });
}));

/**
 * GET /api/meta/episodes?key= [&thumbs=1] [&list=1]
 * Every episode with title + air date + thumbnail. Episode frames come
 * from the primary playback lanes; imagery through the TMDB → Kitsu →
 * AniList chain. With &thumbs=0 skips per-episode imagery (fast mode).
 */
router.get("/meta/episodes", wrap(async (req, res) => {
  const key = keyOf(req);
  const { anilistId, canonical } = await canonicalFor(key);
  const wantThumbs = req.query.thumbs !== "0";

  // ---- episode frame (numbers + titles) from the playback lanes --------
  const frameCacheKey = `meta-eps-frame:${anilistId}`;
  let episodes = cacheGet(frameCacheKey);
  if (episodes === undefined) {
    episodes = null;
    const kaze = getLane("kaze");
    try {
      const match = await matchSlug(kaze, canonical);
      if (match) {
        const list = await kaze.episodes(match.listingId);
        if (list?.length) {
          episodes = list.map((e) => ({
            number: Number(e.episode),
            title: e.title || null,
            filler: e.isFiller ?? undefined,
          }));
        }
      }
    } catch { /* fall through */ }
    if (!episodes) {
      const ishi = getLane("ishi");
      for (const channel of ishi.channels) {
        try {
          const data = await ishi.episodes(anilistId, null, channel);
          if (data?.episodes?.length) {
            episodes = data.episodes.map((e) => ({ number: Number(e.episode), title: e.title || null }));
            break;
          }
        } catch { /* next channel */ }
      }
    }
    if (episodes) cacheSet(frameCacheKey, episodes, config.cacheSeconds);
  }
  if (!episodes?.length) throw new CustomError(`No episode list found for ${key}`, 404);

  // ---- imagery per episode (chain) --------------------------------------
  // Concurrency-capped: a 100+ episode show must not fire 100+ simultaneous
  // TMDB/Kitsu requests (upstream rate limits + latency). Batches of 8.
  const CONCURRENCY = 8;
  const log = [];
  const malId = canonical?.malId ?? null;
  const title = canonical?.titleEnglish || canonical?.title || null;
  const titleRomaji = canonical?.titleRomaji || null;
  const { base: baseTitle, season: titleSeasonHint } = title ? extractSeasonHint(title) : { base: null, season: null };

  // AniList streamingEpisodes fetched ONCE and shared as the last resort.
  let streaming = null;
  if (wantThumbs && malId) {
    streaming = await anilistStreamingEpisodes(malId).catch(() => []);
  }

  const resolved = await new Promise((resolveAll) => {
    const out = new Array(episodes.length);
    let cursor = 0;
    async function worker() {
      while (cursor < episodes.length) {
        const idx = cursor++;
        out[idx] = await resolveOne(episodes[idx]);
      }
    }
    const workers = Array.from({ length: Math.min(CONCURRENCY, episodes.length) }, worker);
    Promise.all(workers).then(() => resolveAll(out));
  });

  async function resolveOne(e) {
    const out = { ...e };
    if (!wantThumbs) return out;
    let thumbnail = null, thumbnailSource = null, aired = null;

    // 1) TMDB — absolute → season mapping relative-first
    if (tmdbEnabled() && baseTitle) {
      const { result, log: tlog } = await tmdbEpisodeData(baseTitle, e.number, titleSeasonHint, true);
      if (result) {
        thumbnail = result.thumbnail; thumbnailSource = "tmdb"; aired = result.aired;
        if (result.title && (!out.title || /^Episode\s+\d+$/i.test(out.title))) out.title = result.title;
      }
    }
    // 2) Kitsu
    if (!thumbnail && (malId || title)) {
      const kitsuId = await kitsuAnimeId(malId, title, []);
      if (kitsuId) {
        const { result } = await kitsuEpisodeData(kitsuId, e.number, true);
        if (result) {
          thumbnail = result.thumbnail; thumbnailSource = "kitsu";
          aired = aired || result.aired;
          if (result.title && (!out.title || /^Episode\s+\d+$/i.test(out.title))) out.title = result.title;
        }
      }
    }
    // 3) AniList streamingEpisodes (pre-fetched)
    if (!thumbnail && streaming?.length) {
      const hit = streaming.find((s) => s.number === e.number) || streaming[e.number - 1] || null;
      if (hit?.thumbnail) {
        thumbnail = hit.thumbnail; thumbnailSource = "anilist";
        if (hit.title && (!out.title || /^Episode\s+\d+$/i.test(out.title))) out.title = hit.title;
      }
    }

    if (thumbnail) { out.thumbnail = thumbnail; out.thumbnailSource = thumbnailSource; }
    if (aired) out.aired = aired;
    return out;
  }

  // Air-anime undercount guard: if MAL/lanes report fewer episodes than
  // TMDB lists, pad the tail so airing shows never end early.
  let padded = false;
  if (baseTitle && tmdbEnabled()) {
    const tmdb = await tmdbShowEpisodeCount(baseTitle).catch(() => null);
    if (tmdb?.count && tmdb.count > resolved.length) {
      const before = resolved.length;
      for (let n = resolved.length + 1; n <= tmdb.count; n++) {
        resolved.push({ number: n, title: null, placeholder: true });
      }
      padded = true;
      log.push(`Episode tail padded from TMDB: +${resolved.length - before} -> total ${resolved.length}`);
    }
  }

  const withThumbs = resolved.filter((e) => e.thumbnail).length;
  res.json({
    success: true,
    api: "APIKuoshi",
    key: keyFor(anilistId),
    count: resolved.length,
    thumbnailSources: withThumbs > 0 ? { tmdb: resolved.filter((e) => e.thumbnailSource === "tmdb").length, kitsu: resolved.filter((e) => e.thumbnailSource === "kitsu").length, anilist: resolved.filter((e) => e.thumbnailSource === "anilist").length, none: resolved.filter((e) => !e.thumbnail).length } : undefined,
    padded,
    episodes: resolved,
    log: req.query.verbose === "1" ? log.slice(0, 60) : undefined,
  });
}));

// ================================================================ INFRA
// Playback infrastructure: restreams m3u8 playlists and media so browsers
// can play them cross-origin.

const PROXY_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

router.get("/proxy/hls", wrap(async (req, res) => {
  const url = req.query.url;
  if (!url || !/^https?:\/\//i.test(url)) throw new CustomError("Missing/invalid ?url= (absolute http(s) m3u8 URL)", 400);
  const ref = req.query.ref || null;

  const r = await axios.get(url, {
    responseType: "text",
    timeout: 20000,
    headers: { "User-Agent": PROXY_UA, ...(ref ? { Referer: ref } : {}) },
  });

  const body = String(r.data || "");
  const base = new URL(url);
  const rewritten = body
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith("#")) {
        // rewrite URIs inside #EXT-X-KEY / #EXT-X-MAP / #EXT-X-MEDIA
        return line.replace(/URI="([^"]+)"/g, (_m, u) => {
          const abs = new URL(u, base).toString();
          return u.endsWith(".m3u8") || !/\.\w{2,4}(\?|$)/.test(u)
            ? `URI="/api/proxy/hls?url=${encodeURIComponent(abs)}${ref ? `&ref=${encodeURIComponent(ref)}` : ""}"`
            : `URI="/api/proxy/video?url=${encodeURIComponent(abs)}${ref ? `&ref=${encodeURIComponent(ref)}` : ""}"`;
        });
      }
      const abs = new URL(t, base).toString();
      if (t.includes(".m3u8")) return `/api/proxy/hls?url=${encodeURIComponent(abs)}${ref ? `&ref=${encodeURIComponent(ref)}` : ""}`;
      return `/api/proxy/video?url=${encodeURIComponent(abs)}${ref ? `&ref=${encodeURIComponent(ref)}` : ""}`;
    })
    .join("\n");

  res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(rewritten);
}));

router.get("/proxy/video", wrap(async (req, res) => {
  const url = req.query.url;
  if (!url || !/^https?:\/\//i.test(url)) throw new CustomError("Missing/invalid ?url= (absolute http(s) URL)", 400);
  const ref = req.query.ref || null;

  const upstream = await axios.get(url, {
    responseType: "stream",
    timeout: 30000,
    headers: {
      "User-Agent": PROXY_UA,
      ...(ref ? { Referer: ref } : {}),
      ...(req.headers.range ? { Range: req.headers.range } : {}),
    },
  });

  res.setHeader("Access-Control-Allow-Origin", "*");
  if (upstream.headers["content-type"]) res.setHeader("Content-Type", upstream.headers["content-type"]);
  if (upstream.headers["content-length"]) res.setHeader("Content-Length", upstream.headers["content-length"]);
  if (upstream.headers["content-range"]) res.setHeader("Content-Range", upstream.headers["content-range"]);
  res.status(upstream.status);
  upstream.data.pipe(res);
}));

router.get("/proxy/subtitle", wrap(async (req, res) => {
  const url = req.query.url;
  if (!url || !/^https?:\/\//i.test(url)) throw new CustomError("Missing/invalid ?url=", 400);
  const ref = req.query.ref || null;
  const r = await axios.get(url, {
    responseType: "text",
    timeout: 20000,
    headers: { "User-Agent": PROXY_UA, ...(ref ? { Referer: ref } : {}) },
  });
  res.setHeader("Content-Type", "text/vtt; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(String(r.data || ""));
}));

export default router;
