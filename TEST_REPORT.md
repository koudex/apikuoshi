# Live Test Report — v2.1.0 stream refresh

- **Date:** 2026-09-16
- **Runner:** `npm run test:streams` (`scripts/test_streams_v2.mjs`)
- **Target:** http://localhost:6969 (v2.1.0, healthy)
- **Network:** live upstreams (anikototv.to, megaplay.buzz, fetch.nexabloom.top)

## Verdict

**11/11 critical passed · 17/18 total · ~26 s wall time.**

The single non-critical miss (`/api/download`) is a pre-existing upstream
limitation: the site renders download links via client-side JavaScript, so
they are not present in the scraped watch-page HTML. This flow was not
touched by the v2.1 changes and is documented in the extractor itself.

## Results

| # | Test | Result | Time | Detail |
|---|------|--------|------|--------|
| 1 | health | ✓ | 50 ms | v2.1.0 |
| 2 | docs.json catalog | ✓ | 18 ms | 42 endpoints |
| 3 | openapi.json | ✓ | 6 ms | 47 paths |
| 4 | search q=frieren | ✓ | 651 ms | anilist:154587 |
| 5 | anime info | ✓ | 291 ms | Frieren: Beyond Journey's End |
| 6 | episodes list | ✓ | 1252 ms | 28 eps |
| 7 | anime/servers ep1 (sub+dub) with codenames | ✓ | 228 ms | 6 servers, 6 renamed, beta present |
| 8 | watch ep1 type=sub | ✓ | 6603 ms | riyo(Vidstream-2), kaito(Vidstream-1), hana(HD-1) ×2 audio |
| 9 | watch ep1 type=dub | ✓ | 5426 ms | riyo(Vidstream-2), kaito(Vidstream-1), hana(HD-1) ×2 audio |
| 10 | direct url #EXTM3U check | ✓ | 270 ms | HTTP 200, tokenized m3u8 |
| 11 | embedUrl (/videojs/) reachable | ✓ | 52 ms | player page with data-id |
| 12 | proxy/hls master playlist | ✓ | 413 ms | rewritten to same-origin |
| 13 | proxy/hls variant playlist | ✓ | 841 ms | 340 segments |
| 14 | proxy/video segment (MPEG-TS) | ✓ | 1271 ms | 791 KB |
| 15 | proxy/subtitle | ✓ | 78 ms | 0.9 KB vtt |
| 16 | chain ep1 all=1 probe | ✓ | 5717 ms | 5/5 playable, best=riyo |
| 17 | chain ep2 probe=0 | ✓ | 5186 ms | 4 streams, verdict=unverified |
| 18 | download links | ✗ | 83 ms | upstream: links JS-rendered (pre-existing) |

## Extra spot checks

- **One Piece ep 1 chain:** verdict `playable`, 6/6 streams playable, MAL
  episode title "I'm Luffy! The Man Who's Gonna Be King of the Pirates!".
- **Playback chain:** `proxiedUrl` → master playlist → variant playlist →
  segment served as `video/mp2t` (MPEG transport stream) — full chain verified.
- **Docs page:** rendered in headless browser — sidebar (7 groups / 47 endpoints),
  playground Send → HTTP 200 chip + highlighted JSON, zero console errors.

## What was verified against the live CDNs

- Raw AJAX link `megaplay.buzz/stream/…` → 410/error page (reproduced the bug).
- `/videojs/` migration → player page → `data-id` → `getSources` → AES-decrypted
  `master.m3u8` (verified byte-level in development).
- Token gate: no token → 403; fresh 90 s HMAC token + `Referer: megaplay.buzz/`
  → 200 with `#EXTM3U` playlist.
- All three proxies re-tokenize on every hop (long playback safe).
