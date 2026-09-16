/**
 * ============================================================
 *  APIKuoshi — src/adapters/kaze.adapter.js
 * ============================================================
 *  Internal data lane "kaze" — catalog, discovery and download
 *  specialist. Wraps the engine's own extractors UNCHANGED: they
 *  already provide mirror fallback, optional ScraperAPI/
 *  FlareSolverr support and an LRU cache.
 * ============================================================
 */
import { extractSearchResults, extractSearchSuggestions } from "../sources/kaze/extractors/search.extractor.js";
import { extractAnimeInfo } from "../sources/kaze/extractors/animeInfo.extractor.js";
import { extractEpisodeList } from "../sources/kaze/extractors/episodeList.extractor.js";
import { extractStreamInfo, extractServerList } from "../sources/kaze/extractors/streamInfo.extractor.js";
import { extractDownloadLinks } from "../sources/kaze/extractors/download.extractor.js";
import { extractTrending } from "../sources/kaze/extractors/trending.extractor.js";
import { extractTopTen } from "../sources/kaze/extractors/topten.extractor.js";
import { extractPopular } from "../sources/kaze/extractors/popular.extractor.js";
import { extractSpotlight } from "../sources/kaze/extractors/spotlight.extractor.js";
import { extractUpcomingAnime } from "../sources/kaze/extractors/upcomingAnime.extractor.js";
import { extractCompletedAnime } from "../sources/kaze/extractors/completedAnime.extractor.js";
import { extractSchedule } from "../sources/kaze/extractors/schedule.extractor.js";
import { extractNewRelease, extractLatestUpdated, extractNewlyAdded } from "../sources/kaze/extractors/newRelease.extractor.js";
import { extractHomeInfo } from "../sources/kaze/extractors/homeInfo.extractor.js";
import { extractAzList } from "../sources/kaze/extractors/azList.extractor.js";
import { extractCategory } from "../sources/kaze/extractors/category.extractor.js";
import { extractFilter } from "../sources/kaze/extractors/filter.extractor.js";
import { extractStatus } from "../sources/kaze/extractors/status.extractor.js";
import { extractSeasons } from "../sources/kaze/extractors/seasons.extractor.js";
import { extractWatchOrder } from "../sources/kaze/extractors/watchOrder.extractor.js";
import { extractRandom } from "../sources/kaze/extractors/random.extractor.js";
import { extractTopAnimeRankings } from "../sources/kaze/extractors/topAnimeRankings.extractor.js";
import { extractRecentlyUpdatedTabs } from "../sources/kaze/extractors/recentlyUpdatedTabs.extractor.js";
import { extractTrendingSidebar } from "../sources/kaze/extractors/trendingSidebar.extractor.js";
import { resolveStreamUrl } from "../sources/kaze/extractors/streamResolver.extractor.js";
import { withCache } from "../core/cache.js";

async function search(keyword, page = 1) {
  const data = await extractSearchResults(keyword, page);
  const items = Array.isArray(data?.data) ? data.data : [];
  return items.map((i) => ({
    lane: "kaze",
    listingId: i.slug,
    title: i.title,
    titleAlt: i.japaneseTitle || null,
    poster: i.poster,
    episodes: i.total || i.sub || null,
    type: i.type,
    genres: i.genres || [],
    sub: i.sub,
    dub: i.dub,
    raw: i,
  }));
}

async function suggestions(keyword) {
  return extractSearchSuggestions(keyword);
}

async function info(slug) {
  return withCache(`kaze:info:${slug}`, 1800, async () => {
    const data = await extractAnimeInfo(slug);
    return {
      lane: "kaze",
      listingId: slug,
      title: data?.title || data?.name || null,
      titleAlt: data?.japaneseTitle || data?.japanese || null,
      poster: data?.poster || data?.image || null,
      synopsis: data?.synopsis || data?.plot || null,
      episodes: data?.totalEpisodes ?? data?.episodes ?? null,
      status: data?.status || null,
      type: data?.type || null,
      genres: data?.genres || [],
      raw: data,
    };
  });
}

async function episodes(slug) {
  const data = await extractEpisodeList(slug);
  const list = Array.isArray(data?.episodes)
    ? data.episodes
    : Array.isArray(data)
      ? data
      : [];
  return list.map((e) => ({
    lane: "kaze",
    listingId: slug,
    episode: e.episode ?? e.episode_no ?? e.episodeNo ?? e.number ?? e.num ?? null,
    title: e.title || `Episode ${e.episode ?? e.episode_no ?? "?"}`,
    id: e.id ?? e.episodeId ?? null,
    serverIds: e.server_ids ?? e.serverIds ?? null,
    isFiller: e.isFiller ?? null,
    url: e.url || null,
    raw: e,
  }));
}

async function servers(slug, ep) {
  const eps = await episodes(slug);
  const target = eps.find((e) => Math.round(Number(e.episode)) === Math.round(Number(ep)));
  if (!target) return [];
  // The engine's AJAX server list wants the episode's encrypted server_ids
  // token, not the numeric episode id.
  const data = await extractServerList([target.serverIds || target.id].flat(), slug);
  return Array.isArray(data) ? data : data?.servers ?? [];
}

/** Resolve a stream for one episode. linkId comes from the server list. */
async function streamByLinkId(linkId, watchSlug = null) {
  return extractStreamInfo(linkId, watchSlug);
}
/** Full watch flow: episode -> server list -> stream, all via lane logic. */
async function watch(slug, ep, type = "sub") {
  const eps = await episodes(slug);
  const target = eps.find((e) => Math.round(Number(e.episode)) === Math.round(Number(ep)));
  if (!target) return { lane: "kaze", listingId: slug, episode: ep, streams: [], note: "Episode not found" };

  let serverData = [];
  try {
    const raw = await extractServerList([target.serverIds || target.id].flat(), slug);
    serverData = Array.isArray(raw) ? raw : raw?.servers ?? [];
  } catch { /* fall through */ }

  // Extract each server's stream link via the engine's own streamInfo logic.
  // extractStreamInfo already runs the deep /videojs/ resolution, so `url`
  // arrives as a tokenized, playable m3u8/mp4 — no extra hop needed.
  const streams = [];
  const linkIds = new Set();
  const wanted = String(type || "").toLowerCase();
  const ordered = [
    ...serverData.filter((s) => !wanted || String(s.type || "").toLowerCase() === wanted),
    ...serverData.filter((s) => wanted && String(s.type || "").toLowerCase() !== wanted),
  ];
  for (const srv of ordered) {
    const linkId = srv?.link_id || srv?.linkId || srv?.id || srv?.sourceId;
    if (!linkId || linkIds.has(linkId)) continue;
    linkIds.add(linkId);
    try {
      const info = await extractStreamInfo(linkId, slug);
      const src = info?.url || info?.sources?.[0] || info?.source || null;
      if (src) {
        streams.push({
          provider: srv?.name || srv?.server || "server",
          originalName: srv?.originalName || null,
          type: srv?.type || type,
          url: typeof src === "string" ? src : src.url || src.file || null,
          embedUrl: info?.embedUrl || null,
          isHls: String(typeof src === "string" ? src : src.url || "").includes(".m3u8"),
          qualities: info?.qualities || [],
          subtitles: info?.subtitles || [],
          skipIntro: info?.skipData ? { intro: info.skipData.intro || null, outro: info.skipData.outro || null } : null,
        });
      }
    } catch (err) {
      streams.push({ provider: srv?.name || "server", originalName: srv?.originalName || null, error: err.message });
    }
  }

  return { lane: "kaze", listingId: slug, episode: ep, streams };
}

async function download(slug, ep) {
  // search slugs can carry a "/ep-N" watch-path suffix; the download page
  // wants the clean anime slug.
  const clean = String(slug || "").split("/")[0];
  return extractDownloadLinks(clean, ep);
}

// ---- discovery passthroughs (used by the unified browse endpoints) -------
const passthrough = (fn, name) => async (...args) => {
  const data = await fn(...args);
  return {
    lane: "kaze",
    kind: name,
    data: Array.isArray(data) ? data : data?.results ?? data?.data ?? data,
  };
};

/** The lane's airing-status page uses different slugs than the API surface. */
const STATUS_MAP = {
  ongoing: "currently-airing",
  airing: "currently-airing",
  completed: "finished-airing",
  finished: "finished-airing",
  upcoming: "not-yet-aired",
  "not-yet-aired": "not-yet-aired",
};

export const kazeAdapter = {
  id: "kaze",
  capabilities: [
    "search", "suggestions", "info", "episodes", "servers", "watch",
    "download", "trending", "trending-sidebar", "top-ten", "top-rankings",
    "popular", "spotlight", "home", "random", "upcoming", "completed",
    "new-release", "newly-added", "latest-updated", "recently-updated",
    "schedule", "az-list", "filter", "genre", "type", "status",
    "seasons", "watch-order",
  ],
  search,
  suggestions,
  info,
  episodes,
  servers,
  streamByLinkId,
  watch,
  download,
  trending: passthrough(extractTrending, "trending"),
  trendingSidebar: passthrough(extractTrendingSidebar, "trending-sidebar"),
  topTen: passthrough(extractTopTen, "top-ten"),
  topRankings: passthrough(extractTopAnimeRankings, "top-rankings"),
  popular: passthrough(extractPopular, "popular"),
  spotlight: passthrough(extractSpotlight, "spotlight"),
  home: passthrough(extractHomeInfo, "home"),
  random: passthrough(extractRandom, "random"),
  upcoming: passthrough(extractUpcomingAnime, "upcoming"),
  completed: passthrough(extractCompletedAnime, "completed"),
  newRelease: passthrough(extractNewRelease, "new-release"),
  newlyAdded: passthrough(extractNewlyAdded, "newly-added"),
  latestUpdated: passthrough(extractLatestUpdated, "latest-updated"),
  recentlyUpdated: passthrough(extractRecentlyUpdatedTabs, "recently-updated"),
  schedule: passthrough(extractSchedule, "schedule"),
  azList: (letter, page = 1) => passthrough(extractAzList, "az-list")(letter, page),
  category: (kind, slug, page = 1) => passthrough(extractCategory, kind)(`${kind}/${slug}`, page),
  filter: (params) => passthrough(extractFilter, "filter")(params),
  status: (status, page = 1) => passthrough(extractStatus, "status")(STATUS_MAP[String(status).toLowerCase()] || status, page),
  seasons: passthrough(extractSeasons, "seasons"),
  watchOrder: passthrough(extractWatchOrder, "watch-order"),
  resolveStreamUrl,
};

export default kazeAdapter;
