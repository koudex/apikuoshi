/**
 * ============================================================
 *  APIKuoshi — src/routes/system.routes.js
 * ============================================================
 *  GET /api/health       — uptime, version, cache health
 *  GET /api/docs         — interactive HTML docs + playground (browsers)
 *                          machine-readable catalog JSON (API clients)
 *  GET /api/docs.json    — always JSON
 *  GET /api/openapi.json — OpenAPI 3.1 generated from the same catalog
 * ============================================================
 */
import { Router as expressRouter } from "express";
import { createRequire } from "module";
import { cacheStats } from "../core/cache.js";
import config from "../config.js";
import { buildCatalog } from "../docs/catalog.js";
import { renderDocsPage } from "../docs/docsPage.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json");

const router = expressRouter();

const startedAt = Date.now();

router.get("/health", (req, res) => {
  const uptime = Math.floor((Date.now() - startedAt) / 1000);
  const h = Math.floor(uptime / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  res.json({
    success: true,
    api: "APIKuoshi",
    version,
    status: "healthy",
    uptime: `${h}h ${m}m ${uptime % 60}s`,
    uptimeSeconds: uptime,
    node: process.version,
    optionalProxies: {
      scraperApi: config.scraperApiKey ? "enabled" : "off (not needed)",
      flaresolverr: config.flaresolverrUrl ? "enabled" : "off (not needed)",
    },
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + "MB",
    },
    cache: cacheStats(),
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Docs — generated from src/docs/catalog.js (single source of truth).
//   Browser  (Accept: text/html)  -> interactive HTML page + playground
//   API client (default / ?format=json) -> machine-readable catalog JSON
// The HTML page is rendered once per process and cached.
// ---------------------------------------------------------------------------

let cachedPage = null;
let cachedPageVersion = null;

function docsHtml() {
  if (!cachedPage || cachedPageVersion !== version) {
    cachedPage = renderDocsPage(version);
    cachedPageVersion = version;
  }
  return cachedPage;
}

router.get("/docs", (req, res) => {
  const wantsHtml =
    req.query.format !== "json" && /text\/html/i.test(req.headers.accept || "");
  if (wantsHtml) {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.type("html").send(docsHtml());
    return;
  }
  res.json(buildCatalog(version));
});

router.get("/docs.json", (req, res) => {
  res.json(buildCatalog(version));
});

// OpenAPI 3.1 — generated from the same catalog so it can never drift.
router.get("/openapi.json", (req, res) => {
  const catalog = buildCatalog(version);
  const paths = {};
  for (const ep of [...(catalog.allEndpoints || []), ...(catalog.systemEndpoints || [])]) {
    const p = ep.p === "/" ? "/" : ep.p.replace(/:([a-zA-Z]+)/g, "{$1}");
    paths[p] = paths[p] || {};
    paths[p][ep.m.toLowerCase()] = {
      summary: ep.d,
      description: ep.tip || undefined,
      parameters: (ep.params || []).map((q) => ({
        name: q.n, in: "query", required: false, description: q.d,
        schema: { type: "string", example: String(q.ex) },
      })),
    };
  }
  res.json({
    openapi: "3.1.0",
    info: {
      title: "APIKuoshi",
      version,
      description: "One anime REST API — search, browse, metadata and playback through a single normalized surface.",
    },
    servers: [{ url: "/" }],
    paths,
  });
});

export default router;
