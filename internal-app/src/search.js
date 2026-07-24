import crypto from "node:crypto";
import pLimit from "p-limit";
import { adapterFor } from "./adapters/index.js";
import { createSafeFetch } from "./safe-fetch.js";
import { deduplicateVehicles, rankVehicles } from "./ranking.js";
import { keyText } from "./normalize.js";

const publicWebsite = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
};

export function selectDealers(dealers, query) {
  const selectedIds = new Set(query.dealerIds);
  return dealers.filter((dealer) => {
    if (!publicWebsite(dealer.website)) return false;
    if (selectedIds.size && !selectedIds.has(dealer.id)) return false;
    if (query.maxDistanceMiles !== undefined && dealer.distanceMiles !== null &&
        dealer.distanceMiles > query.maxDistanceMiles) return false;
    return keyText(dealer.brand).includes(keyText(query.filters.make.value));
  });
}

export function createSearchManager(config, directory) {
  const searches = new Map();

  const get = (id) => searches.get(id);
  const cancel = (id) => {
    const search = searches.get(id);
    if (!search || search.status !== "running") return false;
    search.controller.abort();
    search.status = "cancelled";
    search.finishedAt = new Date().toISOString();
    return true;
  };

  const start = async (query, user) => {
    const { dealers } = await directory.load();
    const selected = selectDealers(dealers, query);
    const id = crypto.randomUUID();
    const search = {
      id, owner: user.email, status: "running", selected: selected.length, checked: 0,
      failed: [], exact: [], close: [], startedAt: new Date().toISOString(),
      controller: new AbortController(),
    };
    searches.set(id, search);
    void run(search, selected, query);
    return search;
  };

  const run = async (search, dealers, query) => {
    const hardTimer = setTimeout(() => search.controller.abort(), config.maxSearchTimeoutMs);
    const limit = pLimit(config.maxConcurrency);
    const trustedHosts = new Set(dealers.map((dealer) => new URL(dealer.website).hostname));
    const fetchPage = createSafeFetch({ trustedHosts, timeoutMs: config.dealerTimeoutMs });
    const vehicles = [];
    await Promise.allSettled(dealers.map((dealer) => limit(async () => {
      if (search.controller.signal.aborted) return;
      const adapter = adapterFor(dealer);
      if (!adapter) {
        search.failed.push({ dealerId: dealer.id, dealerName: dealer.name, reason: "Не поддерживается" });
        search.checked += 1;
        return;
      }
      try {
        vehicles.push(...await adapter.search({ dealer, query, fetchPage, signal: search.controller.signal }));
      } catch (error) {
        const reason = error?.name === "AbortError" ? "Не ответил вовремя" :
          error?.message === "BLOCKED_OR_CAPTCHA" ? "Заблокирован или CAPTCHA" : "Не удалось проверить";
        search.failed.push({ dealerId: dealer.id, dealerName: dealer.name, reason });
      } finally {
        search.checked += 1;
      }
    })));
    clearTimeout(hardTimer);
    if (search.status === "cancelled") return;
    const ranked = rankVehicles(deduplicateVehicles(vehicles), query);
    search.exact = ranked.exact;
    search.close = ranked.close;
    search.status = search.controller.signal.aborted ? "partial" : "completed";
    search.finishedAt = new Date().toISOString();
    delete search.controller;
  };

  return { start, get, cancel };
}

export function publicSearch(search) {
  if (!search) return null;
  const { controller, owner, ...safe } = search;
  return safe;
}
