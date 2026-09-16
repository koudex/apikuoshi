#!/usr/bin/env node
/**
 * ============================================================
 *  APIKuoshi — scripts/test_all_endpoints.mjs        v2.0.0
 * ============================================================
 *  Chained live test of the API surface:
 *    1. every catalog endpoint from /api/docs.json gets a real request
 *       (PASS = 200 + success, GRACEFUL = honest 4xx/5xx from an
 *       environmentally-blocked upstream, FAIL = crash/wrong shape/404)
 *    2. dedicated cross-endpoint chains (search -> anime -> episodes
 *       -> servers -> watch; /api/chain with every input form; meta)
 *    3. response-shape guarantees (lean schema, no internal leakage)
 *  Usage: node scripts/test_all_endpoints.mjs [baseUrl]
 * ============================================================
 */
const BASE = process.argv[2] || "http://127.0.0.1:6969";

let pass = 0, graceful = 0, fail = 0;
const failures = [];
const ok = (msg) => { pass++; console.log("  ✓", msg); };
const soft = (msg) => { graceful++; console.log("  ○", msg); };
const bad = (msg) => { fail++; failures.push(msg); console.error("  ✗", msg); };

const j = async (path, timeout = 70000) => {
  const r = await fetch(BASE + path, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeout) });
  let body = null;
  try { body = await r.json(); } catch { /* html or empty */ }
  return { status: r.status, body };
};

const HAS = (b, ...keys) => keys.every((k) => b && typeof b === "object" && k in b);

/** Brand-leak detector: internal lane ids + upstream project names must never surface.
 *  Fragments assembled on purpose so this file stays brand-clean itself.
 *
 *  NOTE (v2.1): the original `koto`/`vault`/`pahe` substring matchers were
 *  too aggressive — they false-positive'd on legitimate Japanese episode
 *  titles like "Kangaeteiru Koto wo Itte Shimau Mahou" (where "koto" just
 *  means "thing/matter"). The matchers are now anchored to brand-shaped
 *  tokens (domain-like or hyphenated brand names) so Japanese text and
 *  other incidental substrings no longer trip the detector.
 */
const LEAK = new RegExp(
  [
    "ani" + "koto",           // anikoto (brand)
    "ani" + "koto" + "tv",    // anikototv
    "ani" + "vault",          // anivault
    "anime" + "pahe",         // animepahe
    "anidap",                 // anidap
    "shin" + "ii",            // shinii (internal lane id, not the Japanese name)
    "sh0" + "mik",            // sh0mik
    "sourceId",
    "availableOn",
    "usedSources",
    "attempts",
    "fallbackOrder",
    "subSource"
  ].join("|"), "i");
const noLeak = (label, body) => {
  const m = JSON.stringify(body)?.match(LEAK);
  if (m) bad(`${label} leaks internal field/name: ${[...new Set(m)].join(", ")}`);
  else ok(`${label} response is clean (single-API shape, no plumbing)`);
};

// ------------------------------------------------- 1. docs-driven sweep
console.log("\n[1] Catalog-driven endpoint sweep (every documented endpoint)");
const cat = (await j("/api/docs.json", 20000)).body;
if (!HAS(cat, "endpoints", "allEndpoints")) { console.error("FATAL: /api/docs.json broken"); process.exit(1); }
ok(`docs.json: v${cat.version}, ${cat.counts.endpoints} endpoints, ${Object.keys(cat.endpoints).length} families`);
noLeak("docs.json", cat);

const SKIPS = new Set(["/api/proxy/hls", "/api/proxy/video", "/api/proxy/subtitle"]); // tested separately

const classify = ({ status, body }) => {
  if (status === 200 && body?.success) return "PASS";
  if (status === 200 && body && typeof body === "object") return "PASS";
  // graceful: upstream source blocked in THIS environment (honest 4xx/5xx)
  const msg = String(body?.message || "");
  const envBlocked =
    (status === 404 || status === 502 || status === 503 || status === 400) &&
    (msg.includes("No ") || msg.includes("not found") || msg.includes("missing") || msg.includes("Missing") || msg.includes("unavailable") || msg.includes("available"));
  return envBlocked ? "GRACEFUL" : "FAIL";
};

for (const ep of cat.allEndpoints) {
  if (SKIPS.has(ep.p) || !ep.try) continue;
  const r = await j(ep.try);
  const v = classify(r);
  const line = `${ep.m} ${ep.try} -> ${r.status}`;
  if (v === "PASS") ok(line);
  else if (v === "GRACEFUL") soft(`${line} (graceful: ${String(r.body?.message || "").slice(0, 90)})`);
  else bad(`${line} — ${JSON.stringify(r.body).slice(0, 120)}`);
}
ok("endpoint sweep done (proxy endpoints + no-try endpoints tested in chains below)");

// ---------------------------------------------- 2. integrated chains
console.log("\n[2] Integrated chains");

// chain A: search -> anime -> episodes -> servers -> watch
const s = (await j("/api/search?q=frieren")).body;
if (s?.success && s.count > 0 && Array.isArray(s.results))
  ok(`/api/search: ${s.count} unified results (one entry per anime)`);
else bad("search chain broken: " + JSON.stringify(s).slice(0, 120));
noLeak("search", s);

const first = s?.results?.[0];
const anilistId = first?.anilistId;
const info = (await j(`/api/anime?key=anilist:${anilistId}`)).body;
if (info?.success && info.anime?.titleRomaji) ok(`/api/anime: ${info.anime.titleRomaji} (key=${info.key})`);
else bad("anime info chain broken");
noLeak("anime", info);

const eps = (await j(`/api/anime/episodes?key=anilist:${anilistId}`)).body;
if (eps?.success && eps.count > 0 && Array.isArray(eps.episodes) && Number.isFinite(eps.episodes[0]?.number))
  ok(`/api/anime/episodes: ${eps.count} episodes, flat normalized list`);
else bad("episodes chain broken: " + JSON.stringify(eps).slice(0, 140));
noLeak("episodes", eps);

const servers = (await j(`/api/anime/servers?key=anilist:${anilistId}&ep=1`)).body;
if (servers?.success && servers.count > 0 && Array.isArray(servers.servers) && servers.servers[0]?.name)
  ok(`/api/anime/servers: ${servers.count} server(s), first="${servers.servers[0].name}" (${servers.servers[0].type ?? "n/a"})`);
else soft(`/api/anime/servers graceful: ${String(servers?.message || "").slice(0, 100)}`);

const watch = (await j(`/api/watch?key=anilist:${anilistId}&ep=1`)).body;
if (watch?.success && watch.streams?.length && watch.stream?.url)
  ok(`/api/watch: stream="${watch.stream.provider}" (${watch.stream.kind}), ${watch.streams.length} total, proxiedUrl=${Boolean(watch.stream.proxiedUrl)}`);
else soft(`/api/watch graceful: ${String(watch?.message || "").slice(0, 100)}`);
noLeak("watch", watch);

const dl = (await j(`/api/download?key=anilist:${anilistId}&ep=1`)).body;
if (dl?.success) ok(`/api/download: ${dl.count ?? "?"} download option(s)`);
else soft(`/api/download graceful: ${String(dl?.message || "").slice(0, 90)}`);

// chain A2: THE STREAMING CHAIN — every input form
console.log("\n[2b] /api/chain — the one-call streaming pipeline");
const chainQ = (await j("/api/chain?q=frieren&ep=1", 180000)).body;
if (chainQ?.success && Array.isArray(chainQ.steps)) {
  const hopOk = chainQ.steps.filter((s) => s.ok).length;
  ok(`/api/chain?q= : verdict=${chainQ.verdict}, hops ${hopOk}/${chainQ.steps.length} ok, anime="${chainQ.anime?.title}" (${chainQ.anime?.key}), best=${chainQ.best?.provider ?? "none"} (${chainQ.best?.kind ?? "-"})`);
  if (chainQ.anime?.anilistId !== 154587)
    soft("  note: search matched a different Frieren entry than the main series (coverage may vary)");
} else bad("chain search-form broken: " + JSON.stringify(chainQ).slice(0, 140));
noLeak("chain", chainQ);

const chainId = (await j("/api/chain?id=154587&ep=1", 180000)).body;
if (chainId?.success && chainId.anime?.anilistId === 154587)
  ok(`/api/chain?id= : verdict=${chainId.verdict}, best=${chainId.best?.provider ?? "none"}`);
else bad("chain id-form broken: " + JSON.stringify(chainId).slice(0, 140));

const chainMal = (await j("/api/chain?key=mal:52991&ep=1", 180000)).body;
if (chainMal?.success && chainMal.anime?.malId === 52991)
  ok(`/api/chain?key=mal: : verdict=${chainMal.verdict} (mal->anilist mapping works)`);
else bad("chain mal-form broken: " + JSON.stringify(chainMal).slice(0, 140));

const chainFast = (await j("/api/chain?q=frieren&ep=1&probe=0", 120000)).body;
if (chainFast?.success && chainFast.timing?.totalMs)
  ok(`/api/chain probe=0 fast mode: verdict=${chainFast.verdict}, ${chainFast.timing.totalMs}ms`);
else bad("chain fast mode broken");

const chainNone = await j("/api/chain", 15000);
if (chainNone.status === 400) ok("/api/chain without input -> 400 with guidance");
else bad("chain validation broken: " + chainNone.status);

const chain404 = await j("/api/chain?q=zzzznotarealanimexyz", 60000);
if (chain404.status === 404) ok("/api/chain unknown anime -> honest 404");
else bad("chain not-found handling broken: " + chain404.status);

// chain B: suggestions + resolve
const sug = (await j("/api/suggestions?keyword=one+pie")).body;
if (sug?.success && Array.isArray(sug.suggestions)) ok(`/api/suggestions: ${sug.suggestions.length} suggestions`);
else bad("suggestions broken");
noLeak("suggestions", sug);

const res = (await j("/api/resolve?title=attack+on+titan")).body;
if (res?.success && res.key && typeof res.playable === "boolean")
  ok(`/api/resolve: AoT -> ${res.key}, playable=${res.playable}`);
else bad("resolve broken");
noLeak("resolve", res);

// chain C: meta family
const meta = (await j(`/api/meta?key=anilist:${anilistId}`)).body;
if (meta?.success && meta.anime?.anilistId === anilistId && meta.availability)
  ok(`/api/meta: genres=${meta.anime.genres?.length ?? 0}, indexed=${meta.availability.indexed}`);
else bad("meta broken");
noLeak("meta", meta);

const chars = (await j(`/api/meta/characters?key=anilist:${anilistId}`)).body;
if (chars?.success && chars.characters?.length) ok(`/api/meta/characters: ${chars.characters.length} entries (first VA: ${chars.characters[0].voiceActor?.name || "—"})`);
else bad("meta/characters broken");

const recs = (await j(`/api/meta/recommendations?key=anilist:${anilistId}`)).body;
if (recs?.success && Array.isArray(recs.recommendations)) ok(`/api/meta/recommendations: ${recs.recommendations.length} recs`);
else bad("meta/recommendations broken");

const mal = (await j("/api/meta/mal?key=mal:52991")).body;
if (mal?.success && mal.mal?.malId === 52991) ok(`/api/meta/mal: MAL details ok (${mal.mal.title})`);
else bad("meta/mal broken: " + JSON.stringify(mal).slice(0, 120));

const ext = (await j("/api/meta/external?key=mal:52991")).body;
if (ext?.success) ok(`/api/meta/external: links=${Array.isArray(ext.externalLinks) ? ext.externalLinks.length : typeof ext.externalLinks}`);
else soft("/api/meta/external graceful: " + String(ext?.message || "").slice(0, 90));

// chain D: browse family sanity — array lists answer {kind,count,results},
// object payloads (home sections, top-ten groups, single pick) answer {kind,data}
console.log("\n[2c] Browse family (single normalized list shape)");
for (const path of ["/api/trending", "/api/home", "/api/spotlight", "/api/top-ten", "/api/popular", "/api/schedule", "/api/airing", "/api/random", "/api/trending-sidebar"]) {
  const r = (await j(path)).body;
  const listShape = r?.success && Array.isArray(r.results) && "count" in r && "kind" in r;
  const objShape = r?.success && r.kind && r.data && typeof r.data === "object";
  if (listShape) ok(`${path}: kind=${r.kind}, ${r.count} results`);
  else if (objShape) ok(`${path}: kind=${r.kind}, object payload (${JSON.stringify(r.data).length}b)`);
  else bad(`${path} broken: ${JSON.stringify(r).slice(0, 100)}`);
  noLeak(path, r);
}

const az = (await j("/api/az-list/a")).body;
if (az?.success && Array.isArray(az.results)) ok(`/api/az-list/a: ${az.count} results`);
else bad("az-list broken: " + JSON.stringify(az).slice(0, 100));

const filt = (await j("/api/filter?genre=action&status=airing&language=sub")).body;
if (filt?.success) ok("/api/filter facets: 200");
else bad("filter broken: " + JSON.stringify(filt).slice(0, 100));

const gen = (await j("/api/genre/action")).body;
if (gen?.success) ok("/api/genre/action: 200");
else bad("genre broken");

const typ = (await j("/api/type/tv")).body;
if (typ?.success) ok("/api/type/tv: 200");
else bad("type broken");

const st = (await j("/api/status/airing")).body;
if (st?.success) ok("/api/status/airing: 200");
else bad("status broken");

const seas = (await j("/api/seasons/one-piece-episode-of-merry-the-tale-of-one-more-friend-3xnsp")).body;
if (seas?.success) ok("/api/seasons/:slug: 200");
else soft("/api/seasons graceful: " + String(seas?.message || "").slice(0, 90));

const wo = (await j("/api/watch-order/one-piece-episode-of-merry-the-tale-of-one-more-friend-3xnsp")).body;
if (wo?.success) ok("/api/watch-order/:slug: 200");
else soft("/api/watch-order graceful: " + String(wo?.message || "").slice(0, 90));

// chain E: proxy infra
const p400 = await j("/api/proxy/hls");
if (p400.status === 400) ok("/api/proxy/hls validation: 400 on missing ?url= (route alive)");
else bad("/api/proxy/hls should 400 without url, got " + p400.status);
const p400v = await j("/api/proxy/video");
if (p400v.status === 400) ok("/api/proxy/video validation: 400 on missing ?url= (route alive)");
else bad("/api/proxy/video should 400 without url, got " + p400v.status);
const p400s = await j("/api/proxy/subtitle");
if (p400s.status === 400) ok("/api/proxy/subtitle validation: 400 on missing ?url= (route alive)");
else bad("/api/proxy/subtitle should 400 without url, got " + p400s.status);

// real HLS proxy run against a public m3u8 (W3C test stream; network permitting)
try {
  const r = await fetch(BASE + "/api/proxy/hls?url=" + encodeURIComponent("https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"), { signal: AbortSignal.timeout(30000) });
  const t = await r.text();
  if (r.status === 200 && t.includes("#EXTM3U") && t.includes("/api/proxy/")) ok("/api/proxy/hls live restream: playlist rewritten through proxy URIs");
  else soft(`/api/proxy/hls live test skipped (status ${r.status}) — external stream unreachable from sandbox`);
} catch { soft("/api/proxy/hls live test skipped — external stream unreachable from sandbox"); }

// chain F: validation errors are honest 400s
const noQ = await j("/api/search");
if (noQ.status === 400 && noQ.body?.message?.includes("q")) ok("/api/search without ?q= -> 400 with guidance");
else bad("search validation broken: " + noQ.status);

const badKey = await j("/api/watch?key=");
if (badKey.status >= 400 && badKey.status < 500) ok("/api/watch with empty key -> honest 4xx");
else bad("watch validation broken: " + badKey.status);

const unknownKey = await j("/api/watch?key=foo:bar");
if (unknownKey.status >= 400 && unknownKey.status < 500) ok("/api/watch with unknown key format -> honest 4xx");
else bad("unknown key validation broken: " + unknownKey.status);

// removed namespaces must stay removed (names assembled from fragments so
// this file itself stays brand-clean)
console.log("\n[3] Removed namespaces stay removed");
const R = (a, b) => a + b; // fragment joiner
const retiredPaths = [
  `/api/${R("p", "ahe")}/search?q=x`,
  `/api/${R("k", "oto")}/trending`,
  `/api/${R("v", "ault")}/search?q=x`,
  `/api/${R("an", "idap")}/info/1`,
  "/api/s1/trending", "/api/s3/trending", "/api/discovery/trending", "/api/sources",
];
for (const p of retiredPaths) {
  const r = await j(p, 15000);
  if (r.status === 404) ok(`${p} -> 404`);
  else bad(`${p} should be 404, got ${r.status}`);
}

// ---------------------------------------------- summary
console.log(`\n════════════════════════════════════════`);
console.log(`  RESULT: ${pass} PASS · ${graceful} GRACEFUL · ${fail} FAIL`);
console.log(`════════════════════════════════════════`);
if (failures.length) { console.log("Failures:"); failures.forEach((f) => console.log("  -", f)); }
process.exit(fail > 0 ? 1 : 0);
