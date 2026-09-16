/**
 * ============================================================
 *  APIKuoshi — src/core/tmdb.js
 * ============================================================
 *  TMDB metadata provider (official REST API — free key required).
 *
 *  Ported from the AniVault-Scraper design (github.com/SH0MIK/AniVault-Scraper)
 *  and adapted to the unified layer's cache/style.
 *
 *  WHY TMDB IS TRICKY FOR ANIME
 *  ----------------------------
 *  TMDB lists anime as ONE show with nested seasons — there is no separate
 *  "Show Name II" entry to search for. A title like "Saga of Tanya the Evil
 *  II" will never match a TMDB search; only the base title does, with
 *  Season 2 as season_number 2 under that same show. extractSeasonHint()
 *  strips the season marker off a title so search works, and reports which
 *  season number it implied so callers can target the right season.
 *
 *  Long-running shonen (Naruto Shippuden, One Piece…) air as one continuous
 *  MAL numbering, but TMDB splits them into many seasons that each restart
 *  at episode 1. mapAbsoluteEpisode() walks the season list cumulatively and
 *  returns BOTH candidate numbering conventions (relative-first, absolute
 *  fallback) — see the comment on that function for why both are needed.
 * ============================================================
 */
import axios from "axios";
import { cacheGet, cacheSet } from "./cache.js";

const TMDB_API_KEY = process.env.TMDB_API_KEY || "";

const CLIENT = axios.create({
  baseURL: "https://api.themoviedb.org/3",
  timeout: 10000,
});

/** Quick gate: endpoints that need a key respond with a clear hint. */
export const tmdbEnabled = () => Boolean(TMDB_API_KEY);

// ── Season-hint extraction ─────────────────────────────────────────────
const ROMAN_TO_NUM = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };

const SEASON_WORD_PATTERNS = [
  { re: /\s+season\s+(\d{1,2})\s*$/i, num: (m) => parseInt(m[1], 10) },
  { re: /\s+(\d{1,2})(?:st|nd|rd|th)\s+season\s*$/i, num: (m) => parseInt(m[1], 10) },
  { re: /\s+part\s+(\d{1,2})\s*$/i, num: (m) => parseInt(m[1], 10) },
  { re: /\s+cour\s+(\d{1,2})\s*$/i, num: (m) => parseInt(m[1], 10) },
];

/**
 * Strip a trailing season marker off an anime title and report the implied
 * season number, e.g. "Attack on Titan Season 3" → { base: "Attack on
 * Titan", season: 3 }. Best-effort; callers should keep the raw title as a
 * fallback search candidate too.
 */
export function extractSeasonHint(title) {
  for (const { re, num } of SEASON_WORD_PATTERNS) {
    const m = title.match(re);
    if (m) return { base: title.slice(0, m.index).trim(), season: num(m) };
  }
  // Trailing roman numeral, e.g. "Youjo Senki II"
  const roman = title.match(/\s+(I{2,3}|IV|VI{0,3}|IX|X)\s*$/i);
  if (roman) {
    const season = ROMAN_TO_NUM[roman[1].toLowerCase()];
    if (season) return { base: title.slice(0, roman.index).trim().replace(/[:\-–]\s*$/, ""), season };
  }
  // Trailing arabic digit (2-10 only, to avoid eating years like "2003")
  const digit = title.match(/\s+(\d{1,2})\s*$/);
  if (digit) {
    const n = parseInt(digit[1], 10);
    if (n >= 2 && n <= 10) return { base: title.slice(0, digit.index).trim().replace(/[:\-–]\s*$/, ""), season: n };
  }
  return { base: title, season: null };
}

// ── Image picking ──────────────────────────────────────────────────────
// Posters/logos: prefer English (they carry title text), then textless.
// Backdrops: prefer textless first (cleaner banner), then English.
function pickBestImage(arr, mode = "lang-first") {
  if (!arr || arr.length === 0) return null;
  const byVotes = [...arr].sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0));
  if (mode === "textless-first") {
    return byVotes.find((i) => !i.iso_639_1) || byVotes.find((i) => i.iso_639_1 === "en") || byVotes[0];
  }
  return byVotes.find((i) => i.iso_639_1 === "en") || byVotes.find((i) => !i.iso_639_1) || byVotes[0];
}

// TMDB genre_id 16 = "Animation". Used to disambiguate shows that share a
// title with a non-anime entry ("One Piece" the anime vs Netflix's 2023
// live-action — both come back from the same search query).
const ANIMATION_GENRE_ID = 16;

async function searchShow(animeTitle, log) {
  const srch = await CLIENT.get("/search/tv", {
    params: { api_key: TMDB_API_KEY, query: animeTitle, language: "en-US" },
  });
  const results = srch.data?.results ?? [];
  if (results.length === 0) {
    log.push(`TMDB: no show found for '${animeTitle}'`);
    return null;
  }

  // Prefer a result that is animated AND Japanese-origin; falls through
  // progressively looser criteria, then whatever TMDB ranked first — this
  // never returns nothing just because a match could not be scored.
  const isAnimated = (r) => Array.isArray(r.genre_ids) && r.genre_ids.includes(ANIMATION_GENRE_ID);
  const isJapanese = (r) => r.original_language === "ja" || (Array.isArray(r.origin_country) && r.origin_country.includes("JP"));

  const show =
    results.find((r) => isAnimated(r) && isJapanese(r)) ||
    results.find((r) => isAnimated(r)) ||
    results.find((r) => isJapanese(r)) ||
    results[0];

  if (show !== results[0]) {
    log.push(`TMDB: '${results[0].name}' (ID ${results[0].id}) ranked first but isn't anime — picked '${show.name}' (ID ${show.id}) instead`);
  }
  log.push(`TMDB: matched '${animeTitle}' -> '${show.name}' (ID ${show.id})`);
  return { id: show.id, name: show.name };
}

// ── Show images: poster / backdrop / logo ──────────────────────────────
/**
 * Poster (cover), backdrop (banner) and logo for a show, by title.
 * `seasonHint` fetches the season-specific poster first (TMDB posters
 * differ per season); backdrops/logos are show-level and shared.
 */
export async function tmdbAnimeImages(animeTitle, seasonHint = null, isList = false) {
  const log = [];
  if (!TMDB_API_KEY) {
    log.push("TMDB: skipped (no TMDB_API_KEY set)");
    return { result: null, log };
  }

  const cacheKey = `tmdb:images:${animeTitle.toLowerCase()}:s${seasonHint ?? ""}`;
  if (!isList) {
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) {
      log.push("TMDB: cache hit");
      return { result: cached, log };
    }
  }

  try {
    const show = await searchShow(animeTitle, log);
    if (!show) {
      cacheSet(cacheKey, null, 86400);
      return { result: null, log };
    }
    const showId = show.id;

    const imgRes = await CLIENT.get(`/tv/${showId}/images`, {
      params: { api_key: TMDB_API_KEY, include_image_language: "en,ja,null" },
    });
    const showPosters = imgRes.data?.posters ?? [];
    const backdrops = imgRes.data?.backdrops ?? [];
    const logos = imgRes.data?.logos ?? [];

    const backdrop = pickBestImage(backdrops, "textless-first");
    const logo = pickBestImage(logos, "lang-first");

    // Poster: hinted season first, then season 1, then show-level.
    let poster = null;
    let posterSeason = null;
    const seasonsToTry = [...new Set([seasonHint, 1].filter((s) => !!s && s > 0))];
    for (const s of seasonsToTry) {
      try {
        const seasonImgRes = await CLIENT.get(`/tv/${showId}/season/${s}/images`, {
          params: { api_key: TMDB_API_KEY, include_image_language: "en,ja,null" },
        });
        const best = pickBestImage(seasonImgRes.data?.posters ?? [], "lang-first");
        if (best) {
          poster = best;
          posterSeason = s;
          log.push(`TMDB: using season ${s} poster`);
          break;
        }
      } catch (e) {
        log.push(`TMDB season ${s} images: ${e?.response?.status ? `HTTP ${e.response.status}` : `request failed (${e?.message})`}`);
      }
    }
    if (!poster) {
      poster = pickBestImage(showPosters, "lang-first");
      if (poster) log.push("TMDB: using show-level poster (no season-specific poster found)");
    }

    if (!poster && !backdrop && !logo) {
      log.push("TMDB: no usable images found at all");
      cacheSet(cacheKey, null, 86400);
      return { result: null, log };
    }

    const result = {
      showId,
      showName: show.name,
      season: posterSeason,
      poster: poster ? `https://image.tmdb.org/t/p/w500${poster.file_path}` : null,
      posterOriginal: poster ? `https://image.tmdb.org/t/p/original${poster.file_path}` : null,
      backdrop: backdrop ? `https://image.tmdb.org/t/p/w1280${backdrop.file_path}` : null,
      backdropOriginal: backdrop ? `https://image.tmdb.org/t/p/original${backdrop.file_path}` : null,
      logo: logo ? `https://image.tmdb.org/t/p/w500${logo.file_path}` : null,
      logoOriginal: logo ? `https://image.tmdb.org/t/p/original${logo.file_path}` : null,
    };
    cacheSet(cacheKey, result, 86400);
    return { result, log };
  } catch (e) {
    const status = e?.response?.status;
    log.push(`TMDB images: ${status ? `HTTP ${status}` : `request failed (${e?.message})`}`);
    return { result: null, log };
  }
}

// ── Absolute episode → TMDB (season, in-season) mapping ────────────────
async function getShowSeasons(showId, log) {
  const cacheKey = `tmdb:seasons:${showId}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const res = await CLIENT.get(`/tv/${showId}`, { params: { api_key: TMDB_API_KEY } });
  const seasons = (res.data?.seasons ?? [])
    .filter((s) => s.season_number > 0) // skip "Specials" (season 0)
    .map((s) => ({ season_number: s.season_number, episode_count: s.episode_count ?? 0 }))
    .sort((a, b) => a.season_number - b.season_number);

  cacheSet(cacheKey, seasons, 86400); // season structure essentially never changes
  log.push(`TMDB: '${showId}' has ${seasons.length} season(s) — ${seasons.map((s) => `S${s.season_number}:${s.episode_count}`).join(", ")}`);
  return seasons;
}

/**
 * Walk the season list cumulatively to find which season the ABSOLUTE
 * episode number falls under. Returns TWO candidate (season, epInSeason)
 * pairs because TMDB is inconsistent about whether a season's own episode
 * numbering resets to 1:
 *   1) relative remainder — the "normal" TMDB convention (tried FIRST:
 *      avoids wrong-but-real matches on split-cour shows whose season is
 *      long enough to also contain the raw absolute number);
 *   2) the absolute number itself — what Shippuden-style imports keep
 *      (S3 episodes numbered 54-71, NOT 1-18). Resolved on the fallback
 *      when the relative candidate 404s.
 */
function mapAbsoluteEpisode(seasons, absoluteEp) {
  let cumulative = 0;
  for (const s of seasons) {
    if (s.episode_count <= 0) continue;
    const before = cumulative;
    cumulative += s.episode_count;
    if (absoluteEp <= cumulative) {
      const relative = absoluteEp - before;
      const candidates = [{ season: s.season_number, epInSeason: relative }];
      if (absoluteEp !== relative) candidates.push({ season: s.season_number, epInSeason: absoluteEp });
      return candidates;
    }
  }
  return [];
}

async function buildEpisodeCandidates(showId, showName, epNum, seasonHint, log) {
  const candidates = [];
  try {
    const seasons = await getShowSeasons(showId, log);
    const mapped = mapAbsoluteEpisode(seasons, epNum);
    if (mapped.length > 0) {
      log.push(`TMDB: absolute ep ${epNum} -> season ${mapped[0].season} (trying e${mapped.map((c) => c.epInSeason).join("/e")})`);
      candidates.push(...mapped);
    } else {
      log.push(`TMDB: absolute ep ${epNum} is beyond every season TMDB lists for '${showName}'`);
    }
  } catch (e) {
    log.push(`TMDB: couldn't fetch season list for '${showName}' (${e?.message})`);
  }
  for (const season of [seasonHint, 1, 2]) {
    if (!season || season <= 0) continue;
    if (candidates.some((c) => c.season === season && c.epInSeason === epNum)) continue;
    candidates.push({ season, epInSeason: epNum });
  }
  return candidates;
}

// ── Episode data: title + air date + still ─────────────────────────────
// ~3 weeks tolerance when sanity-checking a candidate's air date against
// what MAL already recorded — rejects "exists but is the wrong episode"
// matches on split-cour shows (the Mushoku Tensei ep24 class of bug).
const EXPECTED_AIRED_TOLERANCE_MS = 21 * 24 * 60 * 60 * 1000;

function airedMismatch(candidateAired, expectedAired) {
  if (!candidateAired || !expectedAired) return false;
  const a = Date.parse(candidateAired);
  const b = Date.parse(expectedAired);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) > EXPECTED_AIRED_TOLERANCE_MS;
}

/**
 * Combined title + air date + still for one ABSOLUTE episode number.
 * One TMDB request per (season, epInSeason) candidate.
 */
export async function tmdbEpisodeData(animeTitle, epNum, seasonHint = null, isList = false, expectedAired = null) {
  const log = [];
  if (!TMDB_API_KEY) {
    log.push("TMDB: skipped (no TMDB_API_KEY set)");
    return { result: null, log };
  }

  const cacheKey = `tmdb:epdata:${animeTitle.toLowerCase()}:s${seasonHint ?? ""}:${epNum}`;
  if (!isList) {
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) {
      if (!airedMismatch(cached.aired, expectedAired)) {
        log.push("TMDB: cache hit");
        return { result: cached, log };
      }
      log.push(`TMDB: cache hit but air date (${cached.aired}) doesn't match MAL's (${expectedAired}) — refetching`);
    }
  }

  try {
    const show = await searchShow(animeTitle, log);
    if (!show) {
      cacheSet(cacheKey, null, 86400);
      return { result: null, log };
    }
    const showId = show.id;
    const candidates = await buildEpisodeCandidates(showId, show.name, epNum, seasonHint, log);

    for (const { season, epInSeason } of candidates) {
      try {
        const epRes = await CLIENT.get(`/tv/${showId}/season/${season}/episode/${epInSeason}`, {
          params: { api_key: TMDB_API_KEY },
        });
        const name = epRes.data?.name ?? null;
        const airDate = epRes.data?.air_date ?? null;
        const still = epRes.data?.still_path ?? null;
        log.push(`TMDB ${show.name} s${season}e${epInSeason}: ${name || still ? "found" : "no episode data"}`);

        if (name || still) {
          if (airedMismatch(airDate, expectedAired)) {
            log.push(`TMDB s${season}e${epInSeason}: air date ${airDate} is way off MAL's ${expectedAired} — likely the wrong match, trying next candidate`);
            continue;
          }
          const result = {
            showId,
            showName: show.name,
            season,
            title: name,
            aired: airDate,
            stillPath: still,
            thumbnail: still ? `https://image.tmdb.org/t/p/w780${still}` : null,
            thumbnailOriginal: still ? `https://image.tmdb.org/t/p/original${still}` : null,
          };
          cacheSet(cacheKey, result, 86400);
          return { result, log };
        }
      } catch (e) {
        const status = e?.response?.status;
        log.push(`TMDB s${season}e${epInSeason}: ${status ? `HTTP ${status}` : `request failed (${e?.message})`}`);
      }
    }

    log.push(`TMDB: no episode data found for '${animeTitle}' ep ${epNum} (tried ${candidates.map((c) => `s${c.season}e${c.epInSeason}`).join(", ")})`);
    cacheSet(cacheKey, null, 86400);
    return { result: null, log };
  } catch (e) {
    const status = e?.response?.status;
    log.push(`TMDB search: ${status ? `HTTP ${status}` : `request failed (${e?.message})`}`);
    return { result: null, log };
  }
}

/**
 * Total episode count TMDB currently lists for a show (sum of all
 * non-special seasons). Used to detect when the MAL episode page is
 * undercounting an airing show so /api/meta/episodes can pad the tail.
 */
export async function tmdbShowEpisodeCount(animeTitle) {
  if (!TMDB_API_KEY) return null;
  const cacheKey = `tmdb:epcount:${animeTitle.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;
  try {
    const log = [];
    const show = await searchShow(animeTitle, log);
    if (!show) {
      cacheSet(cacheKey, null, 86400);
      return null;
    }
    const seasons = await getShowSeasons(show.id, log);
    const count = seasons.reduce((sum, s) => sum + Math.max(0, s.episode_count), 0);
    const result = { showId: show.id, count };
    cacheSet(cacheKey, result, 86400);
    return result;
  } catch {
    return null;
  }
}
