/**
 * APIKuoshi — scripts/test_megaplay_flow.mjs
 * Direct unit test of the MegaPlay resolution chain (no HTTP layer):
 *   normalize -> player page -> data-id -> getSources(New) -> enc decrypt -> m3u8
 * Usage: node scripts/test_megaplay_flow.mjs [embedUrl]
 */
import {
  isMegaplayUrl,
  normalizeMegaplayEmbedUrl,
  decryptMegaplayPayload,
  resolveMegaplayStream,
} from "../src/sources/kaze/helper/megaplay.helper.js";

const url = process.argv[2] || "https://megaplay.buzz/stream/s-2/107257/sub";

console.log("== normalize ==");
console.log("in :", url);
console.log("out:", normalizeMegaplayEmbedUrl(url));
console.log("isMegaplay:", isMegaplayUrl(url));

console.log("\n== decrypt (known-good sample) ==");
const sample = "wdeBruh3qqn_i5wUNnyaPcXqidp1UWP84FfPHzGyKXAz4mAVkH6j3DueswO2yXLWn8H-XMHNvbAo5Gsg7zIcFBuQI_zsUvMGI1gKwQsPTSHQHiF55R4BopgEQ-7jebQQ4C0Gu7YhaMucopp6d3Q8yAY9b5GdsSvPGq6CUn7SHyc";
console.log(decryptMegaplayPayload(sample));

console.log("\n== full resolve ==");
const t0 = Date.now();
const resolved = await resolveMegaplayStream(url);
console.log(`took ${Date.now() - t0}ms`);
console.log(JSON.stringify({
  url: resolved.url,
  type: resolved.type,
  dataId: resolved.dataId,
  realId: resolved.realId,
  mediaId: resolved.mediaId,
  sourcesEndpoint: resolved.sourcesEndpoint,
  skipData: resolved.skipData,
  subtitleCount: resolved.subtitles?.length ?? 0,
  firstSubtitle: resolved.subtitles?.[0] || null,
  qualityCount: resolved.qualities?.length ?? 0,
  embedUrl: resolved.embedUrl,
  error: resolved.error || null,
}, null, 2));
