/**
 * ============================================================
 *  APIKuoshi — src/core/art.js
 * ============================================================
 *  Poster / banner / logo art resolution with a cross-provider
 *  fallback chain, ported from the AniVault-Scraper design
 *  (github.com/SH0MIK/AniVault-Scraper).
 *
 *  ART FALLBACK CHAIN
 *  ------------------
 *    AniList  →  keyless GraphQL, has poster (coverImage) + banner,
 *                mapped straight off the MAL id (no title search).
 *    TMDB     →  best key art (poster + backdrop + transparent LOGO,
 *                per-season posters) — needs TMDB_API_KEY; skipped
 *                gracefully when the key is absent.
 *    Kitsu    →  keyless, poster + cover, MAL id mapping endpoint.
 *
 *  Every provider reports its own provenance in `sources`, so clients
 *  always know WHERE each image came from. A provider missing an image
 *  type never fails the call — the chain simply keeps the previous
 *  provider's value for that type.
 * ============================================================
 */
import { anilistDetail } from "./anilist.js";
import { extractSeasonHint, tmdbAnimeImages, tmdbEnabled } from "./tmdb.js";
import { kitsuAnimeId, kitsuAnimeImages } from "./kitsu.js";
import { cacheGet, cacheSet } from "./cache.js";

const img = (u) => (typeof u === "string" && u.length > 0 ? u : null);

/**
 * Resolve the richest available art for one anime.
 *
 * @param {object} p
 * @param {number|null} p.anilistId  canonical AniList id (preferred)
 * @param {number|null} p.malId      MAL id (used for AniList/Kitsu mapping)
 * @param {string|null} p.title      display title (used for TMDB search)
 * @param {string|null} p.titleRomaji romaji title (TMDB search fallback)
 * @param {number|null} p.seasonHint optional explicit season override
 * @param {boolean}     p.isList     skip cache (bulk listing callers)
 * @returns {{ art: object, log: string[] }}
 */
export async function resolveArt({ anilistId = null, malId = null, title = null, titleRomaji = null, seasonHint = null, isList = false }) {
  const log = [];
  const cacheKey = `art:${anilistId ?? "t"}:${malId ?? ""}:${seasonHint ?? ""}`;
  if (!isList) {
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) {
      log.push("art: cache hit");
      return { art: cached, log };
    }
  }

  const art = {
    poster: null,
    posterOriginal: null,
    banner: null,
    bannerOriginal: null,
    backdrop: null,
    logo: null,
    posterSource: null,
    bannerSource: null,
    logoSource: null,
    sources: [],
  };

  // Keep the best canonical title for the TMDB search: English first
  // (TMDB indexes English titles best), romaji fallback.
  const rawTitle = title || titleRomaji || null;

  // ── 1) AniList (keyless, works even without a MAL id) ────────────────
  if (anilistId || malId) {
    try {
      const detail = anilistId
        ? await anilistDetail(anilistId).catch(() => null)
        : null;
      const poster = img(detail?.poster);
      const banner = img(detail?.banner);
      if (poster || banner) {
        if (!art.poster && poster) {
          art.poster = poster;
          art.posterSource = "anilist";
        }
        if (!art.banner && banner) {
          art.banner = banner;
          art.bannerSource = "anilist";
        }
        art.sources.push({ provider: "anilist", poster: poster ?? null, banner: banner ?? null });
        log.push(`AniList art: ${poster ? "poster" : "-"} / ${banner ? "banner" : "-"}`);
      } else {
        log.push("AniList art: nothing usable");
      }
      // Detail call may have given us a MAL id we did not have before.
      if (!malId && detail?.malId) malId = detail.malId;
      if (!rawTitle && detail) rawTitle = detail.titleEnglish || detail.titleRomaji || detail.title || null;
      if (!title && detail) title = detail.titleEnglish || detail.titleRomaji || detail.title || null;
    } catch (e) {
      log.push(`AniList art: failed (${e?.message})`);
    }
  }

  // ── 2) TMDB (needs a key; best logos + per-season posters) ───────────
  if (tmdbEnabled() && title) {
    try {
      // Strip the season marker off the title ("Show II" -> "Show", 2) so
      // the search matches the base show; keep the raw title as fallback.
      let hint = seasonHint ?? null;
      const candidates = [];
      for (const t of [title, titleRomaji]) {
        if (!t) continue;
        const { base, season } = extractSeasonHint(t);
        if (season !== null && hint === null) hint = season;
        candidates.push(base);
        candidates.push(t);
      }
      const titles = [...new Set(candidates.filter(Boolean))];
      log.push(`TMDB titles to try: ${titles.join(" | ")}${hint ? ` (season hint: ${hint})` : ""}`);

      for (const t of titles) {
        const { result, log: tlog } = await tmdbAnimeImages(t, hint, true);
        log.push(...tlog);
        if (result) {
          if (!art.poster && result.poster) {
            art.poster = result.poster;
            art.posterOriginal = result.posterOriginal;
            art.posterSource = "tmdb";
          }
          if (!art.banner && result.backdrop) {
            art.banner = result.backdrop;
            art.bannerOriginal = result.backdropOriginal;
            art.bannerSource = "tmdb";
          }
          if (!art.logo && result.logo) {
            art.logo = result.logo;
            art.logoSource = "tmdb";
          }
          art.backdrop = art.backdrop || result.backdrop || null;
          art.sources.push({ provider: "tmdb", tmdbId: result.showId, showName: result.showName, season: result.season, poster: result.poster, backdrop: result.backdrop, logo: result.logo });
          break;
        }
      }
    } catch (e) {
      log.push(`TMDB art: failed (${e?.message})`);
    }
  } else if (!tmdbEnabled()) {
    log.push("TMDB art: skipped (no TMDB_API_KEY set — see .env.example)");
  }

  // ── 3) Kitsu (keyless; poster/cover fallback) ────────────────────────
  if (malId || title) {
    try {
      const kitsuId = await kitsuAnimeId(malId, title, log);
      if (kitsuId) {
        const { result } = await kitsuAnimeImages(kitsuId, true);
        if (result) {
          if (!art.poster && result.poster) {
            art.poster = result.poster;
            art.posterOriginal = result.posterOriginal;
            art.posterSource = "kitsu";
          }
          if (!art.banner && result.cover) {
            art.banner = result.cover;
            art.bannerOriginal = result.coverOriginal;
            art.bannerSource = "kitsu";
          }
          art.sources.push({ provider: "kitsu", kitsuAnimeId: kitsuId, poster: result.poster, cover: result.cover });
        }
      }
    } catch (e) {
      log.push(`Kitsu art: failed (${e?.message})`);
    }
  }

  const resolved = Boolean(art.poster || art.banner || art.logo);
  if (resolved) cacheSet(cacheKey, art, 43200); // 12h — art is effectively static
  return { art, log };
}
