#  APIKuoshi

**One anime REST API  search, browse, metadata and playback through a single, coherent surface.**

APIKuoshi fetches anime data live from public web sources, normalizes it into one stable JSON schema and serves it through one endpoint set. There is exactly one way to do each thing: search, browse, episodes, streams, metadata  and every response feels like it came from one system, because it did.

---

##  Highlights

- **One surface, one schema**  every list endpoint answers `{ success, api, kind, count, results[] }`; every anime is one canonical resource.
- **Canonical identity**  every anime has one key (`anilist:<id>` | `mal:<id>` | `<id>` | `<title>`). Any endpoint accepts any format.
- **Automatic dedup**  the same anime listed under romaji, English or synonym spellings is merged into a single result (title signatures + Dice/Jaccard similarity, with season/type guards).
- **Automatic failover**  data is fetched through internal lanes in priority order; a slow or empty lane never becomes your error.
- **`/api/chain`  the flagship**  one call runs the whole streaming pipeline as nested functions: `resolve  info  episodes  servers  streams  probe`, with every stream URL verified against the real CDN and a ready-to-play `best` stream in the answer.
- **CORS playback proxies built in**  `/api/proxy/hls`, `/api/proxy/video`, `/api/proxy/subtitle` restream media through your own origin so browsers just play it.
- **Zero required services**  no API keys, no paid subscriptions, no FlareSolverr needed. Optional upgrades exist (see Configuration).

---

##  Requirements

| | |
|---|---|
| Node.js | ** 18.17** |
| RAM | ~150 MB free |
| Network | outbound HTTPS (data is fetched live) |

---

##  Installation

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

##  Documentation

APIKuoshi documents itself, generated from the same catalog that powers the code:

| URL | What you get |
|---|---|
| `GET /api/docs` | Interactive HTML docs + playground (browsers) |
| `GET /api/docs.json` | Machine-readable endpoint catalog |
| `GET /api/openapi.json` | OpenAPI 3.1 spec generated from the same catalog |
| `GET /` | Landing JSON with quick links |

The docs page explains the full data flow (request  resolve  fetch  normalize  serve), every endpoint with parameters, and includes a live playground you can fire requests from.

---

##  Endpoint map

### Core
| Endpoint | Purpose |
|---|---|
| `GET /api/search?q=&page=` | Deduplicated search  one entry per anime |
| `GET /api/suggestions?keyword=` | Live typeahead |
| `GET /api/resolve?title=` | Any title  canonical key + playability check |

### Anime
| Endpoint | Purpose |
|---|---|
| `GET /api/anime?key=` | Full info + endpoint map for the anime |
| `GET /api/anime/episodes?key=` | One flat episode list |
| `GET /api/anime/servers?key=&ep=&type=` | Server list for an episode |

### Playback
| Endpoint | Purpose |
|---|---|
| `GET /api/watch?key=&ep=&type=` | Playable streams (each with a CORS-ready `proxiedUrl`) |
| `GET /api/download?key=&ep=` | Download links |
| `GET /api/chain?q=\|key=\|slug=&ep=` | One call: whole pipeline + CDN probe + `best` stream |
| `GET /api/proxy/hls?url=` | HLS restreamer with URI rewriting |
| `GET /api/proxy/video?url=` | Range-aware video/segment restreamer |
| `GET /api/proxy/subtitle?url=` | Subtitle restreamer |

### Browse
`/api/home` · `/api/spotlight` · `/api/trending` · `/api/trending-sidebar` · `/api/top-ten` · `/api/top-rankings?sort=` · `/api/popular` · `/api/random` · `/api/upcoming` · `/api/completed?page=` · `/api/new-release?page=` · `/api/newly-added?page=` · `/api/latest-updated?page=` · `/api/recently-updated?tab=` · `/api/schedule` · `/api/airing`

### Catalog
`/api/az-list/:letter` · `/api/filter?genre=&type=&status=&` · `/api/genre/:genre` · `/api/type/:type` · `/api/status/:status` · `/api/seasons/:slug` · `/api/watch-order/:slug`

### Meta
`/api/meta?key=` (includes a cross-provider `art` block) · `/api/meta/characters?key=&limit=` · `/api/meta/recommendations?key=&limit=` · `/api/meta/season?season=&year=` · `/api/meta/mal?key=&episodes=1` · `/api/meta/external?key=` · `/api/meta/trending` · `/api/meta/art?key=` · `/api/meta/tmdb?key=&ep=` · `/api/meta/kitsu?key=&ep=` · `/api/meta/episode?key=&ep=` · `/api/meta/episodes?key=&thumbs=`

**Cross-provider art & episode imagery** (design ported from
[AniVault-Scraper](https://github.com/SH0MIK/AniVault-Scraper)):

| Provider | Needs a key? | Provides |
|---|---|---|
| **AniList** GraphQL | no (keyless) | poster + banner, MAL↔AniList identity mapping, season lists, streaming-episode titles/thumbnails (fallback) |
| **TMDB** REST | free key (`TMDB_API_KEY` in `.env`) | poster / backdrop / **transparent title logo**, per-season posters, episode stills + real titles + air dates, absolute-episode → season mapping |
| **Kitsu** JSON:API | no (keyless) | poster + cover, MAL↔Kitsu ID mapping, episode thumbnails/titles |
| **MyAnimeList** (direct scrape) | no (keyless) | details, characters, episode lists, external/streaming links (via `/api/meta/mal`, `/api/meta/external`) |

Art resolves through a fallback chain — **AniList → TMDB → Kitsu** — and
per-episode imagery through **TMDB → Kitsu → AniList streamingEpisodes**;
every response tags each image with the provider that supplied it
(`posterSource`, `thumbnailSource`, `art.sources[]`). TMDB is optional:
without a key the chain degrades gracefully (AniList + Kitsu still answer)
and `/api/meta/tmdb` returns an actionable 501.

### System
`/api/health` · `/api/docs` · `/api/docs.json` · `/api/openapi.json`

---

##  Usage examples

**Search  always one entry per anime:**

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
      "poster": "https://jpg",
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
  "anime": { "key": "anilist:154587", "title": "Sousou no Frieren", "": "" },
  "episode": { "requested": 1, "number": 1 },
  "servers": [ { "name": "HD-1", "type": "sub" }, "" ],
  "streams": [
    {
      "provider": "HD-1",
      "type": "sub",
      "url": "https:///video.mp4",
      "proxiedUrl": "/api/proxy/video?url=",
      "kind": "direct",
      "isHls": false,
      "probe": { "playable": true, "httpStatus": 206, "latencyMs": 184, "detail": "video stream (video/mp4)" }
    }
  ],
  "best": { "provider": "HD-1", "proxiedUrl": "/api/proxy/video?url=", "": "" },
  "verdict": "playable",
  "steps": [ { "step": "resolve", "ok": true, "ms": 0, "detail": "anilist:154587  Sousou no Frieren · via search" }, "" ],
  "timing": { "totalMs": 3421, "stepsMs": { "resolve": 0, "info": 1, "episodes": 59, "servers": 47, "streams": 2408, "probe": 928 } },
  "usage": { "replay": "/api/chain?q=frieren&ep=1", "nextEpisode": "/api/chain?q=frieren&ep=2", "playerHint": "Play best.proxiedUrl directly in a <video> element  CORS is already handled." }
}
```

**Play it in a browser:**

```html
<video src="http://localhost:6969/api/proxy/video?url=<best.url>" controls></video>
<!-- or for HLS: use hls.js with best.proxiedUrl -->
```

**Verdict meanings (`/api/chain`):**

| verdict | meaning |
|---|---|
| `playable` | at least one stream verified against the real CDN |
| `unverified` | streams resolved but probing skipped (`?probe=0`) |
| `embed-only` | only player pages found  play them in an `<iframe>`, not `<video>` |
| `no-playable-streams` | direct streams resolved but every probe failed |
| `no-streams` | no stream URLs could be resolved |

---

##  Key formats

Every anime-shaped endpoint accepts the same `?key=`:

| Format | Example | Behaviour |
|---|---|---|
| `anilist:<id>` | `anilist:154587` | strongest, canonical |
| `mal:<id>` | `mal:52991` | mapped internally to AniList |
| `<number>` | `154587` | treated as an AniList id |
| plain title | `frieren` | resolved via search |

---

##  Configuration

Copy `.env.example`  `.env`. **Everything is optional**  the API boots with an empty config.

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `6969` | HTTP port |
| `ALLOWED_ORIGINS` | `*` | CORS origins, comma-separated |
| `RATE_LIMIT_MAX` | `240` | Requests per window per IP (0 disables) |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window |
| `CACHE_SECONDS` | `180` | Response cache TTL (0 disables) |
| `SOURCE_TIMEOUT_MS` | `20000` | Internal fetch timeout per phase |
| `DEDUP_THRESHOLD` | `78` | Title-match strictness 5099 |
| `SOURCE_PRIORITY` | `kaze,ishi` | Advanced: internal lane order |
| `SCRAPER_API_KEY` |  | **Optional** paid scraperapi.com key |
| `FLARESOLVERR_URL` |  | **Optional** self-hosted FlareSolverr URL |
| `MIRROR_DOMAINS` | auto | Optional extra catalogue mirrors |
| `STREAM_PROXY_DOMAINS` / `STREAM_PROXY_REFERER` | auto | Optional playback extraction tuning |

---

##  Testing

```bash
npm run check      # fast self-verification (syntax, wiring, invariants)
npm run test:live  # live end-to-end suite against the running API
```

The live suite covers every endpoint family, full chains (search  episodes  servers  watch), the `/api/chain` verdicts in all input forms, and clean-error contracts.

---

##  Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `502` on an endpoint | The upstream web data was temporarily unavailable  retry shortly; the failover layer already tried alternates for you |
| Stream `403`s when played directly | The CDN requires its player referer  use the provided `proxiedUrl`, which handles it |
| Search feels slow the first time | First fetch is live + uncached; repeats are served from the TTL cache |
| Port already in use | Change `PORT` in `.env` |
| Behind a corporate proxy | Set outbound `HTTPS_PROXY` in your environment; the fetchers honor standard proxy variables where supported |

---

##  Disclaimer

This project is provided **for educational and personal use only**, to demonstrate REST API design, data normalization and media pipeline engineering.

- APIKuoshi **hosts, stores and distributes no content**. It is a search and normalization layer over data that is already publicly accessible on the internet.
- Availability of any title depends entirely on third-party public sources; nothing is guaranteed.
- You are responsible for complying with the laws and the terms of service of any jurisdiction and service you use this software with.
- This software is **not affiliated with, endorsed by, or connected to** any third-party website or service it can query.
- Trademarks and media belong to their respective owners.

Use responsibly.

##  License

[MIT](./LICENSE)