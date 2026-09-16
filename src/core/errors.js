/**
 * ============================================================
 *  APIKuoshi — src/core/errors.js
 * ============================================================
 *  Shared error type + global error handlers.
 * ============================================================
 */

export class CustomError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    api: "APIKuoshi",
    message: `No route: ${req.method} ${req.originalUrl}`,
    hint: "See /api/docs for the full endpoint map.",
  });
}

export function errorHandler(err, req, res, _next) {
  let statusCode = err?.response?.status || err?.statusCode || 500;

  // Upstream network failures (DNS, refused, timeout) -> 502 Bad Gateway,
  // so clients can distinguish "source unreachable" from "we broke".
  const networkish = ["ENOTFOUND", "ECONNREFUSED", "EAI_AGAIN", "ETIMEDOUT", "ECONNRESET", "EHOSTUNREACH"];
  if (!err?.response?.status && networkish.some((c) => String(err?.message || err?.code || "").includes(c))) {
    statusCode = 502;
  }

  const message = err?.message || "Internal server error";

  if (statusCode >= 500) {
    console.error(`[APIKUOSHI][ERROR] ${req.method} ${req.originalUrl} -> ${statusCode}: ${message}`);
  }

  const body = {
    success: false,
    api: "APIKuoshi",
    status: statusCode,
    message,
  };

  if (config_isDev() && err?.stack) body.stack = err.stack;
  res.status(statusCode).json(body);
}

function config_isDev() {
  return (process.env.NODE_ENV || "development") !== "production";
}
