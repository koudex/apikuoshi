/**
 * ============================================================
 *  APIKuoshi — src/core/chain.js                       v2.0.0
 * ============================================================
 *  THE STREAMING CHAIN — one call, whole journey.
 *
 *  Instead of calling /api/search -> /api/anime -> /api/anime/episodes
 *  -> /api/anime/servers -> /api/watch yourself, /api/chain runs the
 *  ENTIRE pipeline as nested functions inside one request:
 *
 *    resolve  ->  info  ->  episodes  ->  servers  ->  streams  ->  probe
 *
 *  ...and because it doubles as a TEST endpoint, every hop is timed,
 *  recorded and reported in steps[], every stream URL is probed against
 *  the real CDN (HTTP status, latency, content-type, referer
 *  requirement), and the response ends with a ready-to-play `best`
 *  stream.
 *
 *  The requested episode's REAL name (MAL crowd-sourced — the same
 *  source that backs /api/anime/episodes) is merged into `episode`
 *  and echoed as `episodeTitle`, e.g. "The Journey's End", with
 *  titleJapanese / aired / filler / recap.
 *
 *  Input (any ONE of):
 *    q=dandadan            search -> best match
 *    key=anilist:154587    any anime key format
 *    id=154587             alias of key
 *    slug=one-piece-odmau  direct listing slug
 *  Options:
 *    ep=1                  episode number (default 1)
 *    type=sub|dub|all      audio track preference (default sub)
 *    channel=alpha|beta|gamma  optional internal lane override
 *    probe=0               skip CDN probing (faster, unverified streams)
 *    all=1                 harvest streams from EVERY channel, not just
 *                          the first one that plays
 * ============================================================
 */
import axios from "axios";
import config from "../config.js";
import { withCache } from "./cache.js";
import { CustomError } from "./errors.js";
import { getLane } from "./registry.js";
import { unifiedSearch } from "./fallback.js";
import { anilistSearch, anilistById } from "./anilist.js";
import { resolveKeyToAnilist, matchSlug, keyFor } from "./keys.js";
import { isMegaplayUrl, normalizeMegaplayEmbedUrl } from "../sources/kaze/extractors/streamResolver.extractor.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Referer some stream CDNs expect — they 403 without it. */
const STREAM_REFERER = process.env.STREAM_PROXY_REFERER || "https://megaplay.buzz/";

const PROBE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const PROBE_TIMEOUT_MS = 8000;
const PROBE_MAX_BYTES = 256 * 1024; // never download the whole video

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

const now = () => Date.now();

/** Time one async step; never throws — failures become { ok:false, error }. */
async function timed(name, fn) {
  const t0 = now();
  try {
    const data = await fn();
    return { step: name, ok: true, ms: now() - t0, data };
  } catch (err) {
    return { step: name, ok: false, ms: now() - t0, error: err?.message || String(err) };
  }
}

const isHlsUrl = (url = "") => String(url).toLowerCase().includes(".m3u8");

/**
 * Same-origin playback URL through the built-in CORS proxies — for REAL
 * media URLs only. Embed player pages return HTML, not media, so they
 * never get a proxiedUrl (clients iframe embedUrl instead).
 */
function proxiedUrl(url, referer = null) {
  if (!url) return null;
  const direct = isHlsUrl(url) || /\.(mp4|mkv|webm)(\?|$)/i.test(url);
  if (!direct) return null;
  const ref = referer ? `&ref=${encodeURIComponent(referer)}` : "";
  const enc = encodeURIComponent(url);
  return isHlsUrl(url) ? `/api/proxy/hls?url=${enc}${ref}` : `/api/proxy/video?url=${enc}${ref}`;
}

// ---------------------------------------------------------------------------
// Episode names — MAL's crowd-sourced per-episode titles
// ---------------------------------------------------------------------------

/**
 * MAL episode titles, indexed by episode number.
 *
 * The listing lanes only return placeholder titles ("Episode 1", ...).
 * MAL has the real, crowd-sourced episode names — the same source that
 * backs /api/anime/episodes — so both surfaces report the true name of
 * any episode (e.g. "The Journey's End") plus its Japanese title,
 * airdate, and filler/recap flags.
 *
 * Exported for the routes file — /api/anime/episodes merges the same
 * index. Cached per malId under ONE shared key, so an anime's episode
 * titles are scraped from MAL at most once per cache window, no matter
 * which endpoint asks first. Never throws — failures yield {}.
 */
export async function malEpisodeIndex(malId) {
  if (!malId) return {};
  try {
    return await withCache(`mal-episodes:${malId}:v1`, config.cacheSeconds, async () => {
      const ishi = getLane("ishi");
      if (typeof ishi.malAllEpisodes !== "function") return {};
      const list = await ishi.malAllEpisodes(parseInt(malId, 10));
      const index = {};
      for (const m of Array.isArray(list) ? list : []) {
        const n = Number(m?.malId);
        if (Number.isFinite(n)) index[n] = m;
      }
      return index;
    });
  } catch {
    return {};
  }
}

/**
 * Probe ONE stream URL against its CDN — STRICT.
 * A URL only counts as playable when the response is actually a stream:
 *   - HLS: playlist must contain #EXTM3U (some CDNs 200 with HTML errors)
 *   - progressive: status 206, or 200 with a video/audio content-type
 * An HTML answer is an embed page, not a stream -> playable: false.
 * If the CDN answers 401/403 we retry once with the player Referer and
 * report `refererRequired: true` when that was the missing piece.
 */
async function probeStream(url) {
  const attempt = async (referer) => {
    const t0 = now();
    try {
      const r = await axios.get(url, {
        timeout: PROBE_TIMEOUT_MS,
        maxContentLength: PROBE_MAX_BYTES,
        responseType: "text",
        maxRedirects: 5,
        headers: {
          "User-Agent": PROBE_UA,
          Range: "bytes=0-1023",
          ...(referer ? { Referer: referer } : {}),
        },
      });
      const ms = now() - t0;
      const body = typeof r.data === "string" ? r.data : "";
      const ct = String(r.headers["content-type"] || "");
      const looksHls = isHlsUrl(url) || ct.includes("mpegurl") || body.includes("#EXTM3U");
      const isHtml = /text\/html/i.test(ct);

      if (looksHls && body.includes("#EXTM3U")) {
        const variants = (body.match(/EXT-X-STREAM-INF/g) || []).length;
        const segments = (body.match(/EXTINF/g) || []).length;
        const detail = variants
          ? `HLS master playlist — ${variants} variant${variants > 1 ? "s" : ""}`
          : segments
            ? `HLS media playlist — ${segments} segment${segments > 1 ? "s" : ""}`
            : "HLS playlist";
        return {
          playable: true, httpStatus: r.status, latencyMs: ms, contentType: ct || "application/vnd.apple.mpegurl",
          bytesReceived: body.length, refererRequired: Boolean(referer), detail,
        };
      }
      if (isHtml) {
        return {
          playable: false, httpStatus: r.status, latencyMs: ms, contentType: ct, refererRequired: false,
          detail: "HTML page (embed player?), not a raw stream",
        };
      }
      if (r.status === 206 || ((r.status === 200) && /video|audio|mp4|octet-stream|binary|mpeg/i.test(ct))) {
        return {
          playable: true, httpStatus: r.status, latencyMs: ms, contentType: ct || "(none)",
          bytesReceived: body.length, refererRequired: Boolean(referer),
          detail: `video stream (${ct || "unlabeled"})`,
        };
      }
      return { playable: false, httpStatus: r.status, latencyMs: ms, contentType: ct, refererRequired: false, detail: `unexpected status ${r.status} with content-type ${ct || "(none)"}` };
    } catch (err) {
      return {
        playable: false,
        httpStatus: err?.response?.status || null,
        latencyMs: now() - t0,
        contentType: err?.response?.headers?.["content-type"] || null,
        refererRequired: false,
        detail: err?.response ? `HTTP ${err.response.status} rejected` : err?.message || "network error",
      };
    }
  };

  const first = await attempt(null);
  if (first.playable) return first;
  // Retry with the player referer — the usual reason a working stream 403s.
  const second = await attempt(STREAM_REFERER);
  if (second.playable) return { ...second, refererRequired: true };
  return second.latencyMs <= first.latencyMs ? second : first;
}

// ---------------------------------------------------------------------------
// Step 1 — RESOLVE: any input -> { anilistId, canonical, listingSlug }
// ---------------------------------------------------------------------------

async function stepResolve(input) {
  const kaze = getLane("kaze");
  const ishi = getLane("ishi");
  const out = { via: null, anilistId: null, canonical: null, listingSlug: null, listingMatchScore: null, siteIds: null };

  // --- direct listing slug -----------------------------------------------
  if (input.slug) {
    out.via = "slug";
    const info = await kaze.info(input.slug); // cached by the lane
    out.listingSlug = input.slug;
    out.listingInfo = info;
    // best-effort canonical identity from the listing's own title
    try {
      const found = await anilistSearch(info?.title || input.slug, 1);
      if (found.length) {
        out.anilistId = found[0].anilistId;
        out.canonical = await anilistById(out.anilistId);
      }
    } catch { /* canonical is optional for the slug path */ }
    return out;
  }

  // --- unified search ----------------------------------------------------
  if (input.q) {
    out.via = "search";
    const data = await unifiedSearch(input.q, 1);
    const groups = data.groups || [];
    if (!groups.length) throw new CustomError(`No anime found for "${input.q}"`, 404);
    // Rank groups by how well their title matches the QUERY — otherwise a
    // spin-off/mini-anime that happens to sort first would hijack the chain
    // (e.g. "frieren" matching the ●● no Mahou mini anime over the series).
    const { titleSimilarity } = await import("./titles.js");
    const ranked = groups
      .map((g) => ({
        g,
        score: Math.max(
          titleSimilarity(g.title || "", input.q),
          titleSimilarity(g.titleRomaji || "", input.q),
          titleSimilarity(g.titleEnglish || "", input.q)
        ),
      }))
      .sort((a, b) => b.score - a.score);
    // String similarity ties for short queries ("frieren" scores 62 against
    // every Frieren title), so break ties the way a human would: more
    // available channels = the mainstream title, then shorter = the series
    // not its spin-off. The pool keeps near-top matches in a small window.
    const top = ranked[0]?.score || 0;
    const pool = ranked.filter((x) => x.score >= top - 15);
    pool.sort((a, b) => {
      const av = (Object.keys(b.g.lanes || {}).length) - (Object.keys(a.g.lanes || {}).length);
      if (av) return av;
      return String(a.g.title || "").length - String(b.g.title || "").length;
    });
    // prefer a pool entry the primary lane can play; else the best pool entry
    const picked = pool.find((x) => (x.g.lanes?.kaze || []).length) || pool[0];
    const group = picked.g;
    out.searchMatchScore = picked.score;
    out.anilistId = group.anilistId;
    out.canonical = group.anilistId ? await anilistById(group.anilistId) : null;
    out.searchContext = {
      query: input.q,
      matched: group.title,
      matchScore: picked.score,
    };
    // a primary-lane member carries the playable slug for free — no extra search
    const kazeMember = (group.lanes?.kaze || [])[0];
    if (kazeMember?.listingId) {
      out.listingSlug = kazeMember.listingId;
      out.listingMatchScore = kazeMember.matchScore;
    }
  } else {
    // --- any other key format (anilist:<id> / mal:<id> / bare id / title)
    out.via = "key";
    out.anilistId = await resolveKeyToAnilist(input.key);
    out.canonical = await anilistById(out.anilistId);
    if (!out.canonical) throw new CustomError(`No anime entry ${out.anilistId}`, 404);
  }

  // --- fill what's still missing -----------------------------------------
  if (!out.listingSlug && out.canonical) {
    const match = await matchSlug(kaze, out.canonical).catch(() => null);
    if (match) {
      out.listingSlug = match.listingId;
      out.listingMatchScore = match.matchScore;
    }
  }
  if (out.anilistId && !out.siteIds) {
    try {
      const { getSiteIds } = await import("../sources/ishi/dist/utils/mapper.js");
      out.siteIds = await getSiteIds(out.anilistId);
    } catch { /* mapper offline */ }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Step 2 — INFO: listing info + canonical identity
// ---------------------------------------------------------------------------

async function stepInfo(ctx) {
  const kaze = getLane("kaze");
  let listingInfo = ctx.resolve.listingInfo || null;
  if (!listingInfo && ctx.resolve.listingSlug) {
    listingInfo = await kaze.info(ctx.resolve.listingSlug).catch(() => null);
  }
  return { listingInfo, canonical: ctx.resolve.canonical };
}

// ---------------------------------------------------------------------------
// Step 3 — EPISODES: primary lane first, playback channels as fallback
// ---------------------------------------------------------------------------

async function stepEpisodes(ctx, input) {
  const kaze = getLane("kaze");
  const ishi = getLane("ishi");
  const log = [];

  if (ctx.resolve.listingSlug) {
    try {
      const list = await kaze.episodes(ctx.resolve.listingSlug);
      if (list?.length) return { channel: "primary", episodes: list, log };
      log.push("primary lane: empty episode list");
    } catch (err) {
      log.push(`primary lane: ${err.message}`);
    }
  }

  const channels = input.channel ? [input.channel] : ishi.channels;
  for (const channel of channels) {
    try {
      const data = await ishi.episodes(ctx.resolve.anilistId, null, channel);
      if (data?.episodes?.length) return { channel, episodes: data.episodes, log };
      log.push(`${channel}: ${data?.error || "no episodes"}`);
    } catch (err) {
      log.push(`${channel}: ${err.message}`);
    }
  }
  throw new CustomError(`No episode list available. ${log.join(" | ")}`, 404);
}

// ---------------------------------------------------------------------------
// Step 4 — SERVERS: the server list for the requested episode
// ---------------------------------------------------------------------------

async function stepServers(ctx, input) {
  const kaze = getLane("kaze");
  const ishi = getLane("ishi");
  const ep = input.ep;
  const log = [];

  // primary lane path: episode's encrypted server_ids token -> AJAX server list
  if (ctx.episodes.channel === "primary") {
    try {
      const target = ctx.episodes.episodes.find((e) => Math.round(Number(e.episode)) === Math.round(Number(ep)));
      if (target) {
        const { extractServerList } = await import("../sources/kaze/extractors/streamInfo.extractor.js");
        const raw = await extractServerList([target.serverIds || target.id].flat(), ctx.resolve.listingSlug);
        const list = Array.isArray(raw) ? raw : raw?.servers ?? [];
        if (list.length) {
          return {
            channel: "primary",
            episodeMeta: target,
            log,
            servers: list.map((s) => ({
              name: s?.name || s?.server || "server",
              type: s?.type || null,
              linkId: s?.link_id || s?.linkId || s?.id || s?.sourceId || null,
            })).filter((s) => s.linkId),
          };
        }
        log.push("primary lane: empty server list");
      } else {
        log.push(`primary lane: episode ${ep} not in list`);
      }
    } catch (err) {
      log.push(`primary lane: ${err.message}`);
    }
  }

  // playback-channel path: per-channel server list
  const channels = input.channel
    ? [input.channel]
    : [...(ctx.episodes.channel !== "primary" ? [ctx.episodes.channel] : []), ...ishi.channels.filter((c) => c !== ctx.episodes.channel)];
  for (const channel of [...new Set(channels)]) {
    try {
      const list = await ishi.servers(ctx.resolve.anilistId, null, ep, channel);
      const arr = Array.isArray(list) ? list : list?.servers ?? [];
      if (arr.length) {
        return {
          channel,
          episodeMeta: null,
          log,
          servers: arr.map((s) => ({
            name: s?.name || "server",
            type: s?.type || null,
            linkId: s?.sourceId || s?.id || null,
          })).filter((s) => s.linkId),
        };
      }
      log.push(`${channel}: ${list?.error || "no servers"}`);
    } catch (err) {
      log.push(`${channel}: ${err.message}`);
    }
  }
  throw new CustomError(`No servers for episode ${ep}. ${log.join(" | ")}`, 404);
}

// ---------------------------------------------------------------------------
// Step 5 — STREAMS: resolve every server to a real stream URL
// ---------------------------------------------------------------------------

async function stepStreams(ctx, input, { skipPrimary = false } = {}) {
  const kaze = getLane("kaze");
  const ishi = getLane("ishi");
  const log = [];
  const streams = [];
  const seen = new Set();

  const pushStream = (s) => {
    if (!s?.url || seen.has(s.url)) return;
    seen.add(s.url);
    streams.push(s);
  };

  // --- primary lane: resolve each server's link through its own flow
  if (!skipPrimary && ctx.servers.channel === "primary") {
    for (const srv of ctx.servers.servers) {
      try {
        const info = await kaze.streamByLinkId(srv.linkId, ctx.resolve.listingSlug);
        const src = info?.sources?.[0] || info?.source || info?.url || null;
        let url = typeof src === "string" ? src : src?.url || src?.file || null;
        if (!url) {
          log.push(`${srv.name}: no URL in stream payload`);
          continue;
        }

        // MegaPlay embed URLs must always be served under the /videojs/
        // player prefix — upstream renders an error page without it.
        if (isMegaplayUrl(url)) url = normalizeMegaplayEmbedUrl(url);

        // The link payload often points at an EMBED PLAYER page. The lane
        // ships a deep resolver for exactly this: embed page -> data-id ->
        // player API -> real m3u8/mp4. Run it so the chain reports the
        // stream a <video> tag can actually play.
        let qualities = null;
        let embedUrl = null;
        if (!isHlsUrl(url) && !/\.(mp4|mkv|webm)(\?|$)/i.test(url)) {
          embedUrl = url;
          const resolved = await kaze.resolveStreamUrl(url).catch(() => null);
          if (resolved?.url) {
            url = resolved.url;
            qualities = Array.isArray(resolved.qualities)
              ? resolved.qualities.map((q) => ({ label: q.label || q.quality || null, url: q.url || null })).filter((q) => q.url)
              : [];
          } else {
            log.push(`${srv.name}: embed did not resolve (${resolved?.error || "no stream url"})`);
          }
        }

        pushStream({
          lane: "primary",
          provider: srv.name,
          type: srv.type || null,
          url,
          kind: isHlsUrl(url) || /\.(mp4|mkv|webm)(\?|$)/i.test(url) ? "direct" : "embed",
          embedUrl: embedUrl && embedUrl !== url ? embedUrl : info?.embedUrl || null,
          qualities: qualities || undefined,
          isHls: isHlsUrl(url),
          referer: STREAM_REFERER,
          subtitles: info?.subtitles || [],
          skipIntro: info?.skipData ? { intro: info.skipData.intro || null, outro: info.skipData.outro || null } : null,
        });
      } catch (err) {
        log.push(`${srv.name}: ${err.message}`);
      }
    }
  }

  // --- playback channels: watch flow per channel (server-level fallback inside)
  // Runs when the caller pinned a channel (always honored), when a channel won
  // the servers step, when the primary lane produced only embeds (embed pages
  // are iframe-playable but not direct <video> streams), during a rescue pass
  // (skipPrimary), or when all=1. The channel that won the servers step goes first.
  const hasDirect = streams.some((s) => s.kind === "direct" || isHlsUrl(s.url) || /\.(mp4|mkv|webm)(\?|$)/i.test(s.url));
  const allChannels = input.channel ? [input.channel] : ishi.channels;
  const wanted = skipPrimary
    ? allChannels
    : input.channel
      ? allChannels // pinned channel — always hunt it, hasDirect or not
      : ctx.servers.channel !== "primary" || input.all || !hasDirect
        ? (ctx.servers.channel !== "primary"
            ? [ctx.servers.channel, ...allChannels.filter((c) => c !== ctx.servers.channel)]
            : allChannels)
        : [];

  for (const channel of [...new Set(wanted)]) {
    try {
      const data = await ishi.watch(ctx.resolve.anilistId, null, input.ep, input.type === "all" ? "all" : input.type, channel);
      for (const s of data?.streams || []) {
        let url = s.url || s.mp4 || null;
        if (url && isMegaplayUrl(url)) url = normalizeMegaplayEmbedUrl(url);
        if (url) {
          pushStream({
            lane: channel,
            provider: s.provider || data.server || channel,
            type: s.type || null,
            url,
            kind: isHlsUrl(url) || /\.(mp4|mkv|webm)(\?|$)/i.test(url) ? "direct" : "embed",
            embedUrl: s.embedUrl || null,
            isHls: Boolean(s.isHls) || isHlsUrl(url),
            referer: null,
            subtitles: s.subtitles || [],
            skipIntro: s.skipIntro || null,
          });
        }
      }
      if (!data?.streams?.length) log.push(`${channel}: ${data?.error || "no streams"}`);
      // silent fallback: stop hunting once a DIRECT stream exists (embeds don't count)
      if (!input.all && streams.some((s) => s.kind === "direct")) break;
    } catch (err) {
      log.push(`${channel}: ${err.message}`);
    }
  }

  return { streams, log };
}

// ---------------------------------------------------------------------------
// Step 6 — PROBE: test every stream URL against its CDN
// ---------------------------------------------------------------------------

async function stepProbe(streams) {
  const tested = await Promise.all(
    streams.map(async (s) => {
      const probe = await probeStream(s.url);
      return {
        ...s,
        probe,
        proxiedUrl: proxiedUrl(s.url, s.referer || (probe.refererRequired ? STREAM_REFERER : null)),
      };
    })
  );
  const playable = tested.filter((s) => s.probe.playable);
  return { tested, playableCount: playable.length, deadCount: tested.length - playable.length };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function runStreamingChain(input) {
  const totalStart = now();
  const steps = [];
  const record = (r) => {
    steps.push({ step: r.step, ok: r.ok, ms: r.ms, detail: r.ok ? r.detail : r.error });
    return r;
  };

  const ep = Math.max(1, parseInt(input.ep, 10) || 1);
  const type = ["sub", "dub", "all"].includes(input.type) ? input.type : "sub";
  const normalized = { ...input, ep, type };

  // ---- 1. resolve ---------------------------------------------------------
  const resolveStep = record(
    await timed("resolve", () => stepResolve(normalized))
  );
  if (!resolveStep.ok) {
    const err = new CustomError(`Chain broke at resolve: ${resolveStep.error}`, 404);
    err.steps = steps;
    throw err;
  }
  const ctx = { resolve: resolveStep.data };
  const r = ctx.resolve;
  steps[steps.length - 1].detail =
    `${keyFor(r.anilistId) ?? "unidentified"}${r.canonical?.title ? ` — ${r.canonical.title}` : ""}` +
    `${r.listingSlug ? ` · listing: ${r.listingSlug}` : " · listing not matched"}` +
    `${r.via ? ` · via ${r.via}` : ""}`;

  // ---- episode names: start the MAL fetch NOW ------------------------------
  // The canonical identity (and malId) is known, so kick off the MAL
  // episode-title fetch immediately and let it overlap the info/episodes/
  // servers/streams/probe hops. Warm cache: free. Cold: hidden inside the
  // chain's other work — ~0 added latency by the time we need it.
  const titlesStart = now();
  const malTitlesPromise = malEpisodeIndex(r.canonical?.malId ?? null);

  // ---- 2. info ------------------------------------------------------------
  const infoStep = record(await timed("info", () => stepInfo(ctx)));
  if (infoStep.ok) {
    ctx.info = infoStep.data;
    const li = infoStep.data.listingInfo;
    steps[steps.length - 1].detail = li
      ? `${li.title || "?"}${li.episodes ? ` · ${li.episodes} eps` : ""}${li.status ? ` · ${li.status}` : ""}`
      : "listing info unavailable — canonical metadata only";
  }

  // ---- 3. episodes ----------------------------------------------------------
  const epStep = record(await timed("episodes", () => stepEpisodes(ctx, normalized)));
  if (!epStep.ok) {
    const err = new CustomError(`Chain broke at episodes: ${epStep.error}`, 404);
    err.steps = steps;
    throw err;
  }
  ctx.episodes = epStep.data;
  steps[steps.length - 1].detail = `${ctx.episodes.episodes.length} episode(s) available`;

  // ---- 4. servers -----------------------------------------------------------
  const srvStep = record(await timed("servers", () => stepServers(ctx, normalized)));
  if (!srvStep.ok) {
    const err = new CustomError(`Chain broke at servers: ${srvStep.error}`, 404);
    err.steps = steps;
    throw err;
  }
  ctx.servers = srvStep.data;
  steps[steps.length - 1].detail = `${ctx.servers.servers.length} server(s) for episode ${ep}`;

  // ---- 5. streams -----------------------------------------------------------
  const streamStep = record(await timed("streams", () => stepStreams(ctx, normalized)));
  ctx.streams = streamStep.data;
  const resolvedCount = streamStep.data.streams.length;
  steps[steps.length - 1].detail = resolvedCount
    ? `${resolvedCount} stream URL(s) resolved`
    : `no stream URLs resolved`;

  // ---- 6. probe -------------------------------------------------------------
  let probeData = null;
  let best = null;
  if (resolvedCount && normalized.probe !== false) {
    const probeStep = record(await timed("probe", () => stepProbe(streamStep.data.streams)));
    probeData = probeStep.data;
    steps[steps.length - 1].detail = `${probeData.playableCount}/${probeData.tested.length} stream(s) playable, ${probeData.deadCount} dead`;

    // RESCUE PASS — the primary lane resolved direct URLs but none survived
    // the probe (upstream CDN geo/IP-blocked, dead token, …). Before
    // reporting failure, harvest the playback channels for extra candidates
    // and probe those too. Skipped when the caller pinned a channel or
    // asked for all=1 (both already hunt every channel).
    if (
      !probeData.playableCount &&
      ctx.servers.channel === "primary" &&
      !input.channel &&
      !normalized.all
    ) {
      // all=1 inside the rescue so the channel hunt never short-circuits on
      // the primary's own (already deduped) direct stream
      const rescueStep = record(await timed("streams-fallback", () => stepStreams(ctx, { ...normalized, all: true }, { skipPrimary: true })));
      const rescued = (rescueStep.data?.streams || []).filter((s) => !streamStep.data.streams.some((t) => t.url === s.url));
      if (rescued.length) {
        streamStep.data.streams.push(...rescued);
        const reprobe = record(await timed("probe-fallback", () => stepProbe(rescued)));
        probeData.tested.push(...reprobe.data.tested);
        probeData.playableCount = probeData.tested.filter((s) => s.probe.playable).length;
        probeData.deadCount = probeData.tested.length - probeData.playableCount;
        // recompute the probe step summary now that it includes the rescue
        const probeDetail = steps.find((s) => s.step === "probe");
        if (probeDetail) probeDetail.detail = `${probeData.playableCount}/${probeData.tested.length} stream(s) playable, ${probeData.deadCount} dead`;
        ctx.streams = streamStep.data;
      }
    }

    // best = first playable stream matching the requested type, else first playable
    const playable = probeData.tested.filter((s) => s.probe.playable);
    const preferred = playable.find((s) => !type || type === "all" || s.type === type);
    const winner = preferred || playable[0] || null;
    if (winner) {
      best = {
        provider: winner.provider,
        type: winner.type,
        url: winner.url,
        proxiedUrl: winner.proxiedUrl,
        isHls: winner.isHls,
        kind: winner.kind || "direct",
        latencyMs: winner.probe.latencyMs,
        httpStatus: winner.probe.httpStatus,
        refererRequired: winner.probe.refererRequired,
        detail: winner.probe.detail,
      };
    }
  } else if (resolvedCount) {
    // probe skipped — rank by kind so a direct stream wins over an embed page,
    // and still give proxy URLs so clients can attempt playback
    const directFirst = [...streamStep.data.streams].sort((a, b) => (a.kind === "direct" ? 0 : 1) - (b.kind === "direct" ? 0 : 1));
    probeData = {
      tested: streamStep.data.streams.map((s) => ({ ...s, probe: { playable: null, detail: "probe skipped (?probe=0)" }, proxiedUrl: proxiedUrl(s.url, s.referer) })),
      playableCount: null,
      deadCount: null,
    };
    const preferred = directFirst.find((s) => type === "all" || !type || s.type === type) || directFirst[0];
    const directExists = directFirst.some((s) => s.kind === "direct");
    best = preferred
      ? {
          provider: preferred.provider,
          type: preferred.type, url: preferred.url, proxiedUrl: proxiedUrl(preferred.url, preferred.referer),
          isHls: preferred.isHls, kind: preferred.kind || null, latencyMs: null, httpStatus: null, refererRequired: null,
          detail: "unverified (?probe=0)",
        }
      : null;
    if (best && !directExists) best = { ...best, kind: "embed", detail: "unverified embed page (?probe=0) — play in an <iframe>, not <video>" };
  }

  // ---- 7. episode titles (MAL) -----------------------------------------------
  // Fetch was kicked off right after resolve — awaiting here usually costs
  // ~0ms because it already finished during the servers/streams/probe hops.
  const malIdx = await malTitlesPromise;
  const malTitleCount = Object.keys(malIdx).length;
  steps.push({
    step: "episode-titles",
    ok: true,
    ms: now() - titlesStart,
    detail: malTitleCount
      ? `${malTitleCount} MAL episode title(s) available`
      : "no MAL episode titles for this anime",
  });

  // ---- verdict --------------------------------------------------------------
  const directCount = (probeData?.tested || streamStep.data.streams || []).filter((s) => s.kind === "direct" || isHlsUrl(s.url) || /\.(mp4|mkv|webm)(\?|$)/i.test(s.url || "")).length;
  const verdict = !resolvedCount
    ? "no-streams"
    : best?.kind === "embed"
      ? "embed-only"
      : best
        ? normalized.probe === false
          ? "unverified"
          : "playable"
        : directCount
          ? "no-playable-streams"
          : "embed-only";

  const canonical = r.canonical;
  const listingInfo = ctx.info?.listingInfo || r.listingInfo || null;

  // ---- episode identity: MAL real name > listing placeholder > null ---------
  const episodeMeta = ctx.servers?.episodeMeta || null;
  const malEp = malIdx?.[ep] || null;
  const episodeTitle = malEp?.title || episodeMeta?.title || null;

  // ---- public streams -------------------------------------------------------
  const publicStreams = (probeData?.tested || []).map((s) => {
    const { lane, raw, ...stream } = s;
    return {
      provider: stream.provider,
      type: stream.type ?? null,
      url: stream.url,
      proxiedUrl: stream.proxiedUrl,
      kind: stream.kind ?? (stream.url ? "direct" : "embed"),
      isHls: Boolean(stream.isHls),
      ...(stream.qualities?.length ? { qualities: stream.qualities } : {}),
      ...(stream.embedUrl ? { embedUrl: stream.embedUrl } : {}),
      probe: {
        playable: stream.probe?.playable ?? null,
        httpStatus: stream.probe?.httpStatus ?? null,
        latencyMs: stream.probe?.latencyMs ?? null,
        refererRequired: stream.probe?.refererRequired ?? null,
        detail: stream.probe?.detail ?? null,
      },
    };
  });

  return {
    input: {
      q: input.q || null,
      key: input.key || null,
      slug: input.slug || null,
      ep,
      type,
      probe: normalized.probe !== false,
    },
    anime: {
      key: keyFor(r.anilistId),
      anilistId: r.anilistId ?? null,
      malId: canonical?.malId ?? null,
      title: canonical?.title || listingInfo?.title || null,
      titleRomaji: canonical?.titleRomaji || listingInfo?.titleAlt || null,
      titleEnglish: canonical?.titleEnglish || null,
      poster: canonical?.poster || listingInfo?.poster || null,
      year: canonical?.year || null,
      format: canonical?.format || listingInfo?.type || null,
      genres: canonical?.genres || listingInfo?.genres || [],
      status: canonical?.status || listingInfo?.status || null,
      totalEpisodes: ctx.episodes?.episodes?.length ?? null,
      searchContext: r.searchContext || null,
    },
    episode: {
      requested: ep,
      number: episodeMeta?.episode ?? ep,
      title: episodeTitle,
      titleJapanese: malEp?.titleJapanese || null,
      aired: malEp?.aired || null,
      filler: malEp?.filler ?? false,
      recap: malEp?.recap || false,
      id: episodeMeta?.id || null,
    },
    episodeTitle: episodeTitle || `Episode ${ep}`,
    servers: (ctx.servers?.servers || []).map((s) => ({ name: s.name, type: s.type ?? null })),
    streams: publicStreams,
    best,
    verdict,
    steps,
    timing: {
      totalMs: now() - totalStart,
      stepsMs: Object.fromEntries(steps.map((s) => [s.step, s.ms])),
    },
    usage: {
      replay: `/api/chain?${[
        input.q ? `q=${encodeURIComponent(input.q)}` : null,
        input.key ? `key=${encodeURIComponent(input.key)}` : null,
        input.slug ? `slug=${encodeURIComponent(input.slug)}` : null,
        `ep=${ep}`,
        `type=${type}`,
      ].filter(Boolean).join("&")}`,
      watchEndpoint: `/api/watch?key=${encodeURIComponent(keyFor(r.anilistId) || "")}&ep=${ep}`,
      episodesEndpoint: `/api/anime/episodes?key=${encodeURIComponent(keyFor(r.anilistId) || "")}`,
      serversEndpoint: `/api/anime/servers?key=${encodeURIComponent(keyFor(r.anilistId) || "")}&ep=${ep}`,
      nextEpisode: `/api/chain?${[
        input.q ? `q=${encodeURIComponent(input.q)}` : input.key ? `key=${encodeURIComponent(input.key)}` : `slug=${encodeURIComponent(input.slug || "")}`,
        `ep=${ep + 1}`,
      ].filter(Boolean).join("&")}`,
      playerHint: best?.kind === "embed"
        ? "No direct CDN stream — load best.url (or best.embedUrl) in an <iframe>; it is a MegaPlay player page, not a media file."
        : best?.isHls
          ? "Play best.proxiedUrl directly in an HLS-capable <video> (hls.js) — CORS is already handled."
          : "Play best.proxiedUrl directly in a <video> element — CORS is already handled.",
    },
  };
}

export default { runStreamingChain };
