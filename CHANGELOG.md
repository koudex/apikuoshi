# Changelog

All notable changes to APIKuoshi are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/); versioning: [SemVer](https://semver.org/).

---

## [2.1.0] — 2026-09-16 · the /videojs/ stream refresh

Upstream changed how episode streams are served: the old `ajax/sources` hop
(`megaplay-1.buzz`) no longer resolves and raw `/stream/...` embed pages answer
**410 / an error page** to direct playback. This release rebuilds the whole
playback pipeline around the site's **current** `/videojs/` player and its
`getSources` API — reverse-engineered from the player itself and verified live.

### Fixed
- **Streams 410/403 → playable.** Every stream now resolves through the working
  pipeline: raw embed → `/videojs/` player → `getSources` → decrypted m3u8/mp4 →
  90-second CDN token. Verified end-to-end against the real CDN (playlist →
  variant → MPEG-TS segment).
- **`Referer` figured out for HLS/m3u8.** Token-gated CDNs (`nexabloom.top`,
  `qeltrix.top` family) reject requests without the player referer
  (`https://megaplay.buzz/`) **and** a valid `?token=`. Both are now applied
  automatically everywhere: resolver, chain probe, and all three proxies.

### Added
- **AES sources decryption** (`src/sources/kaze/helper/cdn.helper.js`):
  `getSources` answers an `enc` blob — base64url AES-256-CBC — that decrypts to
  `{"file": "<master.m3u8>"}`. Keys/IV/secret are the site's own player constants
  and are overridable via env (`MEGAPLAY_SOURCE_ENC_KEY`, `MEGAPLAY_SOURCE_ENC_IV`,
  `MEGAPLAY_CDN_TOKEN_SECRET`, `MEGAPLAY_CDN_TOKEN_TTL`) in case the site rotates them.
- **90 s HMAC CDN tokens**, re-minted automatically:
  - by the resolver when a stream is first resolved,
  - by `/api/chain`'s probe before every CDN test,
  - by `/api/proxy/hls` + `/api/proxy/video` **on every hop**, so long playback
    never dies on token expiry mid-video.
- **Friendly server codenames.** Upstream labels are mapped to codenames and
  both stay exposed everywhere servers appear:
  `Vidstream-2 → riyo`, `Vidstream-1 → kaito (beta)`, `HD-1 → hana`,
  `HD-2 → sora`, `VidCloud-1 → akira`, `VidCloud-2 → yuki`,
  `VidPlay-1 → miso`, `VidPlay-2 → kenji`, `StreamTape-1 → arashi`,
  `StreamTape-2 → taiki`; ishi channels `Stream-A/B/C → shiro/kuro/cha`.
  Unknown labels fall back to a stable alias (`srv-<hash>`).
  - One editable table: `SERVER_CODENAMES` in `src/sources/kaze/helper/cdn.helper.js`.
  - New fields in `/api/anime/servers`, `/api/watch`, `/api/chain`:
    `originalName` (raw upstream label) and `beta: true` for the site's pretest server.
- **Richer stream objects** (`/api/watch`, `/api/chain`):
  - `qualities[]` — per-variant URLs parsed from the master playlist (tokenized per variant)
  - `subtitles[]` — subtitle tracks from `getSources` (label / language / url / format / default)
  - `skipIntro` — intro/outro skip ranges (`{intro:{start,end}, outro:{start,end}}`),
    merged from both the AJAX payload and `getSources`
  - `embedUrl` — the `/videojs/` player page (iframe-able fallback) on every stream
- **Three playable URL forms per stream**: `url` (direct, tokenized) ·
  `embedUrl` (iframe) · `proxiedUrl` (same-origin CORS proxy).
- **Proxy allowlist** extended with the new stream CDNs (`nexabloom.top`,
  `qeltrix.top`); subdomains of each apex are covered.
- **Test suite** `scripts/test_streams_v2.mjs` (`npm run test:streams`): 18 live
  checks across system, discovery, servers/naming, watch (all servers × sub/dub),
  direct + embed verification, full proxy playback chain, subtitle proxy and
  `/api/chain` (probe + all=1). Run report: 17/18 pass, 11/11 critical — the one
  non-critical miss is `/api/download` upstream availability (links are
  JS-rendered upstream; pre-existing limitation, untouched by this release).

### Changed
- **`/api/docs` redesigned** — simple, professional API-reference UI:
  - fixed sidebar with grouped endpoint navigation + live search
  - compact reference cards with param tables and per-endpoint **▶ Try**
  - docked playground: Send → status/latency/size chips → syntax-highlighted JSON,
    Copy JSON, Copy as cURL, request history, Ctrl/⌘+Enter to send
  - new "How streams work" section documenting the pipeline + naming map
  - zero dependencies, auto dark mode; `docsPage.js` + `page.css.js` +
    `page.client.js` rewritten, catalog gains `STREAM_FIELDS` + `SERVER_NAMING`.
- **Auto-migration**: any legacy megaplay-family embed URL (`megaplay.buzz`,
  `vidtube.site`, `vid-tube.site`, `vidplay.site`, with or without `/videojs/`,
  `?s=tcdn|bcdn` hints included) is normalized to the working player form.
- Probe semantics unchanged but stricter in practice: token-gated URLs are
  re-tokenized before each attempt, so `refererRequired` now only fires for
  referer-only CDNs.

### Removed
- Dead `ajax/sources` resolution path (`EMBED_API_MAP` / `megaplay-1.buzz` API
  domain) — upstream is gone; it was the source of the 410s.

### Compatibility
- Response shapes only gained fields (`originalName`, `beta`, `qualities`,
  `subtitles`, `skipIntro`, `embedUrl`); nothing existing was renamed or removed.
- `resolveStreamUrl(embedUrl)` keeps its old signature (now backed by the new
  pipeline) for any code that imported it.
- Env additions are all optional with working defaults.

---

## [2.0.0] — initial public surface

- One REST surface: search, browse, metadata, playback (`/api/search`,
  `/api/anime/*`, `/api/watch`, `/api/chain`, `/api/meta/*`, `/api/proxy/*`).
- Canonical identity per anime (`anilist:<id>` | `mal:<id>` | `<id>` | title)
  with automatic romaji/English dedup.
- `/api/chain` — the one-call streaming pipeline with per-hop timing and CDN probing.
- Built-in CORS playback proxies; self-documenting `/api/docs`, `/api/docs.json`,
  `/api/openapi.json`.
