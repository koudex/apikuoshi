/**
 * ============================================================
 *  APIKuoshi — src/core/registry.js
 * ============================================================
 *  Internal data-lane registry.
 *
 *  Lanes are APIKuoshi's internal fetching pipelines. They are an
 *  implementation detail: there is no public namespace, query param
 *  or response field that exposes them. Everything a client can do
 *  is served by the unified endpoints, which pick lanes automatically
 *  (in config.priority order) and normalize the result.
 * ============================================================
 */
import config from "../config.js";
import { kazeAdapter } from "../adapters/kaze.adapter.js";
import { ishiAdapter } from "../adapters/ishi.adapter.js";

const LANES = {
  kaze: kazeAdapter,
  ishi: ishiAdapter,
};

const order = config.priority.filter((id) => LANES[id]);

export function getLane(id) {
  return LANES[id] || null;
}

export function listLanes() {
  return order.map((id) => LANES[id]);
}

export default { getLane, listLanes };
