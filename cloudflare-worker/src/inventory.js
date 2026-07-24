const clean = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
const price = (value) => {
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const text = (value) => typeof value === "object" ? value?.name ?? null : value;
const walk = (node, output) => {
  if (!node) return;
  if (Array.isArray(node)) return node.forEach((item) => walk(item, output));
  if (typeof node !== "object") return;
  const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
  if (types.some((type) => ["Vehicle", "Car", "Product"].includes(type))) output.push(node);
  Object.values(node).forEach((child) => walk(child, output));
};
const safeUrl = (value, base) => {
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};
const blockedHostname = (hostname) => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
    host === "0.0.0.0" || host === "::1" || /^127\./.test(host) || /^10\./.test(host) ||
    /^169\.254\./.test(host) || /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
};

export function validateDealerUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || blockedHostname(url.hostname)) throw new Error("UNSAFE_DEALER_URL");
  return url;
}

const modelSlug = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const inventoryCandidates = (dealerUrl, query) => {
  const make = clean(query?.filters?.make?.value);
  const model = clean(query?.filters?.model?.value);
  const slug = modelSlug(model);
  const origin = dealerUrl.origin;
  return [
    slug && new URL(`/new-${modelSlug(make)}/${slug}.htm`, origin),
    model && new URL(`/new-inventory/index.htm?search=${encodeURIComponent(model)}`, origin),
    model && new URL(`/new-vehicles/?model=${encodeURIComponent(model)}`, origin),
    dealerUrl,
  ].filter(Boolean);
};
const comparableHostname = (value) => value.toLowerCase().replace(/^www\./, "");

export function extractVehicles(html, dealer, checkedAt = new Date().toISOString()) {
  if (html.length < 100_000 &&
      /<title[^>]*>[^<]*(captcha|access denied|verify you are human)|cf-chl-/i.test(html)) {
    throw new Error("BLOCKED_OR_CAPTCHA");
  }
  const nodes = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(match[1]), nodes); } catch { /* malformed block */ }
  }
  return nodes.map((node) => {
    const vehicle = node.itemOffered ?? node;
    const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers ?? {};
    const statusText = clean(offer.availability);
    const vin = clean(vehicle.vehicleIdentificationNumber ?? vehicle.vin).toUpperCase() || null;
    const sku = clean(vehicle.sku);
    const stockNumber = clean(vehicle.stockNumber ?? vehicle.mpn) ||
      (sku && sku.toUpperCase() !== vin ? sku : null);
    return {
      year: Number(vehicle.vehicleModelDate ?? vehicle.productionDate) || null,
      make: clean(text(vehicle.brand) ?? text(vehicle.manufacturer)) || null,
      model: clean(vehicle.model) || null,
      trim: clean(vehicle.vehicleConfiguration) || null,
      condition: /used|pre-owned/i.test(clean(offer.itemCondition ?? vehicle.itemCondition)) ? "Used" :
        /certified|cpo/i.test(clean(offer.itemCondition ?? vehicle.itemCondition)) ? "CPO" : "New",
      bodyStyle: clean(vehicle.bodyType) || null,
      powertrain: clean(vehicle.fuelType) || null,
      transmission: clean(vehicle.vehicleTransmission) || null,
      drivetrain: clean(vehicle.driveWheelConfiguration) || null,
      exteriorColor: clean(vehicle.color) || null,
      interiorColor: clean(vehicle.vehicleInteriorColor) || null,
      vin,
      stockNumber,
      price: price(offer.price),
      msrp: null,
      mileage: price(vehicle.mileageFromOdometer?.value),
      status: /instock/i.test(statusText) ? "In Stock" : /transit|preorder/i.test(statusText) ? "In Transit" : statusText || null,
      features: [],
      imageUrl: safeUrl(Array.isArray(vehicle.image) ? vehicle.image[0] : vehicle.image, dealer.website),
      url: safeUrl(offer.url ?? vehicle.url, dealer.website),
      checkedAt,
      dealer,
    };
  }).filter((vehicle) => vehicle.make && vehicle.model);
}

const key = (value) => clean(value).toLowerCase();
const actual = (vehicle, field) => {
  if (field === "yearMin" || field === "yearMax") return vehicle.year;
  if (field === "priceMax") return vehicle.price ?? vehicle.msrp;
  if (field === "mileageMax") return vehicle.mileage;
  return vehicle[field];
};
const matches = (field, value, expected) => {
  if (field === "yearMin") return value >= expected;
  if (field === "yearMax" || field === "priceMax" || field === "mileageMax") return value <= expected;
  if (field === "model") return key(value).includes(key(expected)) || key(expected).includes(key(value));
  return key(value).includes(key(expected));
};

export function rank(vehicles, filters, allowRequiredViolations = false) {
  return vehicles.map((vehicle) => {
    const explanations = []; let score = 0; let exact = true;
    for (const [field, preference] of Object.entries(filters ?? {})) {
      if (!preference?.value && preference?.value !== 0) continue;
      const value = actual(vehicle, field);
      if (value === null || value === undefined || value === "") {
        exact = false; explanations.push(`${field}: не удалось проверить`);
        if (preference.required && !allowRequiredViolations) return null;
      } else if (matches(field, value, preference.value)) score += preference.required ? 100 : 20;
      else {
        exact = false; explanations.push(`${field}: ${value} вместо ${preference.value}`);
        if (preference.required && !allowRequiredViolations) return null;
        score -= preference.required ? 100 : 20;
      }
    }
    return { vehicle, exact, score, explanations };
  }).filter(Boolean).sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score);
}

export async function searchDealer(dealer, query) {
  const dealerUrl = validateDealerUrl(dealer.website);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    let lastError = null;
    let reachedDealer = false;
    for (const candidate of inventoryCandidates(dealerUrl, query)) {
      try {
        const response = await fetch(candidate, {
          signal: controller.signal,
          redirect: "follow",
          headers: {
            accept: "text/html,application/xhtml+xml",
            "accept-language": "en-US,en;q=0.8",
            "user-agent": "Mozilla/5.0 (compatible; DJIGITInventory/1.0; +https://djigit.us)",
          },
          cf: { cacheTtl: 300, cacheEverything: true },
        });
        const finalUrl = validateDealerUrl(response.url || candidate.href);
        if (comparableHostname(finalUrl.hostname) !== comparableHostname(dealerUrl.hostname)) {
          throw new Error("UNSAFE_REDIRECT");
        }
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        reachedDealer = true;
        const contentLength = Number(response.headers.get("content-length") ?? 0);
        if (contentLength > 2_000_000) throw new Error("DEALER_RESPONSE_TOO_LARGE");
        const vehicles = extractVehicles(await response.text(), dealer);
        if (!vehicles.length) continue;
        const ranked = rank(vehicles, query.filters, query.allowRequiredViolations);
        return { exact: ranked.filter((item) => item.exact), close: ranked.filter((item) => !item.exact) };
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        lastError = error;
      }
    }
    if (!reachedDealer && lastError) throw lastError;
    return { exact: [], close: [] };
  } finally {
    clearTimeout(timer);
  }
}
