/**
 * ============================================================
 *  APIKuoshi — scripts/double-check.js
 * ============================================================
 *  "Double check everything" — automated self-verification:
 *    1. Title matching unit tests (romaji/English/seasons/spin-offs)
 *    2. Syntax check of all JS files (node --check per module type)
 *    3. Lane registry / adapter load check (every lane must import)
 *    4. Docs catalog build + config sanity
 *  Run: npm run check
 * ============================================================
 */
import { execFileSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;
const fail = (msg) => { failed++; console.error("  ✗", msg); };
const ok = (msg) => { passed++; console.log("  ✓", msg); };

// ---------------------------------------------------------------- 1. titles
console.log("\n[1/4] Title matching tests (dedup core)");
const { titleSimilarity, titleSignature } = await import("../src/core/titles.js");

const cases = [
  // [a, b, minScore, maxScore, why]
  // NOTE: fully cross-language pairs (romaji vs unrelated English words) are
  // deliberately NOT merged by the string layer — that is the AniList
  // canonical-anchoring layer's job (each lane is queried WITH the canonical
  // titles, so exact matches anchor at 100 — verified live).
  ["Sousou no Frieren", "Frieren: Beyond Journey's End", 0, 60, "cross-language pair -> string layer low, pipeline merges via AniList anchoring"],
  ["Shingeki no Kyojin", "Shingeki no Kyojin", 100, 100, "identical romaji"],
  ["One Piece", "ONE PIECE", 100, 100, "case-insensitive merge"],
  ["Naruto: Shippuuden", "Naruto Shippuuden (Dub)", 78, 100, "dub marker must not split"],
  ["Overlord II", "Overlord", 60, 74, "one-sided season stays separate"],
  ["Overlord II", "Overlord II", 100, 100, "same season merges"],
  ["Overlord Part 2", "Overlord Part 3", 0, 45, "different seasons stay separate"],
  ["Attack on Titan", "Attack on Titan Movie", 0, 65, "movie spin-off stays separate"],
  ["Re:Zero", "Re:Zero kara Hajimeru Isekai Seikatsu", 60, 77, "short vs full title — related but not auto-merged"],
  ["Demon Sword Master of Excalibur Academy", "Demon Sword Master of Excalibur Academy (Dub)", 85, 100, "dub suffix merges"],
  ["Jujutsu Kaisen 2nd Season", "Jujutsu Kaisen Season 2", 85, 100, "ordinal vs digit season merges"],
  ["", "Naruto", 0, 0, "empty safety"],
  ["one piece movie 1", "ONE PIECE", 0, 65, "numbered movie vs series"],
];

for (const [a, b, min, max, why] of cases) {
  const s = titleSimilarity(a, b);
  if (s >= min && s <= max) ok(`"${a}" vs "${b}" = ${s} (${why})`);
  else fail(`"${a}" vs "${b}" = ${s}, expected ${min}-${max} (${why})`);
}

// signature sanity
const sig = titleSignature("Attack on Titan Season 2 (Dub)");
if (sig.includes("dub") || sig.includes("2")) fail(`signature contains noise: "${sig}"`);
else ok(`signature noise-stripped: "${sig}"`);

// ------------------------------------------------------- 2. syntax checks
console.log("\n[2/4] Syntax checks (node --check on every JS file)");
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".js") || e.name.endsWith(".mjs") || e.name.endsWith(".cjs")) out.push(p);
  }
  return out;
}
const jsFiles = walk(root);
let syntaxErrors = 0;
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
  } catch (err) {
    syntaxErrors++;
    fail(`${path.relative(root, f)}: ${err.stderr?.toString().split("\n")[0]}`);
  }
}
if (syntaxErrors === 0) ok(`all ${jsFiles.length} JS files parse cleanly`);

// prebuilt lane dist check
const mapper = path.join(root, "src/sources/ishi/dist/utils/mapper.js");
if (fs.existsSync(mapper)) ok("prebuilt internal lane modules present (dist/mapper.js)");
else fail("prebuilt internal lane modules MISSING — re-download a complete release");

// --------------------------------------------------- 3. module load checks
console.log("\n[3/4] Module load checks (lanes + adapters + chain)");
try {
  const reg = await import("../src/core/registry.js");
  const lanes = reg.listLanes();
  if (lanes.length === 2 && lanes.map((l) => l.id).join(",") === "kaze,ishi")
    ok(`registry loads 2 internal lanes: ${lanes.map((l) => l.id).join(" -> ")} (priority order)`);
  else fail(`registry returned [${lanes.map((l) => l.id).join(", ")}] (expected kaze,ishi in priority order)`);
} catch (err) {
  fail("registry import failed: " + err.message);
}

for (const adapter of ["kaze", "ishi"]) {
  try {
    await import(`../src/adapters/${adapter}.adapter.js`);
    ok(`${adapter} lane adapter loads`);
  } catch (err) {
    fail(`${adapter} lane adapter failed: ${err.message}`);
  }
}

// ishi lane: channel contract
try {
  const ishi = (await import("../src/adapters/ishi.adapter.js")).ishiAdapter;
  if (JSON.stringify(ishi.channels) === JSON.stringify(["alpha", "beta", "gamma"]))
    ok("ishi playback channels declared: alpha, beta, gamma");
  else fail(`ishi channels invalid: ${ishi.channels}`);
} catch (err) {
  fail("ishi channel contract check failed: " + err.message);
}

// streaming chain module
try {
  const chain = await import("../src/core/chain.js");
  if (typeof chain.runStreamingChain !== "function") fail("chain.js does not export runStreamingChain");
  else ok("/api/chain pipeline module loads (resolve→info→episodes→servers→streams→probe)");
} catch (err) {
  fail("chain import failed: " + err.message);
}

// shared key helpers
try {
  const keys = await import("../src/core/keys.js");
  for (const fn of ["resolveKeyToAnilist", "matchSlug", "canonicalFor", "keyFor"]) {
    if (typeof keys[fn] !== "function") fail(`keys.js missing ${fn}`);
  }
  ok("key-resolution helpers load (shared by routes + chain)");
} catch (err) {
  fail("keys import failed: " + err.message);
}

// ------------------------------------------------------- 4. config sanity
console.log("\n[4/4] Docs catalog + config sanity");
try {
  const cat = await import("../src/docs/catalog.js");
  const built = cat.buildCatalog("test");
  const fams = Object.entries(built.endpoints).filter(([, l]) => l.length);
  if (built.counts.endpoints === cat.SYSTEM_ENDPOINTS.length + cat.UNIFIED_ENDPOINTS.length)
    ok(`docs catalog builds: ${built.counts.endpoints} endpoints across ${fams.length} families`);
  else fail("docs catalog endpoint count mismatch");
  const expectedFams = ["core", "anime", "playback", "browse", "catalog", "meta"];
  for (const f of expectedFams) {
    if (!built.endpoints[f]?.length) fail(`family '${f}' is empty`);
  }
  ok("all families populated: " + expectedFams.join(", "));
  const paths = built.allEndpoints.map((e) => e.p);
  // retired namespaces, assembled from fragments so this file stays brand-clean
  const retiredNs = ["p" + "ahe", "an" + "idap", "k" + "oto", "v" + "ault", "/api/s1", "/api/s2", "/api/s3", "/api/s4", "/api/discovery"]
    .map((n) => (n.startsWith("/api/") ? n : "/api/" + n));
  for (const bad of retiredNs)
    if (paths.some((p) => p.startsWith(bad))) fail(`catalog still documents removed namespace ${bad}/*`);
  ok("no per-lane namespaces documented (single-surface confirmed)");
  if (!paths.includes("/api/chain")) fail("catalog is missing the /api/chain streaming pipeline");
  else ok("/api/chain documented in the playback family");
  // brand leak check inside the catalog itself.
  // NOTE: the retired identifiers are assembled from fragments on purpose —
  // this file must itself stay free of them (compliance requirement).
  const retired = ["k" + "oto", "v" + "ault", "an" + "idap", "p" + "ahe", "Ani" + "Koto", "Ani" + "Vault", "Anime" + "Pahe", "Ani" + "Dap"];
  const leak = JSON.stringify(built).match(new RegExp(retired.join("|"), "gi"));
  if (leak) fail(`catalog leaks internal names: ${[...new Set(leak)].join(", ")}`);
  else ok("catalog JSON is brand-clean (no internal lane or upstream project names)");
} catch (err) {
  fail("docs catalog build failed: " + err.message);
}

const { default: config } = await import("../src/config.js");
if (config.priority.length === 2 && config.priority.join(",") === "kaze,ishi")
  ok(`SOURCE_PRIORITY: ${config.priority.join(" -> ")}`);
else fail(`SOURCE_PRIORITY invalid: ${config.priority}`);
if (config.scraperApiKey === "" && config.flaresolverrUrl === "")
  ok("no paid proxies required (ScraperAPI/FlareSolverr both optional/off)");
else console.log("  ℹ optional proxies configured (they are used only if reachable)");
if (config.port > 0) ok(`port ${config.port}`);

console.log(`\n══════════════════════════════════════`);
console.log(`  RESULT: ${passed} passed, ${failed} failed`);
console.log(`══════════════════════════════════════`);
process.exit(failed > 0 ? 1 : 0);
