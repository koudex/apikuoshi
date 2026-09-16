/**
 * ============================================================
 *  APIKuoshi — src/core/fallback.js
 * ============================================================
 *  The resolution machinery.
 *
 *  Behaviour:
 *    - One set of endpoints. A request is tried against internal
 *      data lanes in priority order; the first lane that returns
 *      data wins. Failures are swallowed and logged (the caller
 *      just gets data — or a clean 502 if nothing works).
 *    - unifiedSearch() merges every lane's results into ONE list,
 *      anchored to canonical AniList identity so romaji/English
 *      duplicates collapse into a single entry.
 * ============================================================
 */
import { listLanes, getLane } from "./registry.js";
import config from "../config.js";
import { withCache } from "./cache.js";
import { keyFor } from "./keys.js";

function withTimeout(promise, ms, label) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

/**
 * Run `fn(lane)` across lanes in priority order.
 * Returns the first non-empty, non-throwing result.
 */
export async function withFallback(fn, { label = "call", timeoutMs = config.sourceTimeoutMs } = {}) {
  const lanes = listLanes();
  const failures = [];

  for (const lane of lanes) {
    try {
      const result = await withTimeout(Promise.resolve(fn(lane)), timeoutMs, lane.id);
      const empty =
        result === null ||
        result === undefined ||
        (Array.isArray(result) && result.length === 0) ||
        (result && typeof result === "object" && Array.isArray(result.data) && result.data.length === 0);
      if (!empty) return result;
      failures.push(`${lane.id}: empty result`);
    } catch (err) {
      // SILENT by design — log for operators, keep the chain moving.
      console.error(`[APIKUOSHI][fallback:${label}] ${lane.id} failed:`, err.message);
      failures.push(`${lane.id}: ${err.message}`);
    }
  }
  const error = new Error(`No data available for ${label} right now.`);
  error.statusCode = 502;
  error.failures = failures;
  throw error;
}

/**
 * Unified search.
 * 1. AniList provides the canonical candidate list (romaji + english +
 *    synonyms) — one call, cached.
 * 2. Every lane is queried in parallel (Promise.allSettled).
 * 3. Each result is anchored to a canonical AniList entry when the title
 *    similarity clears the threshold; leftovers are grouped among
 *    themselves by signature/similarity (titles.js).
 * 4. Groups are returned as single entries — duplicates gone.
 *
 * Returns { query, page, groups } where each group carries the public
 * fields plus `lanes` (internal listing handles used by /api/chain).
 */
export async function unifiedSearch(query, page = 1) {
  return withCache(`search:${query.toLowerCase()}:${page}`, config.cacheSeconds, async () => {
    const { groupEntries, titleSimilarity } = await import("./titles.js");
    const { anilistSearch } = await import("./anilist.js");

    const canonical = await anilistSearch(query, 10);

    // 1. lanes that search directly
    const direct = await Promise.allSettled([
      getLane("kaze").search(query, page),
      getLane("ishi").search(query),
    ]);

    const allEntries = [];
    direct.forEach((r) => {
      if (r.status === "fulfilled" && Array.isArray(r.value)) allEntries.push(...r.value);
      else if (r.status === "rejected") console.error(`[APIKUOSHI][search] lane failed:`, r.reason?.message);
    });

    // 2. anchor entries to canonical AniList rows
    for (const entry of allEntries) {
      if (entry.anilistId) continue;
      let best = null;
      let bestScore = 0;
      for (const c of canonical) {
        const candidateTitles = [
          c.titleRomaji, c.titleEnglish, c.title,
          ...(Array.isArray(c.synonyms) ? c.synonyms : []),
        ].filter(Boolean);
        let score = 0;
        for (const ct of candidateTitles) {
          score = Math.max(score, titleSimilarity(entry.title, ct));
          if (entry.titleAlt) score = Math.max(score, titleSimilarity(entry.titleAlt, ct));
        }
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (best && bestScore >= config.dedupThreshold) {
        entry.anilistId = best.anilistId;
        entry.matchScore = bestScore;
      }
    }

    // 3. group everything (anilistId groups win over fuzzy groups)
    const groups = [];
    const byAnilist = new Map();

    for (const entry of allEntries) {
      if (entry.anilistId && byAnilist.has(entry.anilistId)) {
        byAnilist.get(entry.anilistId).members.push(entry);
      } else if (entry.anilistId) {
        const canon = canonical.find((c) => c.anilistId === entry.anilistId) || null;
        const group = {
          anilistId: entry.anilistId,
          canonical: canon,
          title: canon?.title || entry.title,
          members: [entry],
        };
        byAnilist.set(entry.anilistId, group);
        groups.push(group);
      } else {
        groups.push({ anilistId: null, canonical: null, title: entry.title, members: [entry] });
      }
    }

    // fuzzy-merge the unanchored leftovers into anchored groups when titles clearly match
    const anchored = groups.filter((g) => g.anilistId);
    const loose = groups.filter((g) => !g.anilistId);
    for (const g of [...loose]) {
      for (const a of anchored) {
        const c = a.canonical;
        const score = Math.max(
          titleSimilarity(g.title, c?.titleRomaji || a.title),
          titleSimilarity(g.title, c?.titleEnglish || a.title),
          g.members[0]?.titleAlt ? titleSimilarity(g.members[0].titleAlt, c?.titleRomaji || a.title) : 0
        );
        if (score >= config.dedupThreshold) {
          a.members.push(...g.members);
          g.members = [];
          break;
        }
      }
    }
    const finalGroups = [...anchored, ...loose.filter((g) => g.members.length)];

    // 4. shape each group: public fields + internal lane handles
    return {
      query,
      page,
      groups: finalGroups.map((g) => {
        const canon = g.canonical;
        const first = g.members.find((m) => m.poster)?.poster ? g.members : g.members;
        const lanes = {};
        for (const m of g.members) {
          if (!m.lane) continue;
          (lanes[m.lane] ||= []).push({
            listingId: m.listingId,
            title: m.title,
            matchScore: m.matchScore || (m.anilistId ? 100 : null),
          });
        }
        return {
          key: keyFor(g.anilistId),
          anilistId: g.anilistId,
          malId: canon?.malId ?? g.members.find((m) => m.malId)?.malId ?? null,
          title: canon?.title || g.title,
          titleRomaji: canon?.titleRomaji ?? g.members.find((m) => m.titleAlt)?.titleAlt ?? null,
          titleEnglish: canon?.titleEnglish ?? null,
          poster: canon?.poster ?? g.members.find((m) => m.poster)?.poster ?? null,
          year: canon?.year ?? null,
          type: canon?.format ?? g.members.find((m) => m.type)?.type ?? null,
          episodes: canon?.episodes ?? g.members.find((m) => m.episodes)?.episodes ?? null,
          status: canon?.status ?? null,
          lanes,
          _first: first,
        };
      }),
    };
  });
}
