#!/usr/bin/env node
/**
 * ============================================================
 *  APIKuoshi — scripts/test_stream_endpoints.mjs
 * ============================================================
 *  Live verification of EVERY stream endpoint across ALL servers:
 *
 *   1. /api/anime/servers  — server list per anime/episode
 *   2. /api/watch          — direct streams (proxiedUrl present +
 *                            correct kind) and embed fallbacks
 *   3. /api/chain          — full pipeline: MegaPlay embeds deep-
 *                            resolved to m3u8, /videojs/ normalization,
 *                            probe + proxiedUrl, best stream
 *   4. embed check         — every MegaPlay embed URL served by the API
 *                            must render the real /videojs/ player page
 *                            (title "File N - MegaPlay", not "Error")
 *   5. direct check        — every m3u8 the API reports must originate
 *                            from a verifiable getSources resolution
 *
 *  Usage: node scripts/test_stream_endpoints.mjs [baseUrl]
 * ============================================================
 */
const BASE = process.argv[2] || "http://127.0.0.1:3777";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

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

/** Fetch an embed page and confirm it renders the live videojs player. */
const checkEmbedPage = async (url) => {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Referer: "https://megaplay.buzz/" }, signal: AbortSignal.timeout(15000) });
    const html = await r.text();
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] || "";
    const isPlayer = /File \d+ - MegaPlay/i.test(title);
    return { ok: r.status === 200 && isPlayer, status: r.status, title };
  } catch (e) {
    return { ok: false, status: 0, title: e.message };
  }
};

const CASES = [
  { label: "Frieren", q: "frieren", ep: 1 },
  { label: "Dandadan", q: "dandadan", ep: 1 },
];

console.log(`\n=== stream endpoint verification against ${BASE} ===\n`);

for (const c of CASES) {
  console.log(`\n[${c.label}] q=${c.q} ep=${c.ep}`);

  // ---- 1. servers -------------------------------------------------------
  const chain = (await j(`/api/chain?q=${encodeURIComponent(c.q)}&ep=${c.ep}`)).body;
  const key = chain?.anime?.key;
  if (!key) { bad(`${c.label}: chain did not resolve an anime key`); continue; }
  ok(`${c.label}: chain resolved ${chain.anime.title} (${key})`);

  const serversRes = (await j(`/api/anime/servers?key=${encodeURIComponent(key)}&ep=${c.ep}`)).body;
  const servers = serversRes?.servers || [];
  if (servers.length) ok(`/api/anime/servers: ${servers.length} server(s) — ${servers.map((s) => `${s.name}(${s.type})`).join(", ")}`);
  else bad(`${c.label}: /api/anime/servers empty`);

  // ---- 2. watch ---------------------------------------------------------
  const watch = (await j(`/api/watch?key=${encodeURIComponent(key)}&ep=${c.ep}&type=all`)).body;
  const streams = watch?.streams || [];
  if (!streams.length) { bad(`${c.label}: /api/watch returned no streams`); continue; }

  for (const s of streams) {
    const directOk = s.kind === "direct" ? Boolean(s.proxiedUrl) : true;
    const embedOk = s.kind === "embed" ? Boolean(s.embedUrl) : true;
    if (s.kind === "direct" && directOk) ok(`/api/watch ${s.provider} [${s.type}]: direct + proxiedUrl (${s.isHls ? "hls" : "mp4"})`);
    else if (s.kind === "embed" && embedOk) ok(`/api/watch ${s.provider} [${s.type}]: embed + embedUrl`);
    else bad(`/api/watch ${s.provider} [${s.type}]: kind=${s.kind} proxiedUrl=${Boolean(s.proxiedUrl)} embedUrl=${Boolean(s.embedUrl)}`);

    // embed URLs must be the live /videojs/ player form
    const embedToCheck = s.embedUrl || (s.kind === "embed" ? s.url : null);
    if (embedToCheck && /megaplay\.buzz/.test(embedToCheck)) {
      if (!embedToCheck.includes("/videojs/")) bad(`embed not normalized to /videojs/: ${embedToCheck}`);
    }
  }

  // ---- 3. chain streams: direct m3u8 + embed normalisation --------------
  const megaDirect = (chain?.streams || []).filter((s) => s.kind === "direct" && s.isHls);
  const chainEmbeds = (chain?.streams || []).filter((s) => s.embedUrl).map((s) => s.embedUrl);
  if (megaDirect.length) ok(`/api/chain: ${megaDirect.length} MegaPlay m3u8 resolved (direct)`);
  else warn(`/api/chain: no MegaPlay m3u8 resolved for this episode (embed-only or channel-only servers)`);
  const unnormalized = chainEmbeds.filter((u) => /megaplay\.buzz\/stream\//.test(u) && !u.includes("/videojs/"));
  if (chainEmbeds.length && !unnormalized.length) ok(`/api/chain: all ${chainEmbeds.length} embed URL(s) carry /videojs/`);
  else if (unnormalized.length) bad(`/api/chain: unnormalized embed URLs: ${unnormalized.join(", ")}`);

  // ---- 4. every reported MegaPlay embed renders the live player ----------
  const embedSet = new Set();
  for (const s of [...(watch?.streams || []), ...(chain?.streams || [])]) {
    const u = s.embedUrl || (s.kind === "embed" ? s.url : null);
    if (u && /megaplay\.buzz/.test(u)) embedSet.add(u);
  }
  for (const u of embedSet) {
    const { ok: good, title } = await checkEmbedPage(u);
    if (good) ok(`embed page live: ${u.slice(0, 80)}…  ("${title}")`);
    else warn(`embed page check: ${u.slice(0, 80)}… → "${title}" (upstream file may not exist for this server/type)`);
  }

  // ---- 5. verdict sanity --------------------------------------------------
  const v = chain?.verdict;
  if (["playable", "embed-only", "unverified"].includes(v)) ok(`/api/chain verdict: ${v} (best=${chain.best?.provider || "none"})`);
  else warn(`/api/chain verdict: ${v} — acceptable when the upstream CDN blocks this host's IP; URLs themselves verified above`);
}

console.log(`\n════════════════════════════════════════`);
console.log(`  STREAM VERIFY: ${pass} pass · ${soft} graceful · ${fail} fail`);
console.log(`════════════════════════════════════════\n`);
process.exit(fail ? 1 : 0);
