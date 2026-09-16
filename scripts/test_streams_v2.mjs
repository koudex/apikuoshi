/**
 * ============================================================
 *  APIKuoshi — scripts/test_streams_v2.mjs
 * ============================================================
 *  Full live test suite for the v2.1 stream refresh:
 *    system, catalog, search, servers (naming), watch (all
 *    servers × sub/dub), chain (probe, all=1), proxies
 *    (hls→variant→segment, video, subtitle), embed + direct
 *    URL verification.
 *
 *  Usage:  node scripts/test_streams_v2.mjs [baseUrl]
 *  Exits 0 when the critical suite passes; prints a report.
 * ============================================================
 */
const BASE = process.argv[2] || "http://localhost:6969";

const results = [];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

async function test(name, fn, { critical = false, timeout = 90000 } = {}) {
  const t0 = Date.now();
  try {
    const info = await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout after ${timeout}ms`)), timeout)),
    ]);
    const ms = Date.now() - t0;
    results.push({ name, ok: true, critical, ms, info: info || "" });
    console.log(`  ✓ ${name} (${ms}ms)${info ? ` — ${info}` : ""}`);
  } catch (err) {
    const ms = Date.now() - t0;
    results.push({ name, ok: false, critical, ms, info: err.message });
    console.log(`  ✗ ${name} (${ms}ms) — ${err.message}`);
  }
}

async function j(path) {
  const r = await fetch(BASE + path, { headers: { Accept: "application/json" } });
  const body = await r.text();
  let data = null;
  try { data = JSON.parse(body); } catch { /* non-JSON */ }
  if (!r.ok || (data && data.success === false)) {
    throw new Error(`HTTP ${r.status} ${body.slice(0, 120)}`);
  }
  return data;
}

async function rawStatus(url, opts = {}) {
  const r = await fetch(url, { headers: { "User-Agent": UA, ...(opts.headers || {}) }, redirect: "follow" });
  return r;
}

console.log(`\nAPIKuoshi live stream suite → ${BASE}\n`);

// ---------------------------------------------------------------- system
console.log("[system]");
let KEY = null;
await test("health", async () => {
  const d = await j("/api/health");
  if (!d.success) throw new Error("unhealthy");
  return `v${d.version}`;
}, { critical: true });

await test("docs.json catalog", async () => {
  const d = await j("/api/docs.json");
  if (!d.allEndpoints?.length) throw new Error("empty catalog");
  return `${d.allEndpoints.length} endpoints`;
});

await test("openapi.json", async () => {
  const d = await j("/api/openapi.json");
  if (!d.paths || !Object.keys(d.paths).length) throw new Error("no paths");
  return `${Object.keys(d.paths).length} paths`;
});

// ---------------------------------------------------------------- discovery
console.log("[discovery]");
await test("search q=frieren", async () => {
  const d = await j("/api/search?q=frieren");
  const hit = d.results.find((r) => r.anilistId === 154587);
  if (!hit) throw new Error("anilist:154587 not found");
  KEY = hit.key;
  return KEY;
}, { critical: true });

await test("anime info", async () => {
  const d = await j(`/api/anime?key=${encodeURIComponent(KEY)}`);
  if (!d.anime?.title) throw new Error("no anime title");
  return d.anime.title;
});

await test("episodes list", async () => {
  const d = await j(`/api/anime/episodes?key=${encodeURIComponent(KEY)}`);
  if (!d.episodes?.length) throw new Error("no episodes");
  return `${d.episodes.length} eps`;
});

// ---------------------------------------------------------------- servers + naming
console.log("[servers + naming]");
const SERVER_ROWS = [];
await test("anime/servers ep1 (sub+dub) with codenames", async () => {
  const d = await j(`/api/anime/servers?key=${encodeURIComponent(KEY)}&ep=1&type=all`);
  if (!d.servers?.length) throw new Error("no servers");
  for (const s of d.servers) {
    if (!s.name) throw new Error("server missing name");
    SERVER_ROWS.push(s);
  }
  const withOrig = d.servers.filter((s) => s.originalName);
  if (!withOrig.length) throw new Error("no originalName anywhere");
  const beta = d.servers.find((s) => s.beta);
  return `${d.servers.length} servers, ${withOrig.length} renamed${beta ? ", beta present" : ""}`;
}, { critical: true });

// ---------------------------------------------------------------- watch: every server, sub + dub
console.log("[watch — every server × sub/dub]");
const SUBTITLE_URLS = [];
const DIRECT_URLS = [];
const EMBED_URLS = [];
const PROXIED = [];

for (const type of ["sub", "dub"]) {
  await test(`watch ep1 type=${type}`, async () => {
    const d = await j(`/api/watch?key=${encodeURIComponent(KEY)}&ep=1&type=${type}`);
    const streams = d.streams || [];
    if (!streams.length) throw new Error("no streams");
    for (const s of streams) {
      if (!s.url) throw new Error(`${s.provider}: no url`);
      if (!s.proxiedUrl) throw new Error(`${s.provider}: no proxiedUrl`);
      if (!s.embedUrl) throw new Error(`${s.provider}: no embedUrl`);
      if (s.originalName === undefined) throw new Error(`${s.provider}: no originalName field`);
      DIRECT_URLS.push(s);
      EMBED_URLS.push(s.embedUrl);
      PROXIED.push(s.proxiedUrl);
      if ((s.subtitles || []).length) SUBTITLE_URLS.push(...s.subtitles.map((x) => x.url).filter(Boolean));
    }
    const names = streams.map((s) => `${s.provider}${s.originalName ? `(${s.originalName})` : ""}`).join(", ");
    return `${streams.length} streams: ${names}`;
  }, { critical: true });
}

// direct url playable (tokenized m3u8)
await test("direct url #EXTM3U check", async () => {
  const s = DIRECT_URLS[0];
  const r = await rawStatus(s.url, { headers: { Referer: "https://megaplay.buzz/" } });
  const body = await r.text();
  if (!body.includes("#EXTM3U")) throw new Error(`not an m3u8 (HTTP ${r.status}, ${body.slice(0, 60)})`);
  return `HTTP ${r.status}, ${(body.length / 1024).toFixed(1)}KB playlist`;
}, { critical: true });

// embed url reachable
await test("embedUrl (/videojs/) reachable", async () => {
  const r = await rawStatus(EMBED_URLS[0], { headers: { Referer: "https://anikototv.to/" } });
  const body = await r.text();
  if (r.status !== 200 || !/data-id="\d+"/.test(body)) throw new Error(`embed page not a player (HTTP ${r.status})`);
  return "player page with data-id";
}, { critical: true });

// ---------------------------------------------------------------- proxies
console.log("[proxies]");
let VARIANT_PATH = null;
await test("proxy/hls master playlist", async () => {
  const p = DIRECT_URLS[0].proxiedUrl;
  const r = await rawStatus(BASE + p);
  const body = await r.text();
  if (!body.includes("#EXTM3U")) throw new Error(`not an m3u8 (HTTP ${r.status})`);
  if (!body.includes("/api/proxy/")) throw new Error("playlist not rewritten to same-origin proxy");
  const lines = body.split("\n").map((l) => l.trim());
  const variant = lines.find((l) => l.startsWith("/api/proxy/hls"));
  if (!variant) throw new Error("no variant line");
  VARIANT_PATH = variant;
  return `HTTP ${r.status}, rewritten OK`;
}, { critical: true });

await test("proxy/hls variant playlist", async () => {
  if (!VARIANT_PATH) throw new Error("no variant from previous test");
  const r = await rawStatus(BASE + VARIANT_PATH);
  const body = await r.text();
  if (!body.includes("#EXTINF")) throw new Error("no segments in variant playlist");
  return `${(body.match(/EXTINF/g) || []).length} segments`;
}, { critical: true });

await test("proxy/video segment (MPEG-TS)", async () => {
  if (!VARIANT_PATH) throw new Error("no variant");
  const varBody = await (await rawStatus(BASE + VARIANT_PATH)).text();
  const seg = varBody.split("\n").map((l) => l.trim()).find((l) => l.startsWith("/api/proxy/video"));
  if (!seg) throw new Error("no segment line");
  const r = await rawStatus(BASE + seg);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 10000) throw new Error(`segment too small: ${buf.length}B`);
  return `${(buf.length / 1024).toFixed(0)}KB`;
}, { critical: true });

await test("proxy/subtitle", async () => {
  if (!SUBTITLE_URLS.length) return "no subtitle tracks this episode (skipped)"; // not fatal
  const r = await rawStatus(BASE + `/api/proxy/subtitle?url=${encodeURIComponent(SUBTITLE_URLS[0])}`);
  const body = await r.text();
  if (!body.trim()) throw new Error("empty subtitle");
  return `${(body.length / 1024).toFixed(1)}KB`;
});

// ---------------------------------------------------------------- chain
console.log("[chain]");
await test("chain q=frieren ep1 all=1 probe", async () => {
  const d = await j(`/api/chain?key=${encodeURIComponent(KEY)}&ep=1&all=1`);
  if (d.verdict !== "playable") throw new Error(`verdict=${d.verdict}`);
  const stepsOk = d.steps.every((s) => s.ok);
  if (!stepsOk) throw new Error("a hop failed: " + d.steps.filter((s) => !s.ok).map((s) => s.step).join(","));
  const playable = d.streams.filter((s) => s.probe?.playable);
  if (!playable.length) throw new Error("no playable streams");
  if (!d.best?.proxiedUrl) throw new Error("no best stream");
  return `${playable.length}/${d.streams.length} playable, best=${d.best.provider}`;
}, { critical: true, timeout: 180000 });

await test("chain probe=0 (unverified, fast)", async () => {
  const d = await j(`/api/chain?key=${encodeURIComponent(KEY)}&ep=2&probe=0`);
  if (!["unverified", "playable"].includes(d.verdict)) throw new Error(`verdict=${d.verdict}`);
  return `${d.streams.length} streams, verdict=${d.verdict}`;
});

// ---------------------------------------------------------------- download
console.log("[download]");
await test("download links", async () => {
  const d = await j(`/api/download?key=${encodeURIComponent(KEY)}&ep=1`);
  return `${(d.downloads || []).length} downloads`;
});

// ---------------------------------------------------------------- report
const critical = results.filter((r) => r.critical);
const criticalOk = critical.filter((r) => r.ok);
const allOk = results.filter((r) => r.ok);
const totalMs = results.reduce((a, r) => a + r.ms, 0);

console.log("\n" + "═".repeat(64));
console.log(`RESULT: ${criticalOk.length}/${critical.length} critical passed · ${allOk.length}/${results.length} total · ${(totalMs / 1000).toFixed(1)}s`);
if (criticalOk.length !== critical.length) {
  console.log("FAILED CRITICAL:");
  critical.filter((r) => !r.ok).forEach((r) => console.log(`  ✗ ${r.name}: ${r.info}`));
  process.exit(1);
}
console.log("Critical suite PASSED");
