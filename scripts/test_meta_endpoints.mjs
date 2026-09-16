#!/usr/bin/env node
/**
 * ============================================================
 *  APIKuoshi — scripts/test_meta_endpoints.mjs
 * ============================================================
 *  Live verification of EVERY meta endpoint — the classic surface
 *  PLUS the cross-provider art/imagery integration ported from
 *  AniVault-Scraper (AniList → TMDB → Kitsu):
 *
 *   UNIT   extractSeasonHint logic (TMDB title → season stripping)
 *   1. /api/meta                — details + art block + availability
 *   2. /api/meta/art            — AniList→TMDB→Kitsu chain, provenance
 *   3. /api/meta/kitsu          — poster/cover + per-episode data
 *   4. /api/meta/tmdb           — graceful 501 without key; full chain
 *                                 when TMDB_TEST_KEY is exported
 *   5. /api/meta/episode        — title + aired + thumbnail, source-tagged
 *   6. /api/meta/episodes       — full list (thumbs + fast mode), padding
 *   7. classic meta endpoints   — characters/recommendations/season/mal/
 *                                 external/trending regression
 *   8. stream regression        — /api/watch + /api/chain still green
 *
 *  Usage: node scripts/test_meta_endpoints.mjs [baseUrl]
 *         TMDB_TEST_KEY=xxx node scripts/test_meta_endpoints.mjs
 * ============================================================
 */
const BASE = process.argv[2] || "http://127.0.0.1:6969";

let pass = 0, soft = 0, fail = 0;
const ok = (m) => { pass++; console.log("  ✓", m); };
const warn = (m) => { soft++; console.log("  ○", m); };
const bad = (m) => { fail++; console.error("  ✗", m); };

const j = async (path, timeout = 120000) => {
  const r = await fetch(BASE + path, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeout) });
  let body = null;
  try { body = await r.json(); } catch { /* ignore */ }
  return { status: r.status, body };
};

const isHttpUrl = (u) => typeof u === "string" && /^https?:\/\/.+/.test(u);

// ── UNIT: extractSeasonHint (imported straight from the server source) ──
console.log("\n=== UNIT · extractSeasonHint ===");
try {
  const { extractSeasonHint } = await import("../src/core/tmdb.js");
  const cases = [
    ["Attack on Titan Season 3", "Attack on Titan", 3],
    ["Youjo Senki II", "Youjo Senki", 2],
    ["Re:Zero 2nd Season", "Re:Zero", 2],
    ["Kaguya-sama Part 2", "Kaguya-sama", 2],
    ["Dr. Stone: New World", "Dr. Stone: New World", null],   // no marker
    ["Naruto", "Naruto", null],
    ["Show 2003", "Show 2003", null],                          // year guard
    ["One Piece Cour 2", "One Piece", 2],
  ];
  for (const [input, wantBase, wantSeason] of cases) {
    const { base, season } = extractSeasonHint(input);
    if (base === wantBase && season === wantSeason) ok(`"${input}" -> "${base}" (s${season})`);
    else bad(`"${input}" -> got "${base}" (s${season}), want "${wantBase}" (s${wantSeason})`);
  }
} catch (e) {
  bad("extractSeasonHint import failed: " + e.message);
}

console.log(`\n=== meta endpoint verification against ${BASE} ===\n`);
const KEY = "anilist:154587"; // Frieren — stable, indexed on every lane

// ── 1. /api/meta ────────────────────────────────────────────────────────
console.log("[1] GET /api/meta (details + art + availability)");
{
  const { status, body } = await j(`/api/meta?key=${KEY}`);
  if (status === 200 && body?.success && body.anime?.title) {
    ok(`details: "${body.anime.title}" (malId ${body.anime.malId})`);
  } else bad(`/api/meta failed: HTTP ${status}`);
  const a = body?.art;
  if (a?.poster && a.posterSource) ok(`art block present: poster from '${a.posterSource}', banner from '${a.bannerSource}'`);
  else warn("art block missing or empty (providers degraded) — art.sources=" + JSON.stringify(a?.sources ?? []));
  if (body?.availability?.chain) ok("availability map intact (watch/chain)");
  else bad("availability block missing");
}

// ── 2. /api/meta/art ────────────────────────────────────────────────────
console.log("[2] GET /api/meta/art (AniList → TMDB → Kitsu chain)");
{
  const { status, body } = await j(`/api/meta/art?key=${KEY}`);
  if (status === 200 && body?.success) {
    const a = body.art;
    if (isHttpUrl(a.poster)) ok(`poster: ${a.poster.slice(0, 60)}… [${a.posterSource}]`);
    else bad("art.poster missing");
    if (isHttpUrl(a.banner)) ok(`banner: ${a.banner.slice(0, 60)}… [${a.bannerSource}]`);
    else warn("art.banner missing (provider gap, chain tolerated it)");
    if (Array.isArray(body.art.sources) && body.art.sources.length >= 1) {
      ok(`provenance: ${body.art.sources.map((s) => s.provider).join(" + ")} (${body.art.sources.length} providers answered)`);
    } else bad("art.sources[] provenance missing");
    const chainShape = Array.isArray(body.chain) && body.chain.length === 3;
    chainShape ? ok("chain reported: " + body.chain.join(" → ")) : bad("chain array malformed");
  } else bad(`/api/meta/art failed: HTTP ${status} ${JSON.stringify(body?.message ?? "")}`);
}

// ── 3. /api/meta/kitsu ──────────────────────────────────────────────────
console.log("[3] GET /api/meta/kitsu (keyless: images + per-episode)");
{
  const { status, body } = await j(`/api/meta/kitsu?key=mal:52991`);
  if (status === 200 && body?.success && body.images?.poster) {
    ok(`images: kitsuAnimeId=${body.images.kitsuAnimeId}, poster=${body.images.poster.slice(0, 55)}…`);
    if (isHttpUrl(body.images.cover)) ok(`cover (banner-style): present`);
  } else bad(`/api/meta/kitsu failed: HTTP ${status}`);
  const ep = await j(`/api/meta/kitsu?key=mal:52991&ep=1`);
  if (ep.status === 200 && ep.body?.episode?.thumbnail) {
    ok(`episode mode: ep1 "${ep.body.episode.title}" aired ${ep.body.episode.aired}, thumb=${String(ep.body.episode.thumbnail).slice(0, 55)}…`);
  } else bad(`/api/meta/kitsu&ep=1 failed: HTTP ${ep.status}`);
}

// ── 4. /api/meta/tmdb ───────────────────────────────────────────────────
console.log("[4] GET /api/meta/tmdb (key-gated, graceful)");
{
  const noKey = await j(`/api/meta/tmdb?key=${KEY}`);
  if (process.env.TMDB_TEST_KEY) {
    // Full-chain test with a provided key (exported before boot).
    const r = await j(`/api/meta/tmdb?key=${KEY}`);
    if (r.status === 200 && r.body?.images?.poster) {
      ok(`TMDB images: showId=${r.body.images.showId} "${r.body.images.showName}" poster=${r.body.images.poster.slice(0, 55)}…`);
      if (r.body.images.logo) ok(`TMDB logo present (unique to TMDB)`);
      else warn("TMDB logo missing for this title");
    } else bad(`TMDB images with key failed: HTTP ${r.status}`);
    const ep = await j(`/api/meta/tmdb?key=${KEY}&ep=1`);
    if (ep.status === 200 && ep.body?.episode) {
      ok(`TMDB episode: s${ep.body.episode.season}e${ep.body.episode.season} "${ep.body.episode.title}" aired ${ep.body.episode.aired}`);
    } else bad(`TMDB episode with key failed: HTTP ${ep.status}`);
  } else if (noKey.status === 501 && /TMDB_API_KEY/i.test(noKey.body?.message ?? "")) {
    ok("graceful 501 with actionable message when no TMDB_API_KEY (chain still served by AniList+Kitsu)");
  } else bad(`expected graceful 501, got HTTP ${noKey.status}`);
}

// ── 5. /api/meta/episode ────────────────────────────────────────────────
console.log("[5] GET /api/meta/episode (single-episode chain)");
{
  const { status, body } = await j(`/api/meta/episode?key=${KEY}&ep=1`);
  if (status === 200 && body?.success) {
    const e = body.episode;
    if (e.title) ok(`ep1 title: "${e.title}"`);
    else warn("ep1 title null (all providers titleless for this ep)");
    if (isHttpUrl(e.thumbnail)) ok(`thumbnail from '${e.thumbnailSource}'`);
    else bad("no thumbnail resolved by any provider");
    if (["tmdb", "kitsu", "anilist"].includes(e.thumbnailSource)) ok("thumbnailSource is one of tmdb/kitsu/anilist");
    else bad("thumbnailSource unexpected: " + e.thumbnailSource);
  } else bad(`/api/meta/episode failed: HTTP ${status} ${JSON.stringify(body?.message ?? "")}`);

  const badEp = await j(`/api/meta/episode?key=${KEY}`);
  badEp.status === 400 ? ok("invalid ?ep= rejected with 400") : bad(`expected 400, got ${badEp.status}`);
}

// ── 6. /api/meta/episodes ───────────────────────────────────────────────
console.log("[6] GET /api/meta/episodes (full list + fast mode)");
{
  const fast = await j(`/api/meta/episodes?key=${KEY}&thumbs=0`);
  if (fast.status === 200 && fast.body?.count > 0) {
    ok(`fast mode: ${fast.body.count} episodes, no imagery (thumbs=0)`);
  } else bad(`fast mode failed: HTTP ${fast.status}`);

  const full = await j(`/api/meta/episodes?key=${KEY}`);
  if (full.status === 200 && full.body?.count > 0) {
    const eps = full.body.episodes;
    const withThumb = eps.filter((e) => isHttpUrl(e.thumbnail));
    const sources = full.body.thumbnailSources ?? {};
    ok(`full mode: ${full.body.count} episodes, ${withThumb.length} with thumbnails (${JSON.stringify(sources)})`);
    if (withThumb.length === 0) bad("zero thumbnails resolved across the whole chain");
    const s = new Set(withThumb.map((e) => e.thumbnailSource));
    if ([...s].every((x) => ["tmdb", "kitsu", "anilist"].includes(x))) ok("every thumbnailSource valid");
    else bad("invalid thumbnailSource present: " + [...s].join(","));
    const titled = eps.filter((e) => e.title && !/^Episode\s+\d+$/i.test(e.title));
    titled.length > 0 ? ok(`real titles enriched: ${titled.length}/${eps.length} (e.g. ep${eps[0].number} "${eps[0].title}")`) : warn("no real titles enriched (providers sparse for this show)");
  } else bad(`full mode failed: HTTP ${full.status}`);
}

// ── 7. classic meta regression ──────────────────────────────────────────
console.log("[7] classic meta endpoints regression");
{
  const checks = [
    ["/api/meta/characters?key=frieren&limit=3", (b) => b?.characters?.length > 0],
    ["/api/meta/recommendations?key=frieren&limit=3", (b) => b?.recommendations?.length > 0],
    ["/api/meta/season", (b) => Array.isArray(b?.results)],
    ["/api/meta/mal?key=mal:52991", (b) => b?.mal?.malId === 52991 || b?.malId === 52991 || b?.mal],
    ["/api/meta/external?key=mal:52991", (b) => b && ("externalLinks" in b || "streamingPlatforms" in b)],
    ["/api/meta/trending", (b) => b?.success === true],
  ];
  for (const [path, check] of checks) {
    const { status, body } = await j(path);
    if (status === 200 && check(body)) ok(`${path.split("?")[0]} OK`);
    else bad(`${path} failed: HTTP ${status}`);
  }
}

// ── 8. stream regression (integration did not break playback) ───────────
console.log("[8] stream regression (watch + chain)");
{
  const watch = await j(`/api/watch?key=${KEY}&ep=1`, 180000);
  const wstreams = watch.body?.streams?.length ?? watch.body?.results?.length ?? 0;
  if (watch.status === 200 && wstreams > 0) ok(`/api/watch still serves ${wstreams} streams`);
  else bad(`/api/watch regression: HTTP ${watch.status}, streams=${wstreams}`);

  const chain = await j(`/api/chain?key=${KEY}&ep=1`, 180000);
  const cstreams = chain.body?.streams?.length ?? 0;
  if (chain.status === 200 && (cstreams > 0 || chain.body?.best)) ok(`/api/chain still resolves (streams=${cstreams}, best=${chain.body?.best ? "yes" : "no"})`);
  else bad(`/api/chain regression: HTTP ${chain.status}`);
}

console.log(`\n=== RESULT: ${pass} PASS · ${soft} GRACEFUL · ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
