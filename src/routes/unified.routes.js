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
import { runStreamingChain, malEpisodeIndex } from "../core/chain.js";
import { resolveKeyToAnilist, matchSlug, canonicalFor, keyFor } from "../core/keys.js";
import { CustomError } from "../core/errors.js";
import { withCache } from "../core/cache.js";
import { withCdnToken } from "../sources/kaze/helper/cdn.helper.js";
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

/** Normalize one playable stream for the public surface. */
function publicStream(s, referer = null) {
  if (!s?.url && !s?.embedUrl) return null;
  const url = s.url || null;
  const kind = url && (isHlsUrl(url) || /\.(mp4|mkv|webm)(\?|$)/i.test(url)) ? "direct" : (url ? "direct" : "embed");
  const out = {
    provider: s.provider || "server",
    originalName: s.originalName || null,
    type: s.type || null,
    url,
    embedUrl: s.embedUrl || null,
    proxiedUrl: url ? proxiedUrl(url, s.referer || referer) : null,
    isHls: Boolean(s.isHls) || isHlsUrl(url || ""),
    kind: url ? kind : "embed",
  };
  if (s.qualities?.length) out.qualities = s.qualities;
  if (s.subtitles?.length) out.subtitles = s.subtitles;
  if (s.skipIntro) out.skipIntro = s.skipIntro;
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
              originalName: s?.originalName || null,
              type: s?.type || null,
              ...(s?.beta ? { beta: true } : {}),
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
            .map((s) => ({ name: s?.name || "server", originalName: s?.originalName || null, type: s?.type || null, id: s?.sourceId || s?.id || null }))
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

    // 1. primary listing lane
    const kaze = getLane("kaze");
    try {
      const match = await matchSlug(kaze, canonical);
      if (match) {
        const data = await kaze.watch(match.listingId, ep, type === "all" ? "all" : type);
        for (const s of data?.streams || []) {
          const pub = publicStream(s, STREAM_REFERER);
          if (pub?.url) out.push(pub);
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
            if (pub?.url) out.push(pub);
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

  const enc = encodeURIComponent(key || String(anilistId));
  res.json({
    success: true,
    api: "APIKuoshi",
    key: keyFor(anilistId),
    anime: publicAnime(detail || canonical),
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

// ================================================================ INFRA
// Playback infrastructure: restreams m3u8 playlists and media so browsers
// can play them cross-origin.
//
// Token-gated CDNs (nexabloom/qeltrix family — 32-hex path pairs) are
// RE-TOKENIZED on every hop: the 90 s HMAC TTL would break mid-playback
// if a playlist-embedded stale token were reused. Each proxied variant/
// segment request re-enters these handlers, so a fresh token is always
// minted before the upstream fetch.

const PROXY_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

router.get("/proxy/hls", wrap(async (req, res) => {
  const raw = req.query.url;
  if (!raw || !/^https?:\/\//i.test(raw)) throw new CustomError("Missing/invalid ?url= (absolute http(s) m3u8 URL)", 400);
  const ref = req.query.ref || null;
  const url = withCdnToken(raw);

  const r = await axios.get(url, {
    responseType: "text",
    timeout: 20000,
    headers: { "User-Agent": PROXY_UA, ...(ref ? { Referer: ref } : {}) },
  });

  const body = String(r.data || "");
  const base = new URL(url.split("?")[0]);
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
  const raw = req.query.url;
  if (!raw || !/^https?:\/\//i.test(raw)) throw new CustomError("Missing/invalid ?url= (absolute http(s) URL)", 400);
  const ref = req.query.ref || null;
  const url = withCdnToken(raw);

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
