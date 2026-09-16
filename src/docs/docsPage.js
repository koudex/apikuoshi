/**
 * ============================================================
 *  APIKuoshi — src/docs/docsPage.js                    v2.1.0
 * ============================================================
 *  Generates the redesigned /api/docs: a professional
 *  API-reference UI — fixed sidebar with grouped endpoint
 *  navigation + search, compact reference cards with param
 *  tables, and a docked playground (Send → highlighted JSON).
 *  Everything (CSS, JS, catalog data) is inlined — zero
 *  external dependencies, works offline.
 *
 *  renderDocsPage(version) -> full HTML string (cached by caller)
 * ============================================================
 */
import { PAGE_CSS } from "./page.css.js";
import { PAGE_CLIENT } from "./page.client.js";
import {
  STREAM_FIELDS, SERVER_NAMING,
  buildCatalog, endpointCount,
} from "./catalog.js";

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ------------------------------------------------------------------ */
/* Streams field reference (rendered from catalog data)                */
/* ------------------------------------------------------------------ */

function streamsSection() {
  const fieldRows = (STREAM_FIELDS || [])
    .map((f) => `<tr><td><code>${esc(f.n)}</code></td><td>${esc(f.d)}</td></tr>`)
    .join("");

  const namingRows = Object.entries(SERVER_NAMING || {})
    .map(([raw, code]) => `<tr><td>${esc(raw)}</td><td><b>${esc(code)}</b></td></tr>`)
    .join("");

  return `
  <section id="streams">
      <div class="sec-head">
        <span class="step">Playback</span>
        <h2>How streams work (2026 pipeline)</h2>
        <p>Upstream episode links point at raw embed pages that answer 410 to direct
           playback. APIKuoshi auto-migrates every link to the working <code>/videojs/</code>
           player, pulls the encrypted sources blob from the player's own API, decrypts it,
           and attaches a fresh 90-second CDN token — so <code>url</code> is always a
           tokenized, directly playable stream.</p>
      </div>
      <div class="grid2">
        <div class="card">
          <h3 style="font-size:15px;margin:0 0 4px">Resolution chain</h3>
          <table class="kt">
            <tr><td>1 · embed</td><td>server link → raw player URL, auto-upgraded to <b>/videojs/</b> form</td></tr>
            <tr><td>2 · data-id</td><td>player page parsed for the file id</td></tr>
            <tr><td>3 · getSources</td><td>subtitles, intro/outro skip ranges and the AES-encrypted sources blob</td></tr>
            <tr><td>4 · decrypt</td><td>blob decrypted → master m3u8 / mp4 URL</td></tr>
            <tr><td>5 · token</td><td>token-gated CDNs get a fresh <code>?token=</code> (90 s TTL, re-minted by the proxies on every hop)</td></tr>
            <tr><td>6 · probe</td><td>chain only: URL verified against the real CDN (#EXTM3U validation, latency, referer)</td></tr>
          </table>
          <div class="note good"><b>Three playable forms per stream:</b> <code>url</code> (direct, tokenized),
            <code>embedUrl</code> (iframe-able player page), <code>proxiedUrl</code> (same-origin CORS proxy —
            paste into hls.js or &lt;video&gt; and it just plays).</div>
        </div>
        <div class="card">
          <h3 style="font-size:15px;margin:0 0 4px">Stream fields</h3>
          <table class="kt">
            <tr><th style="width:130px">field</th><th>what it carries</th></tr>
            ${fieldRows}
          </table>
        </div>
      </div>
      <div class="card" style="margin-top:14px">
        <h3 style="font-size:15px;margin:0 0 4px">Server naming</h3>
        <p style="color:var(--muted);font-size:13px;margin:2px 0 6px">Upstream labels are mapped to friendly
          codenames; the raw label is always preserved in <code>originalName</code>. The map is one editable
          table in <code>src/sources/kaze/helper/cdn.helper.js</code> (<code>SERVER_CODENAMES</code>).</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:4px 18px">
          <table class="kt">${namingRows}</table>
        </div>
      </div>
  </section>`;
}

/* ------------------------------------------------------------------ */

export function renderDocsPage(version) {
  const catalog = buildCatalog(version);
  const catalogJson = JSON.stringify(catalog).replace(/</g, "\\u003c");
  const streamJson = JSON.stringify({ STREAM_FIELDS, SERVER_NAMING }).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>APIKuoshi — API Reference & Playground</title>
<meta name="description" content="APIKuoshi: one anime REST API — search, browse, metadata and playback through a single normalized surface. Interactive API reference with live playground."/>
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="layout">

  <aside class="sidebar">
    <div class="sb-brand">
      <span class="sb-logo">旗</span>
      <span class="sb-name">API<em>Kuoshi</em></span>
      <span class="sb-ver">v${esc(version)}</span>
    </div>
    <div class="sb-search">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input id="sb-search" type="search" placeholder="Search ${endpointCount()} endpoints…" />
    </div>
    <nav class="sb-nav" id="sb-nav"></nav>
    <div class="sb-foot">
      <div class="sb-status"><span class="dot" id="status-dot"></span><span id="status-lbl">checking…</span></div>
      <div style="margin-top:6px"><a href="/api/docs.json">docs.json</a> · <a href="/api/openapi.json">openapi</a> · <a href="/api/health">health</a></div>
    </div>
  </aside>

  <div class="main">
    <header class="topbar">
      <span class="sb-name">API<em>Kuoshi</em></span>
      <span class="tb-status"><span class="dot" id="status-dot"></span><span id="status-lbl">checking…</span></span>
    </header>

    <div class="content">
      <div class="hero">
        <span class="kicker">🎌 v${esc(version)} · ${endpointCount()} endpoints · one coherent surface</span>
        <h1>API Reference &<br/><em>Playground</em></h1>
        <p class="sub">One anime REST API — search, browse, metadata and playback through a single
           normalized surface. Every anime is one canonical resource; every stream is resolved,
           tokenized and optionally probed against the real CDN. Fire live requests below —
           everything you see is what your app receives.</p>
        <div class="quickstart">
          <button class="qs" data-path="/api/search?q=frieren"><span class="lbl">search</span>/api/search?q=frieren</button>
          <button class="qs" data-path="/api/watch?key=anilist:154587&ep=1"><span class="lbl">watch</span>/api/watch?key=anilist:154587&ep=1</button>
          <button class="qs" data-path="/api/chain?q=frieren&ep=1"><span class="lbl">chain</span>/api/chain?q=frieren&ep=1</button>
        </div>
        <div class="chiprow">
          <span class="chip"><b>0</b> required API keys</span>
          <span class="chip">auto <b>failover</b> lanes</span>
          <span class="chip">canonical <b>keys</b></span>
          <span class="chip">/videojs/ <b>stream pipeline</b></span>
          <span class="chip">CORS playback <b>proxies</b></span>
          <span class="chip">MIT</span>
        </div>
      </div>

      ${streamsSection()}

      <section id="reference">
        <div class="sec-head" style="padding-top:44px">
          <span class="step">Reference</span>
          <h2>Endpoints (${endpointCount()})</h2>
          <p>Generated by the API itself from the same catalog that powers
             <code>/api/docs.json</code> — the docs can never drift from the code.
             Click a row to expand parameters; press <b>▶ Try</b> to run it in the playground.</p>
        </div>
        <div id="ref-host"></div>
      </section>

      <section id="playground">
        <div class="sec-head" style="padding-top:44px">
          <span class="step">Playground</span>
          <h2>Live requests, right here</h2>
          <p>Same-origin fetches against this very deployment. Responses are shown exactly as delivered.</p>
        </div>
        <div class="playground" id="pg">
          <div class="pg-urlrow">
            <div class="pg-url"><span class="verb">GET</span><input id="pg-url" spellcheck="false" value="/api/search?q=frieren" /></div>
            <button class="send" id="pg-send">Send</button>
          </div>
          <div class="pg-meta" id="pg-meta"></div>
          <div class="resp-wrap"><pre class="resp" id="resp">Press Send — live JSON renders here with syntax highlighting.</pre></div>
          <div class="pg-tools">
            <button class="tool" id="pg-copy-json">Copy JSON</button>
            <button class="tool" id="pg-copy-curl">Copy as cURL</button>
            <span style="flex:1"></span>
            <span style="font-size:11.5px;color:var(--dim);align-self:center">Ctrl/⌘ + Enter sends</span>
          </div>
          <div class="pg-hist" id="pg-hist"></div>
        </div>
      </section>
    </div>

    <footer>
      <span>APIKuoshi v${esc(version)} — generated ${new Date().toISOString()}</span>
      <span>·</span>
      <span>For educational purposes — APIKuoshi hosts no content.</span>
      <span>·</span><a href="/api/health">health</a><a href="/api/docs.json">docs.json</a><a href="/api/openapi.json">openapi</a>
    </footer>
  </div>
</div>

<div class="toast" id="toast"></div>
<script>window.__KUOSHI__ = { catalog: ${catalogJson}, ...${streamJson} };</script>
<script>${PAGE_CLIENT}</script>
</body>
</html>`;
}
