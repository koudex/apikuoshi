/**
 * ============================================================
 *  APIKuoshi — src/docs/docsPage.js
 * ============================================================
 *  Generates the interactive documentation + playground page.
 *  Everything (CSS, JS, catalog data) is inlined — zero external
 *  dependencies, works offline, ships inside the project zip.
 *
 *  renderDocsPage(version) -> full HTML string (cached by caller)
 * ============================================================
 */
import { PAGE_CSS } from "./page.css.js";
import { PAGE_CLIENT } from "./page.client.js";
import {
  PIPELINE, UNIFIED_ENDPOINTS, SYSTEM_ENDPOINTS, ENV_VARS,
  buildCatalog, endpointCount,
} from "./catalog.js";

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ------------------------------------------------------------------ */
/* Section builders                                                    */
/* ------------------------------------------------------------------ */

function pipelineSection() {
  const stages = [
    { cls: "amber", tag: "Stage 1 · Request", items: [
      ["search term", "q=frieren — any spelling works"],
      ["anime key", "anilist:154587 · mal:52991 · 154587 · a plain title"],
      ["listing slug", "a catalogue slug, when you have one"],
    ]},
    { cls: "green", tag: "Stage 2 · Resolve", items: [
      ["identity", "every input maps to one canonical anime resource"],
      ["matcher", "romaji / English / synonyms compared by signature + similarity"],
      ["guards", "type and season must match before anything is merged"],
    ]},
    { cls: "violet", tag: "Stage 3 · Fetch", items: [
      ["internal data lanes", "live fetchers run in priority order"],
      ["automatic failover", "a slow or empty lane is skipped silently"],
      ["mirror rotation", "catalogue fetchers rotate mirrors when needed"],
    ]},
    { cls: "", tag: "Stage 4 · Normalize", items: [
      ["one schema", "title, poster, year, type, episodes, status — always the same fields"],
      ["dedup", "the same anime listed twice becomes one entry"],
      ["streams labeled", "direct (m3u8/mp4) vs embed (player page)"],
    ]},
    { cls: "", tag: "Stage 5 · Serve", items: [
      ["cache + rate limit", "TTL cache, 240 req/min default"],
      ["CORS playback proxies", "/api/proxy/hls · /api/proxy/video · /api/proxy/subtitle"],
      ["one JSON shape", "the same fields, every time, from every endpoint"],
    ]},
  ];
  const stagesHtml = stages
    .map(
      (s) => `
    <div class="pipe-stage ${s.cls}"><span class="tag">${esc(s.tag)}</span>
      <div class="pipe-items">${s.items
        .map(([a, b]) => `<div class="pipe-item"><b>${esc(a)}</b><small>${esc(b)}</small></div>`)
        .join("")}</div>
    </div>`
    )
    .join('<div class="pipe-arrow">▼ &nbsp;<b>transform</b> ▼</div>');

  const steps = (PIPELINE.steps || []).map((s) => [`${s.n} · ${s.title}`, s.text]);
  const stepsHtml = steps
    .map(([h, p]) => `<div class="step-card"><h4>${esc(h)}</h4><p>${esc(p)}</p></div>`)
    .join("");

  return `
  <section id="how">
    <div class="wrap">
      <div class="sec-head">
        <span class="step">The pipeline</span>
        <h2>From a live request to your JSON</h2>
        <p>APIKuoshi fetches anime data live from public web sources, normalizes it into one
           schema and serves it through one coherent REST surface. Here is the full journey.</p>
      </div>
      <div class="pipe">${stagesHtml}</div>
      <div class="steps">${stepsHtml}</div>
    </div>
  </section>`;
}

function identitySection(version) {
  return `
  <section id="unified">
    <div class="wrap">
      <div class="sec-head">
        <span class="step">One identity, one shape</span>
        <h2>Canonical keys + automatic dedup</h2>
        <p>Two mechanisms keep the API feeling like a single source of truth.</p>
      </div>
      <div class="uni-grid">
        <div class="card">
          <h3 style="font-size:16px;margin-bottom:6px">1 · Canonical keys</h3>
          <p style="color:var(--muted);font-size:13.5px">Every anime has exactly one identity. Any endpoint accepts
             any of these formats for <code>?key=</code> and resolves them to the same resource:</p>
          <table class="ktable">
            <tr><td>anilist:154587</td><td>canonical AniList id — the strongest key</td></tr>
            <tr><td>mal:52991</td><td>MyAnimeList id, mapped internally</td></tr>
            <tr><td>154587</td><td>a bare AniList id</td></tr>
            <tr><td>frieren</td><td>a plain title — resolved automatically</td></tr>
          </table>
          <p style="color:var(--muted);font-size:13.5px;margin-top:10px">Responses never expose internal plumbing:
             no source lists, no provider names, no attempt logs. You ask for anime, you get anime.</p>
        </div>
        <div class="card">
          <h3 style="font-size:16px;margin-bottom:6px">2 · Title dedup (romaji vs English)</h3>
          <p style="color:var(--muted);font-size:13.5px">The same show is often listed under several names.
             Every result is anchored to a canonical entry, and its titles are compared with:</p>
          <table class="ktable">
            <tr><td>normalize</td><td>lowercase, strip punctuation, brackets, "TV/Sub/Dub" tags, expand season words (S2 / II / 2nd → one form)</td></tr>
            <tr><td>signature</td><td>sorted significant tokens — "Sousou no Frieren 2nd Season" and "Frieren: Beyond Journey's End Season 2" land close together</td></tr>
            <tr><td>similarity</td><td>max(Dice, Jaccard) across romaji / English / alt-title pairs</td></tr>
            <tr><td>guards</td><td>type must match (TV ≠ Movie) and season must match (S1 ≠ S2) before merging</td></tr>
            <tr><td>threshold</td><td>score ≥ <code>DEDUP_THRESHOLD</code> (78, tunable in .env) → merge</td></tr>
          </table>
          <div class="example" style="margin-top:14px">
            <span class="big">9</span> raw results for <code>q=frieren</code>
            <span class="arrow">→</span>
            <span class="big">6</span> unique anime
            <span class="arrow">→</span> <b>duplicates merged automatically</b>
            <p style="margin-top:8px">Meanwhile the unrelated mini-anime <i>"Sousou no Frieren: ●● no Mahou"</i>
               correctly stays separate — the season/type guards refuse to merge it.</p>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

function chainSection(version) {
  const hops = [
    ["1 · resolve", "q= | key= | slug= in → canonical identity + playable listing"],
    ["2 · info", "listing info merged with canonical metadata"],
    ["3 · episodes", "one episode list, resolved across internal channels"],
    ["4 · servers", "the episode's server list for playback"],
    ["5 · streams", "each server resolved to a real m3u8/mp4 URL"],
    ["6 · probe", "every URL tested against the CDN: HTTP status, latency, content-type, referer check, #EXTM3U validation"],
  ];
  return `
  <section id="chain">
    <div class="wrap">
      <div class="sec-head">
        <span class="step">Flagship</span>
        <h2>/api/chain — one call, the whole streaming journey</h2>
        <p>Instead of chaining /api/search → /api/anime → /api/anime/episodes → /api/anime/servers →
           /api/watch yourself, <code>/api/chain</code> runs the entire pipeline as nested functions inside
           one request — and because it doubles as a <b style="color:var(--text)">chain tester</b>, every hop
           is timed, recorded and reported.</p>
      </div>
      <div class="uni-grid">
        <div class="card">
          <h3 style="font-size:16px;margin-bottom:10px">The 6 nested hops</h3>
          <table class="ktable">
            ${hops.map(([a, b]) => `<tr><td style="white-space:nowrap"><b>${esc(a)}</b></td><td>${esc(b)}</td></tr>`).join("")}
          </table>
          <div class="note good" style="margin-top:12px"><b>Input freedom:</b> ?q=dandadan OR ?key=anilist:154587 OR ?id=154587 OR ?slug=one-piece-odmau — the resolve hop figures out the rest.</div>
        </div>
        <div class="card">
          <h3 style="font-size:16px;margin-bottom:6px">What you get back</h3>
          <p style="color:var(--muted);font-size:13.5px">One JSON with the whole journey:</p>
          <table class="ktable">
            <tr><td>steps[]</td><td>every hop with ok / ms / detail — the chain's flight recorder</td></tr>
            <tr><td>anime + episode</td><td>resolved identity, episode meta</td></tr>
            <tr><td>servers[]</td><td>every server for the episode</td></tr>
            <tr><td>streams[]</td><td>every URL with its probe result (httpStatus, latencyMs, refererRequired)</td></tr>
            <tr><td>best</td><td>the winning playable stream — proxiedUrl is CORS-ready for hls.js / &lt;video&gt;</td></tr>
            <tr><td>verdict</td><td>playable | unverified | no-playable-streams | embed-only | no-streams</td></tr>
          </table>
          <div class="example" style="margin-top:14px">
            <code>GET /api/chain?q=frieren&ep=1</code>
            <p style="margin-top:8px">→ 6 steps, ~2–4s total, playable stream with latency + referer requirement reported. Add <code>&probe=0</code> to skip CDN testing, <code>&all=1</code> to harvest every available stream.</p>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

function endpointsSection() {
  const catalog = buildCatalog("");
  const fams = catalog.families;

  const renderEp = (e) => {
    const params = (e.params || [])
      .map((p) => `<tr><td>${esc(p.n)}</td><td>${esc(p.d)}</td><td>${esc(p.ex || "—")}</td></tr>`)
      .join("");
    return `
      <div class="ep">
        <div class="row1">
          <span class="method">${esc(e.m)}</span>
          <span class="path">${esc(e.p)}</span>
          ${e.try ? `<button class="try" data-try="${esc(e.try)}">▶ Try it</button>` : ""}
        </div>
        <div class="desc">${esc(e.d)}</div>
        ${params ? `<table class="ptable"><tr><td>param</td><td>what it does</td><td>example</td></tr>${params}</table>` : ""}
        ${e.tip ? `<div class="tip">💡 ${esc(e.tip)}</div>` : ""}
      </div>`;
  };

  const groupsHtml = fams
    .map((f, i) => {
      const list = catalog.endpoints[f.key] || [];
      if (!list.length) return "";
      return `
      <details class="group" ${i === 0 ? "open" : ""}>
        <summary><span class="gdot" style="--gc:${f.gc}"></span>${esc(f.label)}
          <span class="count">${list.length} endpoints</span><span class="chev">▶</span></summary>
        <p style="padding:10px 18px;color:var(--dim);font-size:12.5px;border-top:1px solid var(--line)">${esc(f.note)}</p>
        ${list.map(renderEp).join("")}
      </details>`;
    })
    .join("") +
    (() => {
      const list = SYSTEM_ENDPOINTS;
      const f = fams.find((x) => x.key === "system");
      return `
      <details class="group">
        <summary><span class="gdot" style="--gc:${f.gc}"></span>${esc(f.label)}
          <span class="count">${list.length} endpoints</span><span class="chev">▶</span></summary>
        <p style="padding:10px 18px;color:var(--dim);font-size:12.5px;border-top:1px solid var(--line)">${esc(f.note)}</p>
        ${list.map(renderEp).join("")}
      </details>`;
    })();

  return `
  <section id="endpoints">
    <div class="wrap">
      <div class="sec-head">
        <span class="step">Reference</span>
        <h2>Every endpoint (${endpointCount()}), generated from the live catalog</h2>
        <p>This page is rendered by the API itself from the same catalog that powers
           <code>/api/docs.json</code> — the docs can never drift from the code. Press
           <b style="color:var(--text)">▶ Try it</b> on any endpoint to run it in the playground below.</p>
      </div>
      ${groupsHtml}
    </div>
  </section>`;
}

function playgroundSection() {
  return `
  <section id="playground">
    <div class="wrap">
      <div class="sec-head">
        <span class="step">Playground</span>
        <h2>Run live requests against this very API</h2>
        <p>Same-origin requests, real responses. Everything you see here is what your app will receive.</p>
      </div>
      <div class="playground" id="pg">
        <div class="pg-top">
          <span class="pg-tab" id="tab-picker" data-pane="pane-picker">📋 Endpoints</span>
          <span class="pg-tab active" id="tab-send" data-pane="pane-send">⚡ Request</span>
        </div>
        <div class="pg-body" id="pane-picker">
          <input class="pg-search" id="ep-search" type="search" placeholder="Filter ${endpointCount()} endpoints… (e.g. search, trending, watch)" />
          <div class="pg-list" id="ep-list"></div>
        </div>
        <div class="pg-body active" id="pane-send">
          <div class="pg-url">
            <input id="url-input" spellcheck="false" placeholder="/api/search?q=frieren" />
            <button class="send" id="send-btn">Send</button>
          </div>
          <div class="pg-params" id="pg-params"></div>
          <div class="pg-hint">Ctrl/⌘ + Enter sends · responses are fetched with Accept: application/json</div>
          <div style="margin-top:16px" class="resp-meta" id="resp-meta"></div>
          <pre class="resp" id="resp-box">Press Send to see live JSON here.</pre>
          <div class="history" id="history"></div>
        </div>
      </div>
    </div>
  </section>`;
}

function configSection() {
  const rows = ENV_VARS.map(
    (v) => `<tr><td>${esc(v.n)}</td><td>${esc(v.def)}</td><td>${esc(v.d)}</td></tr>`
  ).join("");
  return `
  <section id="config">
    <div class="wrap">
      <div class="sec-head">
        <span class="step">Configuration</span>
        <h2>One .env file — everything optional except the port</h2>
        <p>APIKuoshi works with an empty .env: no ScraperAPI, no FlareSolverr, no keys. If you ever
           add them, the internal fetchers pick them up automatically.</p>
      </div>
      <div class="card table-scroll">
        <table class="env-table">
          <tr><td>variable</td><td>default</td><td>what it does</td></tr>
          ${rows}
        </table>
      </div>
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ */

export function renderDocsPage(version) {
  const catalog = buildCatalog(version);
  const catalogJson = JSON.stringify(catalog).replace(/</g, "\\u003c");
  const nav = [
    ["#how", "How it works"], ["#unified", "Identity & dedup"],
    ["#chain", "Chain"], ["#endpoints", "Endpoints"], ["#playground", "Playground"], ["#config", "Config"],
  ]
    .map(([h, l]) => `<a href="${h}">${l}</a>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>APIKuoshi — Interactive API Docs & Playground</title>
<meta name="description" content="APIKuoshi: one anime REST API — search, browse, metadata and playback through a single normalized surface, with the one-call /api/chain streaming pipeline. Interactive docs + playground."/>
<style>${PAGE_CSS}</style>
</head>
<body>
<header class="topbar"><div class="wrap topbar-in">
  <a class="logo" href="/api/docs"><span class="mark">旗</span>API<em>Kuoshi</em></a>
  <nav class="nav">${nav}</nav>
  <span class="status"><span class="dot" id="status-dot"></span><span class="lbl" id="status-lbl">checking…</span></span>
</div></header>

<div class="wrap hero">
  <span class="kicker">🎌 1 API · ${endpointCount()} endpoints · 1 nested streaming chain · 0 required paid services</span>
  <h1>The anime API that<br/><em>just works</em> — search, browse, stream.</h1>
  <p class="sub">APIKuoshi v${esc(version)} is one RESTful API for anime: one endpoint set, one response
     schema, one canonical identity per anime. Data is fetched live, normalized and deduplicated
     automatically — with the one-call <code>/api/chain</code> streaming pipeline as the flagship.</p>
  <div class="chips">
    <span class="chip"><b>v${esc(version)}</b></span>
    <span class="chip"><b>${endpointCount()}</b> endpoints</span>
    <span class="chip"><b>0</b> required API keys</span>
    <span class="chip">auto <b>failover</b></span>
    <span class="chip">romaji/English <b>dedup</b></span>
    <span class="chip">/api/<b>chain</b> tester</span>
    <span class="chip">CORS playback <b>proxies</b></span>
    <span class="chip">MIT</span>
  </div>
  <div class="btnrow">
    <a class="btn primary" href="#playground">⚡ Open the playground</a>
    <a class="btn ghost" href="/api/docs.json">Get machine-readable docs</a>
    <a class="btn ghost" href="/api/search?q=frieren">Raw example response</a>
  </div>
</div>

${pipelineSection()}
${identitySection(version)}
${chainSection(version)}
${endpointsSection()}
${playgroundSection()}
${configSection()}

<footer><div class="wrap frow">
  <span>APIKuoshi v${esc(version)} — generated ${new Date().toISOString()}</span>
  <span>·</span>
  <span>For educational purposes — APIKuoshi hosts no content.</span>
  <span>·</span><a href="/api/health">health</a><a href="/api/docs.json">docs.json</a><a href="/api/openapi.json">openapi</a>
</div></footer>

<div class="toast" id="toast"></div>
<script>window.__KUOSHI__ = { catalog: ${catalogJson} };</script>
<script>${PAGE_CLIENT}</script>
</body>
</html>`;
}
