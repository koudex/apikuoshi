/**
 * ============================================================
 *  APIKuoshi — src/core/keys.js
 * ============================================================
 *  Key resolution shared by every endpoint and the /api/chain
 *  streaming pipeline.
 *
 *  A "key" identifies one anime, canonically:
 *    anilist:<id>   AniList id (strongest)  e.g. anilist:154587
 *    mal:<id>       MyAnimeList id          e.g. mal:52991
 *    <number>       treated as an AniList id
 *    <plain title>  resolved through an AniList search
 * ============================================================
 */
import {
  anilistSearch, anilistById,
} from "./anilist.js";
import { getLane } from "./registry.js";
import { CustomError } from "./errors.js";
import config from "../config.js";

/** Public key string for an AniList id. */
export const keyFor = (anilistId) => (anilistId ? `anilist:${anilistId}` : null);

/**
 * Normalize a user-supplied title for AniList search.
 * AniList's tokenizer treats "Goodbye," (comma glued to a word) as a
 * junk token, so "Goodbye, Lara" finds nothing while "goodbye lara"
 * finds the show. Turn punctuation into a space, collapse whitespace,
 * lowercase — so comma and space become interchangeable.
 */
 
function normalizeTitleQuery(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/[,:;!?."'()\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolve any public key to an AniList id. */
export async function resolveKeyToAnilist(key) {
  if (!key) throw new CustomError("Provide ?key= (anilist:<id> | mal:<id> | <id> | <title>)", 400);
  const s = String(key).trim();

  if (/^anilist:\d+$/i.test(s)) return parseInt(s.split(":")[1], 10);
  if (/^mal:\d+$/i.test(s)) {
    const ishi = getLane("ishi");
    const alId = await ishi.malToAnilist(parseInt(s.split(":")[1], 10));
    if (alId) return alId;
    throw new CustomError("Could not map that MAL id to AniList (AniList unreachable?)", 404);
  }
    if (/^\d+$/.test(s)) return parseInt(s, 10); // bare number = anilist id
  if (s.includes(":")) throw new CustomError(`Unknown key format "${s}"`, 400);

  // plain title -> anilist.
  // Try the raw form first (preserves "Steins;Gate", "Re:Zero"), then the
  // normalized form (fixes "Goodbye, Lara" and other punctuation+space cases).
  const attempts = Array.from(new Set([s, normalizeTitleQuery(s)].filter(Boolean)));
  for (const q of attempts) {
    const found = await anilistSearch(q, 1);
    if (found.length) return found[0].anilistId;
  }
  throw new CustomError(`No anime found for title "${s}"`, 404);
}

/**
 * Best title-match for slug-keyed content against the canonical entry.
 * Used internally to map a canonical anime onto a playable listing.
 */
export async function matchSlug(lane, canonical) {
  const { titleSimilarity } = await import("./titles.js");
  const results = await lane.search(canonical?.titleRomaji || canonical?.title || String(canonical?.anilistId || ""));
  const best = results
    .map((r) => ({
      r,
      s: Math.max(
        titleSimilarity(r.title, canonical?.titleRomaji || canonical?.title || ""),
        titleSimilarity(r.title, canonical?.titleEnglish || ""),
        r.titleAlt ? titleSimilarity(r.titleAlt, canonical?.titleRomaji || canonical?.title || "") : 0
      ),
    }))
    .sort((a, b) => b.s - a.s)[0];
  if (!best || best.s < config.dedupThreshold) return null;
  return { listingId: best.r.listingId, title: best.r.title, matchScore: best.s };
}

/** Canonical AniList entry for any key (throws CustomError on failure). */
export async function canonicalFor(key) {
  const anilistId = await resolveKeyToAnilist(key);
  const canonical = await anilistById(anilistId);
  if (!canonical) throw new CustomError("Could not load metadata for this anime", 502);
  return { anilistId, canonical };
}
