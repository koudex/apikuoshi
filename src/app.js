/**
 * ============================================================
 *  APIKuoshi — src/app.js
 * ============================================================
 *  Express application assembly.
 *
 *  One REST API for anime: search, browse, metadata, playback.
 *  Data is fetched live, normalized into a single schema and
 *  served through one coherent endpoint surface.
 *
 *  Mount order:
 *    1. system      /api/health /api/docs /api/docs.json /api/openapi.json
 *    2. api         /api/search /api/anime /api/watch /api/chain ...
 *    3. 404 + global error handler
 * ============================================================
 */
import express from "express";
import cors from "cors";
import compression from "compression";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

import config from "./config.js";
import { errorHandler, notFoundHandler } from "./core/errors.js";
import systemRoutes from "./routes/system.routes.js";
import unifiedRoutes from "./routes/unified.routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { version } = require(path.resolve(__dirname, "../package.json"));

// ---------------------------------------------------------------------------
// Internal fetchers
// ---------------------------------------------------------------------------

// The internal data lanes read SCRAPER_API_KEY / FLARESOLVERR_URL /
// MIRROR_DOMAINS / STREAM_PROXY_* directly from process.env (already loaded
// from .env) — nothing to wire here; they stay OPTIONAL. Values exist only
// if the user sets them.

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();

app.set("trust proxy", 1);

app.use(compression({ level: 6, threshold: 1024 }));
app.use(express.json({ limit: "100kb" }));

// CORS
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const list = config.allowedOrigins;
      if (list.includes("*") || list.includes(origin)) return cb(null, true);
      cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
  })
);

// request id
app.use((req, res, next) => {
  req.id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  res.setHeader("X-Request-Id", req.id);
  res.setHeader("X-Powered-By", "APIKuoshi");
  next();
});

// optional in-memory rate limit (0 disables)
if (config.rateLimitMax > 0) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, arr] of hits) {
      const valid = arr.filter((t) => now - t < config.rateLimitWindowMs);
      if (valid.length === 0) hits.delete(ip); else hits.set(ip, valid);
    }
  }, 300000).unref();

  app.use((req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter((t) => now - t < config.rateLimitWindowMs);
    if (arr.length >= config.rateLimitMax) {
      return res.status(429).json({
        success: false,
        api: "APIKuoshi",
        message: "Rate limit exceeded. Try again later.",
        retryAfter: Math.ceil((arr[0] + config.rateLimitWindowMs - now) / 1000),
      });
    }
    arr.push(now);
    hits.set(ip, arr);
    res.setHeader("X-RateLimit-Limit", config.rateLimitMax);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, config.rateLimitMax - arr.length));
    next();
  });
}

// landing page
app.get("/", (req, res) => {
  res.json({
    success: true,
    api: "APIKuoshi",
    version,
    tagline: "One anime REST API — search, browse, stream.",
    quickLinks: {
      docs: "/api/docs",
      health: "/api/health",
      search: "/api/search?q=naruto",
      trending: "/api/trending",
      watchExample: "/api/watch?key=anilist:154587&ep=1",
      chainExample: "/api/chain?q=frieren&ep=1",
    },
  });
});

// 1. system
app.use("/api", systemRoutes);

// 2. the API surface
app.use("/api", unifiedRoutes);

// 3. 404 + errors
app.use(notFoundHandler);
app.use(errorHandler);

// ---------------------------------------------------------------------------
export function startServer() {
  const server = app.listen(config.port, () => {
    console.log("");
    console.log("  ╔══════════════════════════════════════════════════╗");
    console.log("  ║            🎌  APIKuoshi is running              ║");
    console.log("  ╠══════════════════════════════════════════════════╣");
    console.log(`  ║  Local:   http://localhost:${String(config.port).padEnd(21)}║`);
    console.log(`  ║  Docs:    /api/docs${" ".repeat(28)}║`);
    console.log("  ║  Surface: /api/search /api/anime /api/chain ...  ║");
    console.log("  ╚══════════════════════════════════════════════════╝");
    console.log("");
  });

  const shutdown = (signal) => {
    console.log(`\n[APIKUOSHI] ${signal} received — shutting down gracefully...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    console.error("[APIKUOSHI][unhandledRejection]", reason);
  });

  return server;
}

export default app;
