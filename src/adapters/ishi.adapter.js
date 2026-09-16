/**
 * ============================================================
 *  APIKuoshi — src/adapters/ishi.adapter.js
 * ============================================================
 *  Internal data lane "ishi" — metadata and direct-stream
 *  specialist. The engine is TypeScript, compiled with its OWN
 *  tsconfig into src/sources/ishi/dist (logic untouched). This
 *  adapter imports the compiled scrapers: three playback channels
 *  (alpha / beta / gamma) + the identity mapper + resolvers.
 * ============================================================
 */
// NOTE: The engine compiles to CommonJS. Node's CJS named-export
// detection is not 100% reliable across emission patterns, so we import the
// default namespace and destructure — guaranteed to work everywhere.
import scraperAlpha from "../sources/ishi/dist/scrapers/anikoto.js";   // channel alpha
import scraperBeta from "../sources/ishi/dist/scrapers/animeheaven.js"; // channel beta
import scraperGamma from "../sources/ishi/dist/scrapers/desidub.js";   // channel gamma
import anilistScraper from "../sources/ishi/dist/scrapers/anilist.js";
import malScraper from "../sources/ishi/dist/scrapers/mal.js";
import identityMapper from "../sources/ishi/dist/utils/mapper.js";

const { getAnikotoEpisodes, getAnikotoServers, getAnikotoEmbedUrl } = scraperAlpha;
const { getHeavenEpisodes, getHeavenServers, getHeavenStream } = scraperBeta;
const { getDesidubEpisodes, getDesidubServers, getDesidubStream } = scraperGamma;
const { getSeasonNow, getTopBanners } = anilistScraper;
const {
  getAnimeDetails: malDetails,
  getCharacters: malCharacters,
  getRecommendations: malRecommendations,
  getExternalLinks: malExternalLinks,
  getStreamingPlatforms: malStreaming,
  getEpisodes: malEpisodes,
  getAllEpisodes: malAllEpisodes,
  getAnimeThemes: malThemes,
  getAnimeVideos: malVideos,
  getAnimePictures: malPictures,
} = malScraper;
const { malToAnilist, getSiteIds, getSiteIdsByMal, searchAnilist } = identityMapper;

import { withCache } from "../core/cache.js";
import { renameServer } from "../sources/kaze/helper/cdn.helper.js";

/**
 * The lane exposes three playback channels behind one id-resolution layer:
 *   alpha — primary channel (highest availability)
 *   beta  — secondary channel (direct MP4 streams)
 *   gamma — regional dub channel
 * plus an AniList search that anchors everything to canonical ids.
 * (Channel names are internal; clients never need to address them.)
 */

const CHANNELS = ["alpha", "beta", "gamma"];

/** Map a channel name to the compiled scraper's site ids + functions. */
function channelPlumbing(sub) {
  if (sub === "beta") return { siteKey: "animeheaven", eps: getHeavenEpisodes, srv: getHeavenServers, stream: getHeavenStream };
  if (sub === "gamma") return { siteKey: "desidub", eps: getDesidubEpisodes, srv: getDesidubServers, stream: getDesidubStream };
  return { siteKey: "anikoto", eps: getAnikotoEpisodes, srv: getAnikotoServers, stream: getAnikotoEmbedUrl };
}

async function search(query) {
  const results = await searchAnilist(query); // lane's own AniList search (cached internally)
  return results.map((r) => ({
    lane: "ishi",
    listingId: String(r.id),
    anilistId: r.id,
    malId: r.malId ?? null,
    title: r.title,
    titleAlt: null,
    poster: r.coverImage || null,
    episodes: r.episodes ?? null,
    status: r.status || null,
    type: r.format || null,
    raw: r,
  }));
}

async function airing() {
  const data = await getSeasonNow();
  const list = Array.isArray(data?.media) ? data.media : [];
  return list.map((m) => ({
    lane: "ishi",
    listingId: String(m.id),
    anilistId: m.id,
    title: m.title?.english || m.title?.romaji || null,
    titleAlt: m.title?.romaji || null,
    poster: m.coverImage?.large || null,
    episodes: m.episodes ?? null,
    raw: m,
  }));
}

/** Resolve anilist/mal id -> the lane's site ids (title + per-channel slugs). */
async function resolveIds(anilistId, malId) {
  if (anilistId) return getSiteIds(parseInt(anilistId, 10));
  if (malId) return getSiteIdsByMal(parseInt(malId, 10));
  return null;
}

/** Episode list for one playback channel. */
async function episodes(anilistId, malId, channel = "alpha", directId = null) {
  const siteIds = await resolveIds(anilistId, malId);
  if (!siteIds) return { error: "Could not resolve this anime's internal ids" };
  const p = channelPlumbing(channel);

  let id = directId;
  if (!id && channel === "beta") id = siteIds.siteIds?.animeheaven;
  else if (!id && channel === "gamma") id = siteIds.siteIds?.desidub;
  else if (!id) id = siteIds.siteIds?.anikoto;
  if (!id) return { error: "Not indexed on this channel" };

  const list = await p.eps(id);
  return {
    siteId: id,
    episodes: list.map((e) => ({
      lane: "ishi",
      channel,
      listingId: id,
      episode: e.num,
      title: e.title ?? `Episode ${e.num}`,
      id: e.id,
    })),
  };
}

/** Neutral, origin-free display names for servers whose upstream label
 *  carries the source site's own brand (data hygiene at the boundary). */
const TIER = { alpha: "Stream-A", beta: "Stream-B", gamma: "Stream-C" };
const BRANDED_NAME = /animeheaven|desidub|anikoto|kiwi/i;
function neutralName(name, channel) {
  const s = String(name || "");
  return BRANDED_NAME.test(s) ? (TIER[channel] || "Stream") : (s || "Stream");
}

/** Full rename pass: neutral tier name -> friendly codename, keeping
 *  the raw upstream label as originalName (same shape as the kaze lane). */
function friendlyServer(name, channel) {
  const neutral = neutralName(name, channel);
  const { name: codename, originalName } = renameServer(neutral);
  return { name: codename, originalName: String(name || originalName || neutral) };
}

async function servers(anilistId, malId, ep, channel = "alpha", directId = null) {
  const eps = await episodes(anilistId, malId, channel, directId);
  if (eps.error) return eps;
  const target = eps.episodes.find((e) => Math.round(Number(e.episode)) === Math.round(Number(ep)));
  if (!target) return { error: `Episode ${ep} not found` };

  const p = channelPlumbing(channel);
  const raw = channel === "beta" ? await getHeavenServers(target.id)
    : channel === "gamma" ? await getDesidubServers(target.id)
    : await getAnikotoServers(target.id);
  return (raw || []).map((s, i) => {
    const { name, originalName } = friendlyServer(s.name, channel);
    return { ...s, name: name || `Stream-${i + 1}`, originalName: originalName || null };
  });
}

/** Watch flow with server-level silent fallback. */
async function watch(anilistId, malId, ep, type = "sub", channel = "alpha", preferredServer = null, directId = null) {
  const eps = await episodes(anilistId, malId, channel, directId);
  if (eps.error) return { lane: "ishi", channel, episode: ep, streams: [], error: eps.error };
  const target = eps.episodes.find((e) => Math.round(Number(e.episode)) === Math.round(Number(ep)));
  if (!target) return { lane: "ishi", channel, episode: ep, streams: [], error: `Episode ${ep} not found` };

  let allServers = [];
  const p = channelPlumbing(channel);
  allServers = ((await p.srv(target.id)) || []).map((s, i) => {
    const { name, originalName } = friendlyServer(s.name, channel);
    return { ...s, name: name || `Stream-${i + 1}`, originalName: originalName || null };
  });

  let candidates = type === "all" ? allServers : allServers.filter((s) => s.type === type);
  if (preferredServer) {
    candidates = [...candidates].sort((a, b) =>
      (a.name.toLowerCase().includes(preferredServer.toLowerCase()) ? -1 : 1) -
      (b.name.toLowerCase().includes(preferredServer.toLowerCase()) ? -1 : 1)
    );
  }

  for (const server of candidates) {
    try {
      const raw = await p.stream(server.sourceId);
      const m3u8 = raw?.m3u8 || raw?.streamUrl || null;
      if (raw && (m3u8 || raw.embedUrl)) {
        return {
          lane: "ishi",
          channel,
          episode: ep,
          server: server.name,
          streams: [{
            provider: server.name,
            originalName: server.originalName || null,
            type: server.type || type,
            url: m3u8 || null,
            embedUrl: raw.embedUrl || null,
            mp4: raw.mp4 || null,
            isHls: Boolean(raw.m3u8),
            subtitles: raw.subtitles || [],
          }],
        };
      }
    } catch (err) {
      console.error(`[APIKUOSHI][ishi] ${channel} server ${server.name} failed:`, err.message);
      // silent — try next server
    }
  }
  return { lane: "ishi", channel, episode: ep, streams: [], error: "No server produced a stream" };
}

export const ishiAdapter = {
  id: "ishi",
  capabilities: ["search (anilist)", "airing", "episodes", "servers", "watch", "channels alpha/beta/gamma", "mal metadata", "anilist banners"],
  channels: CHANNELS,
  search,
  airing,
  episodes,
  servers,
  watch,
  malToAnilist,
  airingBanners: getTopBanners,
  // MAL metadata family (scrapes myanimelist.net through the lane's own
  // queued + cached scraper — served by the unified /api/meta endpoints)
  malDetails,
  malCharacters,
  malRecommendations,
  malExternalLinks,
  malStreaming,
  malEpisodes,
  // Flat list of ALL episodes for a MAL id (auto-paginates MAL's 100-per-page).
  // Each entry: { malId, url, title, titleJapanese, aired, filler, recap }.
  // Used by the unified /api/anime/episodes endpoint to enrich the kaze list
  // with real per-episode TITLES (kaze only returns "Episode N" placeholders).
  malAllEpisodes,
  malThemes,
  malVideos,
  malPictures,
};

export default ishiAdapter;
