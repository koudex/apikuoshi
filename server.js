/**
 * ============================================================
 *  APIKuoshi — server.js  (entry point)
 * ============================================================
 *  One REST API for anime: search, discovery, metadata and
 *  playback, served through a single normalized endpoint surface.
 *  Start with:  node server.js   (or npm start)
 * ============================================================
 */
import "dotenv/config";
import { startServer } from "./src/app.js";

startServer();
