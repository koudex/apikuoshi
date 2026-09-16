/**
 * APIKuoshi — scripts/ensure-dist.js
 * Validates on postinstall that the prebuilt internal lane module ships
 * intact. Never fails the install: if it is missing, the API still boots —
 * only the availability of that lane's playback channels is reduced.
 */
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distEntry = path.resolve(__dirname, "../src/sources/ishi/dist/utils/mapper.js");

if (existsSync(distEntry)) {
  console.log("[apikuoshi] prebuilt internal modules found — all lanes available.");
  process.exit(0);
}

console.warn(
  "[apikuoshi] prebuilt internal modules missing. The API still boots, " +
  "but one data lane is unavailable. Re-download a complete release."
);
process.exit(0);
