#  APIKuoshi

**One anime REST API — search, browse, metadata and playback through a single, coherent surface.**

APIKuoshi fetches anime data live from public web sources, normalizes it into one stable JSON schema and serves it through one endpoint set. There is exactly one way to do each thing: search, browse, episodes, streams, metadata — and every response feels like it came from one system, because it did.

**v2.1 — the /videojs/ stream refresh**: upstream changed how streams are served (raw embeds now 410). APIKuoshi rebuilds playback around the current `/videojs/` player — auto-migration, AES source decryption, 90-second CDN tokens — and renames servers to friendly codenames (`Vidstream-2 → riyo`) while keeping the raw label in `originalName`. See [CHANGELOG.md](CHANGELOG.md).

---

##  Highlights

- **One surface, one schema** — every list endpoint answers `{ success, api, kind, count, results[] }`; every anime is one canonical resource.
- **Canonical identity** — every anime has one key (`anilist:<id>` | `mal:<id>` | `<id>` | `<title>`). Any endpoint accepts any format.
- **Automatic dedup** — the same anime listed under romaji, English or synonym spellings is merged into a single result (title signatures + Dice/Jaccard similarity, with season/type guards).
- **Automatic failover** — data is fetched through internal lanes in priority order; a slow or empty lane never becomes your error.
- **`/api/chain` — the flagship** — one call runs the whole streaming pipeline as nested functions: `resolve → info → episodes → servers → streams → probe`, with every stream URL verified against the real CDN and a ready-to-play `best` stream in the answer.
- **/videojs/ stream pipeline (v2.1)** — raw embeds are auto-migrated to the working `/videojs/` player, the AES-encrypted sources blob is decrypted, and a fresh 90 s CDN token is attached — streams play instead of 410-ing.
- **Friendly server codenames (v2.1)** — `Vidstream-2 → riyo`, `Vidstream-1 → kaito (beta)`, `HD-1 → hana`, … with the raw label preserved in `originalName`. One editable map in `src/sources/kaze/helper/cdn.helper.js`.
- **CORS playback proxies built in** — `/api/proxy/hls`, `/api/proxy/video`, `/api/proxy/subtitle` restream media through your own origin (re-tokenizing token-gated CDNs on every hop) so browsers just play it.
- **Zero required services** — no API keys, no paid subscriptions, no FlareSolverr needed. Optional upgrades exist (see Configuration).

---

##  Requirements

| | |
|---|---|
| Node.js | ** ≥ 18.17** |
| RAM | ~150 MB free |
| Network | outbound HTTPS (data is fetched live) |

---

##  Installation

```bash
# 1. unzip / clone into a folder
cd APIKuoshi

# 2. install dependencies
npm install

# 3. (optional) create your config
cp .env.example .env

# 4. start
npm start          # production
npm run dev        # watch mode
```

The API boots on **http://localhost:6969** (change with `PORT` in `.env`).

First thing to try:

```bash
curl http://localhost:6969/api/health
curl "http://localhost:6969/api/search?q=frieren"
curl "http://localhost:6969/api/chain?q=frieren&ep=1"
```

Open **http://localhost:6969/api/docs** in a browser for the interactive documentation + playground.

---

##  Documentation

APIKuoshi documents itself, generated from the same catalog that powers the code:

| URL | What you get |
|---|---|
| `GET /api/docs` | Interactive API reference + playground (browsers) |
| `GET /api/docs.json` | Machine-readable endpoint catalog |
| `GET /api/openapi.json` | OpenAPI 3.1 spec generated from the same catalog |
| `GET /` | Landing JSON with quick links |

The v2.1 docs are a professional API-reference layout: a fixed sidebar with grouped endpoint navigation and search, compact reference cards with parameter tables, per-endpoint "▶ Try" buttons, and a docked playground (Send → status/latency chips → syntax-highlighted JSON, Copy JSON / Copy as cURL, request history).

---

##  Endpoint map

### Core
| Endpoint | Purpose |
|---|---|
| `GET /api/search?q=&page=` | Deduplicated search — one entry per anime |
| `GET /api/suggestions?keyword=` | Live typeahead |
| `GET /api/resolve?title=` | Any title → canonical key + playability check |

### Anime
| Endpoint | Purpose |
|---|---|
| `GET /api/anime?key=` | Full info + endpoint map for the anime |
| `GET /api/anime/episodes?key=` | One flat episode list |
| `GET /api/anime/servers?key=&ep=&type=` | Server list for an episode (`name` codename + `originalName` + `beta` flag) |

### Playback
| Endpoint | Purpose |
|---|---|
| `GET /api/watch?key=&ep=&type=` | Playable streams: direct `url`, `embedUrl`, `proxiedUrl`, `qualities`, `subtitles`, `skipIntro` |
| `GET /api/download?key=&ep=` | Download links |
| `GET /api/chain?q=\|key=\|slug=&ep=` | One call: whole pipeline + CDN probe + `best` stream |
| `GET /api/proxy/hls?url=` | HLS restreamer with URI rewriting + auto re-tokenization |
| `GET /api/proxy/video?url=` | Range-aware video/segment restreamer |
| `GET /api/proxy/subtitle?url=` | Subtitle restreamer |

### Browse
`/api/home` · `/api/spotlight` · `/api/trending` · `/api/trending-sidebar` · `/api/top-ten` · `/api/top-rankings?sort=` · `/api/popular` · `/api/random` · `/api/upcoming` · `/api/completed?page=` · `/api/new-release?page=` · `/api/newly-added?page=` · `/api/latest-updated?page=` · `/api/recently-updated?tab=` · `/api/schedule` · `/api/airing`

### Catalog
`/api/az-list/:letter` · `/api/filter?genre=&type=&status=&…` · `/api/genre/:genre` · `/api/type/:type` · `/api/status/:status` · `/api/seasons/:slug` · `/api/watch-order/:slug`

### Meta
`/api/meta?key=` · `/api/meta/characters?key=&limit=` · `/api/meta/recommendations?key=&limit=` · `/api/meta/season?season=&year=` · `/api/meta/mal?key=&episodes=1` · `/api/meta/external?key=` · `/api/meta/trending`

### System
`/api/health` · `/api/docs` · `/api/docs.json` · `/api/openapi.json`

---

##  Usage examples

**Search — always one entry per anime:**

```bash
curl "http://localhost:6969/api/search?q=frieren"
```

```json
{
  "success": true,
  "api": "APIKuoshi",
  "query": "frieren",
  "page": 1,
  "count": 6,
  "results": [
    {
      "key": "anilist:154587",
      "anilistId": 154587,
      "malId": 52991,
      "title": "Sousou no Frieren",
      "titleRomaji": "Sousou no Frieren",
      "titleEnglish": "Frieren: Beyond Journey's End",
      "poster": "https://…jpg",
      "year": 2023,
      "type": "TV",
      "episodes": 28,
      "status": "Finished Airing"
    }
  ]
}
```

**One call from nothing to a playable stream:**

```bash
curl "http://localhost:6969/api/chain?q=frieren&ep=1"
```

```json
{
  "success": true,
  "api": "APIKuoshi",
  "anime": { "key": "anilist:154587", "title": "Sousou no Frieren", "…": "…" },
  "episode": { "requested": 1, "number": 1 },
  "servers": [ { "name": "hana", "originalName": "HD-1", "type": "sub" }, "…" ],
  "streams": [
    {
      "provider": "hana",
      "originalName": "HD-1",
      "type": "sub",
      "url": "https://fetch.nexabloom.top/…/master.m3u8?token=…",
      "embedUrl": "https://megaplay.buzz/videojs/stream/s-2/…/sub",
      "proxiedUrl": "/api/proxy/hls?url=…",
      "kind": "direct",
      "isHls": true,
      "qualities": [ { "label": "1080p", "url": "…" } ],
      "subtitles": [ { "label": "English", "language": "eng", "url": "…", "format": "vtt", "default": true } ],
      "skipIntro": { "intro": { "start": 0, "end": 89 }, "outro": { "start": 1460, "end": 1549 } },
      "probe": { "playable": true, "httpStatus": 200, "latencyMs": 184, "detail": "HLS master playlist — 1 variant" }
    }
  ],
  "best": { "provider": "riyo", "originalName": "Vidstream-2", "proxiedUrl": "/api/proxy/hls?url=…", "…": "…" },
  "verdict": "playable",
  "steps": [ { "step": "resolve", "ok": true, "ms": 0, "detail": "anilist:154587 — Sousou no Frieren · via search" }, "…" ],
  "timing": { "totalMs": 3421, "stepsMs": { "resolve": 0, "info": 1, "episodes": 59, "servers": 47, "streams": 2408, "probe": 928 } },
  "usage": { "replay": "/api/chain?q=frieren&ep=1", "nextEpisode": "/api/chain?q=frieren&ep=2", "playerHint": "Play best.proxiedUrl directly in an HLS-capable <video> (hls.js) — CORS is already handled." }
}
```

### How streams are resolved (v2.1 /videojs/ pipeline)

Upstream episode links point at raw embed pages that answer **410** to direct playback. APIKuoshi auto-migrates every link to the working `/videojs/` player and walks the site's own pipeline:

```
megaplay.buzz/stream/s-{sv}/{realId}/{type}          ← raw AJAX link (410s)
  → megaplay.buzz/videojs/stream/…                    ← /videojs/ migration
  → player page → data-id                             ← file id
  → /videojs/stream/getSources?id=…                   ← tracks + intro/outro + enc
  → AES-256-CBC decrypt of enc                        ← { file: master.m3u8 }
  → + fresh 90 s HMAC ?token=                         ← token-gated CDNs
  → playable url · embedUrl · proxiedUrl · qualities · subtitles · skipIntro
```

### Server naming

| upstream label | codename (`name`) | note |
|---|---|---|
| `Vidstream-2` | `riyo` | |
| `Vidstream-1` | `kaito` | site's beta/pretest server → `beta: true` |
| `HD-1` / `HD-2` | `hana` / `sora` | |
| `VidCloud-1` / `VidCloud-2` | `akira` / `yuki` | |
| `VidPlay-1` / `VidPlay-2` | `miso` / `kenji` | |
| `StreamTape-1` / `StreamTape-2` | `arashi` / `taiki` | |

The raw label always rides along as `originalName`. To change any codename, edit `SERVER_CODENAMES` in `src/sources/kaze/helper/cdn.helper.js` — that's the single source of truth used by every endpoint.

**Play it in a browser:**

```html
<video src="http://localhost:6969/api/proxy/hls?url=<best.url>&ref=https%3A%2F%2Fmegaplay.buzz%2F" controls></video>
<!-- or take best.proxiedUrl directly — it already carries the right form -->
```

**Verdict meanings (`/api/chain`):**

| verdict | meaning |
|---|---|
| `playable` | at least one stream verified against the real CDN |
| `unverified` | streams resolved but probing skipped (`?probe=0`) |
| `embed-only` | only player pages found — play them in an `<iframe>`, not `<video>` |
| `no-playable-streams` | direct streams resolved but every probe failed |
| `no-streams` | no stream URLs could be resolved |

---

##  Key formats

Every anime-shaped endpoint accepts the same `?key=`:

| Format | Example | Behaviour |
|---|---|---|
| `anilist:<id>` | `anilist:154587` | strongest, canonical |
| `mal:<id>` | `mal:52991` | mapped internally to AniList |
| `<number>` | `154587` | treated as an AniList id |
| plain title | `frieren` | resolved via search |

---

##  Configuration

Copy `.env.example` → `.env`. **Everything is optional** — the API boots with an empty config.

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `6969` | HTTP port |
| `ALLOWED_ORIGINS` | `*` | CORS origins, comma-separated |
| `RATE_LIMIT_MAX` | `240` | Requests per window per IP (0 disables) |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window |
| `CACHE_SECONDS` | `180` | Response cache TTL (0 disables) |
| `SOURCE_TIMEOUT_MS` | `20000` | Internal fetch timeout per phase |
| `DEDUP_THRESHOLD` | `78` | Title-match strictness 50–99 |
| `SOURCE_PRIORITY` | `kaze,ishi` | Advanced: internal lane order |
| `SCRAPER_API_KEY` | — | **Optional** paid scraperapi.com key |
| `FLARESOLVERR_URL` | — | **Optional** self-hosted FlareSolverr URL |
| `MIRROR_DOMAINS` | auto | Optional extra catalogue mirrors |
| `STREAM_PROXY_DOMAINS` / `STREAM_PROXY_REFERER` | auto | Optional playback extraction tuning |
| `MEGAPLAY_SOURCE_ENC_KEY` / `MEGAPLAY_SOURCE_ENC_IV` | auto | Optional override if the site rotates the sources-blob keys |
| `MEGAPLAY_CDN_TOKEN_SECRET` / `MEGAPLAY_CDN_TOKEN_TTL` | auto | Optional override for the stream CDN token gate |

---

##  Testing

```bash
npm run check           # fast self-verification (syntax, wiring, invariants)
npm run test:live       # live end-to-end suite against the running API
npm run test:streams    # v2.1 stream suite: naming, watch (all servers × sub/dub), proxies, chain
```

The live suite covers every endpoint family, full chains (search → episodes → servers → watch), the `/api/chain` verdicts in all input forms, and clean-error contracts. The v2.1 stream suite additionally verifies server codenames, the `/videojs/` resolution, direct/embed/proxied playback (playlist → variant → MPEG-TS segment), subtitle proxying and chain probing.

---

##  Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `502` on an endpoint | The upstream web data was temporarily unavailable — retry shortly; the failover layer already tried alternates for you |
| Stream `403`s when played directly | Token-gated CDNs need a fresh `?token=` + player referer — use the provided `url` (tokenized) or `proxiedUrl`, which re-tokenize automatically |
| Search feels slow the first time | First fetch is live + uncached; repeats are served from the TTL cache |
| Port already in use | Change `PORT` in `.env` |
| Behind a corporate proxy | Set outbound `HTTPS_PROXY` in your environment; the fetchers honor standard proxy variables where supported |
| Streams stopped working entirely | The upstream player may have rotated keys/URLs — check `MEGAPLAY_*` env overrides and the changelog |

---

##  Disclaimer

This project is provided **for educational and personal use only**, to demonstrate REST API design, data normalization and media pipeline engineering.

- APIKuoshi **hosts, stores and distributes no content**. It is a search and normalization layer over data that is already publicly accessible on the internet.
- Availability of any title depends entirely on third-party public sources; nothing is guaranteed.
- You are responsible for complying with the laws and the terms of service of any jurisdiction and service you use this software with.
- This software is **not affiliated with, endorsed by, or connected to** any third-party website or service it can query.
- Trademarks and media belong to their respective owners.

Use responsibly.
