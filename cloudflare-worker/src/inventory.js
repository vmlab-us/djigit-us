const clean = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
const price = (value) => {
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const text = (value) => typeof value === "object" ? value?.name ?? null : value;
const powertrainDescription = (vehicle) => {
  const source = clean([
    vehicle.fuelType,
    text(vehicle.vehicleEngine),
    vehicle.name,
  ].filter(Boolean).join(" ")).toLowerCase();
  if (!source) return null;
  if (/\b(?:plug[- ]?in hybrid|phev)\b/.test(source)) return "Plug-in Hybrid";
  if (/\b(?:hybrid|hev)\b/.test(source)) return "Hybrid";
  if (/\b(?:hydrogen|fuel cell|fcev)\b/.test(source)) return "Hydrogen / Fuel Cell";
  if (/\b(?:electric|battery electric|bev|ev)\b/.test(source)) return "Electric";
  if (/\b(?:diesel|tdi)\b/.test(source)) return "Diesel";
  if (/\b(?:flex fuel|e85)\b/.test(source)) return "Flex Fuel";
  if (/\b(?:gasoline|gas|petrol|unleaded)\b/.test(source)) return "Gasoline";
  return null;
};
const inferTrim = (vehicle) => {
  const explicit = clean(vehicle.vehicleConfiguration ?? vehicle.trim);
  if (explicit) return explicit;
  const name = clean(vehicle.name);
  const model = clean(vehicle.model);
  if (!name || !model) return null;
  const modelIndex = name.toLowerCase().indexOf(model.toLowerCase());
  if (modelIndex < 0) return null;
  const inferred = clean(name.slice(modelIndex + model.length)
    .replace(/\b(?:for sale|available at|at)\b.*$/i, "")
    .replace(/\b(?:plug[- ]?in hybrid|hybrid|electric|diesel|gasoline|gas)\b/gi, " ")
    .replace(/\b(?:AWD|FWD|RWD|4WD|4X4|all[- ]wheel drive|front[- ]wheel drive|rear[- ]wheel drive)\b/gi, " ")
    .replace(/\b(?:automatic|manual|CVT|A\/T|M\/T|transmission)\b/gi, " ")
    .replace(/\b(?:2D|4D)?\s*(?:sport utility|SUV|sedan|coupe|hatchback|pickup|truck|wagon|minivan|van)\b/gi, " ")
    .replace(/^[\s|,/-]+|[\s|,/-]+$/g, ""));
  return inferred && inferred.length <= 60 ? inferred : null;
};
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
const jazelModelSegment = (value) => clean(value).replace(/-/g, "--").replace(/\s+/g, "_");
export const inventoryCandidates = (dealerUrl, query) => {
  const make = clean(query?.filters?.make?.value);
  const model = clean(query?.filters?.model?.value);
  const slug = modelSlug(model);
  const origin = dealerUrl.origin;
  return [
    new URL("/llm/inventory/?type=new", origin),
    model && new URL(`/searchnew.aspx?q=${encodeURIComponent(model)}`, origin),
    slug && new URL(`/new-${modelSlug(make)}/${slug}.htm`, origin),
    slug && new URL(`/new-vehicles/${slug}/`, origin),
    model && new URL(`/inventory/new/?model=${encodeURIComponent(model)}`, origin),
    model && new URL(`/new-inventory/index.htm?model=${encodeURIComponent(model)}`, origin),
    model && new URL(`/new-inventory/index.htm?search=${encodeURIComponent(model)}`, origin),
    model && new URL(`/new-vehicles/?model=${encodeURIComponent(model)}`, origin),
    model && new URL(
      `/search/new-${modelSlug(make)}-${slug}/?s:pr=0&tp=new&md=${encodeURIComponent(model)}`,
      origin,
    ),
    new URL("/new-inventory/index.htm", origin),
    new URL("/search/new/", origin),
    new URL("/sitemap.xml", origin),
    new URL("/sitemap_index.xml", origin),
    dealerUrl,
  ].filter(Boolean).filter((candidate, index, candidates) =>
    candidates.findIndex((item) => item.href === candidate.href) === index);
};

const decodeHtml = (value) => String(value ?? "")
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;|&#34;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">");

const htmlToLines = (html) => decodeHtml(html)
  .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
  .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
  .replace(/<(?:br|\/?p|\/?li|\/?h[1-6]|\/?article|\/?div)\b[^>]*>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .split(/\n+/)
  .map(clean)
  .filter(Boolean)
  .join("\n");

const titleParts = (title, query) => {
  const requestedMake = clean(query?.filters?.make?.value);
  const requestedModel = clean(query?.filters?.model?.value);
  const yearMatch = clean(title).match(/\b(20\d{2})\b/);
  let remainder = clean(title).replace(/^\s*(?:new|used|certified|cpo)?\s*20\d{2}\s*/i, "");
  if (requestedMake) remainder = remainder.replace(new RegExp(`^${requestedMake.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "");
  let model = requestedModel || null;
  let trim = null;
  if (requestedModel) {
    const index = remainder.toLowerCase().indexOf(requestedModel.toLowerCase());
    if (index >= 0) trim = clean(remainder.slice(index + requestedModel.length)) || null;
  } else {
    const words = remainder.split(/\s+/);
    model = words.shift() || null;
    trim = clean(words.join(" ")) || null;
  }
  return { year:Number(yearMatch?.[1]) || null, make:requestedMake || null, model, trim };
};

export function extractLlmVehicles(html, dealer, query, checkedAt = new Date().toISOString()) {
  if (!/\bVIN\s*:/i.test(html) || !/\b(?:New|Used|Certified)\b/i.test(html)) return [];
  const lines = htmlToLines(html);
  const pattern = /(?:^|\n)(20\d{2}\s+[^\n]{2,100})\n(New|Used|Certified(?: Pre-Owned)?)\n(?:[\d,]+\s+miles\n)?(?:Call for Price|\$([\d,]+))\nVIN:\s*([A-HJ-NPR-Z0-9]{17})/gi;
  const vehicles = [];
  for (const match of lines.matchAll(pattern)) {
    const name = clean(match[1]);
    const parsed = titleParts(name, query);
    const vehicle = {
      name, ...parsed,
      condition:/used/i.test(match[2]) ? "Used" : /certified/i.test(match[2]) ? "CPO" : "New",
      bodyStyle:null,
      powertrain:powertrainDescription({ name }),
      transmission:null,
      drivetrain:(name.match(/\b(?:AWD|FWD|RWD|4WD|4X4)\b/i)?.[0] || null),
      exteriorColor:null, interiorColor:null,
      vin:match[4].toUpperCase(), stockNumber:null,
      price:price(match[3]), msrp:null, mileage:0,
      status:"In Stock", features:[], imageUrl:null,
      url:null, checkedAt, dealer,
    };
    if (vehicle.make && vehicle.model) vehicles.push(vehicle);
  }
  return vehicles;
}

const firstValue = (object, names) => {
  for (const name of names) {
    const value = object?.[name];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
};

const collectInventoryObjects = (node, output, seen = new Set()) => {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) return node.forEach((item) => collectInventoryObjects(item, output, seen));
  const vin = clean(firstValue(node, ["vin", "VIN", "vehicleIdentificationNumber"]));
  const model = firstValue(node, ["model", "modelName", "vehicleModel"]);
  const make = firstValue(node, ["make", "makeName", "brand", "manufacturer"]);
  if (/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin) && (model || firstValue(node, ["title", "name"])) && make) output.push(node);
  Object.values(node).forEach((child) => collectInventoryObjects(child, output, seen));
};

export function extractEmbeddedVehicles(html, dealer, checkedAt = new Date().toISOString()) {
  const objects = [];
  for (const match of html.matchAll(/<script[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collectInventoryObjects(JSON.parse(decodeHtml(match[1])), objects); } catch { /* malformed JSON */ }
  }
  const seen = new Set();
  return objects.map((item) => {
    const makeValue = firstValue(item, ["make", "makeName", "brand", "manufacturer"]);
    const engine = firstValue(item, ["fuelType", "fuel", "engine", "engineDescription"]);
    const name = clean(firstValue(item, ["title", "name", "displayName"]));
    const vin = clean(firstValue(item, ["vin", "VIN", "vehicleIdentificationNumber"])).toUpperCase();
    return {
      name:name || null,
      year:Number(firstValue(item, ["year", "modelYear", "vehicleModelDate"])) || null,
      make:clean(text(makeValue)) || null,
      model:clean(firstValue(item, ["model", "modelName", "vehicleModel"])) || null,
      trim:clean(firstValue(item, ["trim", "trimName", "vehicleConfiguration"])) || null,
      condition:/used|pre-owned/i.test(clean(firstValue(item, ["condition", "type", "inventoryType"]))) ? "Used" : "New",
      bodyStyle:clean(firstValue(item, ["bodyStyle", "bodyType"])) || null,
      powertrain:powertrainDescription({ fuelType:engine, name }),
      transmission:clean(firstValue(item, ["transmission", "transmissionDescription"])) || null,
      drivetrain:clean(firstValue(item, ["drivetrain", "driveTrain", "driveWheelConfiguration"])) || null,
      exteriorColor:clean(firstValue(item, ["exteriorColor", "color"])) || null,
      interiorColor:clean(firstValue(item, ["interiorColor"])) || null,
      vin,
      stockNumber:clean(firstValue(item, ["stockNumber", "stock", "stockNo"])) || null,
      price:price(firstValue(item, ["price", "internetPrice", "salePrice", "sellingPrice"])),
      msrp:price(firstValue(item, ["msrp", "retailPrice"])),
      mileage:price(firstValue(item, ["mileage", "odometer"])),
      status:"In Stock", features:[],
      imageUrl:safeUrl(firstValue(item, ["imageUrl", "image", "photo"]), dealer.website),
      url:safeUrl(firstValue(item, ["url", "vehicleUrl", "detailUrl"]), dealer.website),
      checkedAt, dealer,
    };
  }).filter((vehicle) => {
    if (!vehicle.make || !vehicle.model || seen.has(vehicle.vin)) return false;
    seen.add(vehicle.vin); return true;
  });
}

export function extractJazelVehicles(html, dealer, checkedAt = new Date().toISOString()) {
  const seen = new Set();
  const vehicles = [];
  for (const match of html.matchAll(/\bdata-vehicle\s*=\s*["']([^"']+)["']/gi)) {
    let item;
    try { item = JSON.parse(decodeHtml(match[1])); } catch { continue; }
    const vin = clean(item.vin).toUpperCase();
    if (!item.make || !item.model || !vin || seen.has(vin)) continue;
    seen.add(vin);
    const body = Array.isArray(item.bodyType) ? item.bodyType[0] : item.bodyType;
    const name = clean(`${item.year} ${item.make} ${item.model} ${item.trim}`);
    vehicles.push({
      name:name || null,
      year:Number(item.year) || null,
      make:clean(item.make) || null,
      model:clean(item.model) || null,
      trim:clean(item.trim) || null,
      condition:/used|pre-owned/i.test(clean(item.condition)) ? "Used" :
        /certified|cpo/i.test(clean(item.condition)) ? "CPO" : "New",
      bodyStyle:clean(body) || null,
      powertrain:powertrainDescription({ fuelType:item.fuelType, name }),
      transmission:clean(item.transmission) || null,
      drivetrain:clean(item.drivetrain) || null,
      exteriorColor:clean(item.exterior_color ?? item.exteriorColor) || null,
      interiorColor:clean(item.interior_color ?? item.interiorColor) || null,
      vin,
      stockNumber:clean(item.stockNumber) || null,
      price:price(item.price), msrp:price(item.msrp), mileage:price(item.mileage),
      status:"In Stock", features:Array.isArray(item.features) ? item.features : [],
      imageUrl:safeUrl(item.imageUrl ?? item.image, dealer.website),
      url:safeUrl(item.url ?? item.vdpUrl, dealer.website),
      checkedAt, dealer,
    });
  }
  return vehicles;
}
const comparableHostname = (value) => value.toLowerCase().replace(/^www\./, "");
const dealerHeaders = () => ({
  accept:"text/html,application/xhtml+xml",
  "accept-language":"en-US,en;q=0.8",
  "user-agent":"Mozilla/5.0 (compatible; DJIGITInventory/1.0; +https://djigit.us)",
});

const dealerOnModel = (html) => {
  const match = html.match(/<script[^>]*id=["']dlron-srp-model["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    const model = JSON.parse(decodeHtml(match[1]));
    const dealerId = Number(model.DealerId);
    const pageId = Number(model.PageId);
    return dealerId > 0 && pageId > 0 ? { dealerId, pageId } : null;
  } catch {
    return null;
  }
};

export function extractDealerOnVehicles(payload, dealer, checkedAt = new Date().toISOString()) {
  const cards = Array.isArray(payload?.DisplayCards) ? payload.DisplayCards : [];
  const seen = new Set();
  return cards.map((entry) => {
    const item = entry?.VehicleCard;
    if (!item) return null;
    const vin = clean(item.VehicleVin).toUpperCase();
    const name = clean(item.VehicleName);
    const status = clean(entry?.VehicleStatusModel?.StatusText) ||
      (item.VehicleInTransit ? "In Transit" : item.VehicleInStock ? "In Stock" : null);
    const image = item.VehicleImageModel?.VehiclePhotoSrc ??
      item.VehicleImageModel?.VehiclePhotoCarouselList?.[0]?.VehiclePhotoSrc;
    return {
      name:name || null,
      year:Number(item.VehicleYear) || null,
      make:clean(item.VehicleMake) || null,
      model:clean(item.VehicleModel) || null,
      trim:clean(item.VehicleRuleAdjustedTrim ?? item.VehicleTrim) || null,
      condition:/used|pre-owned/i.test(clean(item.VehicleType)) ? "Used" :
        /certified|cpo/i.test(clean(item.VehicleType)) ? "CPO" : "New",
      bodyStyle:clean(item.VehicleBodyStyle ?? item.VehicleBodyType) || null,
      powertrain:powertrainDescription({
        fuelType:item.VehicleFuelType,
        vehicleEngine:item.VehicleEngine,
        name,
      }),
      transmission:clean(item.VehicleTransmission) || null,
      drivetrain:clean(item.VehicleDriveTrain) || null,
      exteriorColor:clean(item.ExteriorColorLabel ?? item.VehicleExteriorColor) || null,
      interiorColor:clean(item.InteriorColorLabel ?? item.VehicleInteriorColor) || null,
      vin:vin || null,
      stockNumber:clean(item.VehicleStockNumber) || null,
      price:price(item.VehicleInternetPrice ?? item.TaggingPrice),
      msrp:price(item.VehicleMsrp),
      mileage:price(item.VehicleMileage),
      status, features:[],
      imageUrl:safeUrl(image, dealer.website),
      url:safeUrl(item.VehicleDetailUrl, dealer.website),
      checkedAt, dealer,
    };
  }).filter((vehicle) => {
    if (!vehicle?.make || !vehicle.model) return false;
    const identity = vehicle.vin || `${vehicle.stockNumber || ""}|${vehicle.url || ""}`;
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

const fetchDealerOnVehicles = async (html, finalUrl, dealer, query, signal) => {
  const model = dealerOnModel(html);
  if (!model) return null;
  const endpoint = new URL(
    `/api/vhcliaa/vehicle-pages/cosmos/srp/vehicles/${model.dealerId}/${model.pageId}`,
    finalUrl.origin,
  );
  endpoint.searchParams.set("host", finalUrl.hostname);
  endpoint.searchParams.set("pageSize", "24");
  endpoint.searchParams.set("displayCardsShown", "0");
  const requestedModel = clean(query?.filters?.model?.value);
  if (requestedModel) endpoint.searchParams.set("q", requestedModel);
  const response = await fetch(endpoint, {
    signal, redirect:"follow", headers:{ ...dealerHeaders(), accept:"application/json" },
    cf:{ cacheTtl:300, cacheEverything:true },
  });
  const responseUrl = validateDealerUrl(response.url || endpoint.href);
  if (comparableHostname(responseUrl.hostname) !== comparableHostname(finalUrl.hostname)) {
    throw new Error("UNSAFE_REDIRECT");
  }
  if (!response.ok) throw new Error(`DEALERON_HTTP_${response.status}`);
  return extractDealerOnVehicles(await response.json(), dealer);
};

const dealerVenomConfig = (html) => {
  const indexName = html.match(/\bindexName\s*=\s*["']([^"']+)["']/)?.[1];
  const apiKey = html.match(/\bapiKey\s*:\s*["']([^"']+)["']/)?.[1];
  const host = html.match(/\bhost\s*:\s*["']([^"']+\.typesense\.net)["']/i)?.[1];
  if (!indexName || !apiKey || !host || !/^[a-z0-9.-]+$/i.test(host)) return null;
  return { indexName, apiKey, host };
};

export function extractDealerVenomVehicles(payload, dealer, checkedAt = new Date().toISOString()) {
  const hits = Array.isArray(payload?.hits) ? payload.hits : [];
  const seen = new Set();
  return hits.map((hit) => {
    const item = hit?.document;
    if (!item) return null;
    const vin = clean(item.vin).toUpperCase();
    const name = clean(item.vehicleTitle) || clean(`${item.year} ${item.make} ${item.model} ${item.trim}`);
    return {
      name:name || null,
      year:Number(item.year ?? item.yr) || null,
      make:clean(item.make) || null,
      model:clean(item.model) || null,
      trim:clean(item.trim ?? item.altStyle) || null,
      condition:/used|pre-owned/i.test(clean(item.condition)) ? "Used" :
        /certified|cpo/i.test(clean(item.condition)) ? "CPO" : "New",
      bodyStyle:clean(item.body) || null,
      powertrain:powertrainDescription({
        fuelType:item.fuel, vehicleEngine:item.engine, name,
      }),
      transmission:clean(item.transmission) || null,
      drivetrain:clean(item.drivetrain) || null,
      exteriorColor:clean(item.exteriorColor) || null,
      interiorColor:clean(item.interiorColor) || null,
      vin:vin || null,
      stockNumber:clean(item.stockNumber) || null,
      price:price(item.finalPriceInt ?? item.price ?? item.finalPrice ?? item.internetPrice),
      msrp:price(item.msrp),
      mileage:price(item.mileage),
      status:clean(item.status) || (item.flags?.inTransit ? "In Transit" : "In Stock"),
      features:Array.isArray(item.features) ? item.features.map(clean).filter(Boolean) : [],
      imageUrl:safeUrl(item.imageUrls?.[0], dealer.website),
      url:safeUrl(item.vdpUrl, dealer.website),
      checkedAt, dealer,
    };
  }).filter((vehicle) => {
    if (!vehicle?.make || !vehicle.model) return false;
    const identity = vehicle.vin || `${vehicle.stockNumber || ""}|${vehicle.url || ""}`;
    if (!identity || seen.has(identity)) return false;
    seen.add(identity); return true;
  });
}

const fetchDealerVenomVehicles = async (html, dealer, query, signal) => {
  const config = dealerVenomConfig(html);
  if (!config) return null;
  const endpoint = new URL(
    `/collections/${encodeURIComponent(config.indexName)}/documents/search`,
    `https://${config.host}`,
  );
  const requestedModel = clean(query?.filters?.model?.value);
  endpoint.searchParams.set("q", requestedModel || "*");
  endpoint.searchParams.set(
    "query_by",
    "vin,stockNumber,lastEight,year,make,model,trim,exteriorColor,body,features,engine,transmission,drivetrain,fuel,genericColor,dealertag",
  );
  endpoint.searchParams.set("filter_by", "condition:=New");
  endpoint.searchParams.set("per_page", "50");
  const response = await fetch(endpoint, {
    signal, redirect:"follow",
    headers:{ accept:"application/json", "x-typesense-api-key":config.apiKey },
    cf:{ cacheTtl:300, cacheEverything:true },
  });
  const responseUrl = new URL(response.url || endpoint.href);
  if (responseUrl.protocol !== "https:" || !responseUrl.hostname.endsWith(".typesense.net")) {
    throw new Error("UNSAFE_TYPESENSE_REDIRECT");
  }
  if (!response.ok) throw new Error(`DEALERVENOM_HTTP_${response.status}`);
  return extractDealerVenomVehicles(await response.json(), dealer);
};

export function extractVehicleLinks(html, baseUrl, model = "", limit = 8) {
  const base = validateDealerUrl(baseUrl);
  const modelNeedle = modelSlug(model);
  const modelLinks = [];
  const fallbackLinks = [];
  const candidates = html.matchAll(
    /(?:href\s*=\s*["']([^"'#]+)["']|<loc>\s*([^<\s]+)\s*<\/loc>)/gi,
  );
  for (const match of candidates) {
    const value = match[1] ?? match[2];
    const resolved = safeUrl(value?.replaceAll("&amp;", "&"), base.href);
    if (!resolved) continue;
    let url;
    try {
      url = validateDealerUrl(resolved);
    } catch {
      continue;
    }
    if (comparableHostname(url.hostname) !== comparableHostname(base.hostname)) continue;
    const normalized = modelSlug(url.pathname);
    const looksLikeVehicle = /[A-HJ-NPR-Z0-9]{17}/i.test(url.href) ||
      /(?:viewdetails|vehicle-details|vehicle\/|inventory\/.*(?:new|used)|\/(?:new|used)-)/i.test(url.pathname);
    if (!looksLikeVehicle) continue;
    const target = !modelNeedle || normalized.includes(modelNeedle)
      ? modelLinks
      : fallbackLinks;
    if (!target.includes(url.href)) target.push(url.href);
  }
  return [...modelLinks, ...fallbackLinks].slice(0, limit);
}

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
      name: clean(vehicle.name) || null,
      year: Number(vehicle.vehicleModelDate ?? vehicle.productionDate) || null,
      make: clean(text(vehicle.brand) ?? text(vehicle.manufacturer)) || null,
      model: clean(vehicle.model) || null,
      trim: inferTrim(vehicle),
      condition: /used|pre-owned/i.test(clean(offer.itemCondition ?? vehicle.itemCondition)) ? "Used" :
        /certified|cpo/i.test(clean(offer.itemCondition ?? vehicle.itemCondition)) ? "CPO" : "New",
      bodyStyle: clean(vehicle.bodyType) || null,
      powertrain: powertrainDescription(vehicle),
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
const modelTokens = (value) => key(value)
  .replace(/\b(?:mercedes[- ]benz|class)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .split(/\s+/)
  .filter(Boolean);
const containsTokenSequence = (tokens, expected) => {
  if (!tokens.length || !expected.length || expected.length > tokens.length) return false;
  return tokens.some((_, index) =>
    expected.every((token, offset) => tokens[index + offset] === token));
};
const categorical = (field, value) => {
  const normalized = key(value);
  if (field === "powertrain") {
    if (/plug.?in|phev/.test(normalized)) return "plug-in hybrid";
    if (/\bhybrid\b|\bhev\b/.test(normalized)) return "hybrid";
    if (/electric|\bev\b/.test(normalized)) return "electric";
    if (/diesel/.test(normalized)) return "diesel";
    if (/gasoline|gas fuel|petrol/.test(normalized)) return "gasoline";
  }
  if (field === "drivetrain") {
    if (/all.?wheel|\bawd\b/.test(normalized)) return "awd";
    if (/front.?wheel|\bfwd\b/.test(normalized)) return "fwd";
    if (/rear.?wheel|\brwd\b/.test(normalized)) return "rwd";
    if (/four.?wheel|\b4wd\b|\b4x4\b/.test(normalized)) return "4wd";
  }
  if (field === "status") {
    if (/in.?stock|dealer stock|available now/.test(normalized)) return "in stock";
    if (/in.?transit|en route|in route/.test(normalized)) return "in transit";
    if (/incoming/.test(normalized)) return "incoming";
    if (/on.?order|factory order|pre.?order/.test(normalized)) return "on order";
  }
  return normalized;
};
const matches = (field, value, expected) => {
  if (field === "yearMin") return value >= expected;
  if (field === "yearMax" || field === "priceMax" || field === "mileageMax") return value <= expected;
  if (field === "model") {
    const actualModel = modelTokens(value);
    const expectedModel = modelTokens(expected);
    return containsTokenSequence(actualModel, expectedModel) ||
      containsTokenSequence(expectedModel, actualModel);
  }
  if (["condition", "trim", "drivetrain", "powertrain", "status"].includes(field)) {
    return categorical(field, value) === categorical(field, expected);
  }
  return key(value).includes(key(expected));
};

const modelMatchesVehicleName = (vehicle, expected) => {
  const expectedToken = modelTokens(expected)[0];
  const nameTokens = new Set(modelTokens(vehicle.name));
  return !expectedToken || !vehicle.name || nameTokens.has(expectedToken);
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
      } else if (matches(field, value, preference.value) &&
          (field !== "model" || modelMatchesVehicleName(vehicle, preference.value))) {
        score += preference.required ? 100 : 20;
      }
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
    if (key(dealer.brand) === "audi") {
      try {
        const audiVehicles = await fetchAudiVehicles(
          dealer,
          { model: query?.filters?.model?.value },
          controller.signal,
        );
        if (audiVehicles) {
          const ranked = rank(audiVehicles, query.filters, query.allowRequiredViolations);
          return { exact: ranked.filter((item) => item.exact), close: ranked.filter((item) => !item.exact) };
        }
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        // Fall through to the dealer's own site when Audi's central API is unavailable.
      }
    }
    if (key(dealer.brand).includes("mercedes")) {
      try {
        const mercedesVehicles = await fetchMercedesVehicles(
          dealer,
          { model: query?.filters?.model?.value },
          controller.signal,
        );
        if (mercedesVehicles) {
          const ranked = rank(mercedesVehicles, query.filters, query.allowRequiredViolations);
          return { exact: ranked.filter((item) => item.exact), close: ranked.filter((item) => !item.exact) };
        }
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        // Fall through to the dealer's own site if the official Mercedes inventory is unavailable.
      }
    }
    let lastError = null;
    let reachedDealer = false;
    const diagnostics = [];
    for (const candidate of inventoryCandidates(dealerUrl, query)) {
      try {
        const response = await fetch(candidate, {
          signal: controller.signal,
          redirect: "follow",
          headers:dealerHeaders(),
          cf: { cacheTtl: 300, cacheEverything: true },
        });
        const finalUrl = validateDealerUrl(response.url || candidate.href);
        if (comparableHostname(finalUrl.hostname) !== comparableHostname(dealerUrl.hostname)) {
          throw new Error("UNSAFE_REDIRECT");
        }
        if (response.status === 401 || response.status === 403 || response.status === 429) {
          throw new Error("BLOCKED_OR_CAPTCHA");
        }
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        reachedDealer = true;
        const contentLength = Number(response.headers.get("content-length") ?? 0);
        if (contentLength > 2_000_000) throw new Error("DEALER_RESPONSE_TOO_LARGE");
        const html = await response.text();
        let vehicles = await fetchDealerOnVehicles(
          html, finalUrl, dealer, query, controller.signal,
        );
        if (!vehicles) vehicles = await fetchDealerVenomVehicles(
          html, dealer, query, controller.signal,
        );
        if (!vehicles) vehicles = extractVehicles(html, dealer);
        if (!vehicles.length) vehicles = extractEmbeddedVehicles(html, dealer);
        if (!vehicles.length) vehicles = extractJazelVehicles(html, dealer);
        if (!vehicles.length && /search-tango\.jazelc\.com|jzl-auto5-products/i.test(html)) {
          const make = clean(query?.filters?.make?.value);
          const model = clean(query?.filters?.model?.value);
          if (make && model) {
            const jazelUrl = new URL(
              `/inventory/new-vehicles/models-${encodeURIComponent(make)}-${encodeURIComponent(jazelModelSegment(model))}/`,
              dealerUrl.origin,
            );
            const jazelResponse = await fetch(jazelUrl, {
              signal:controller.signal, redirect:"follow", headers:dealerHeaders(),
              cf:{ cacheTtl:300, cacheEverything:true },
            });
            const finalJazelUrl = validateDealerUrl(jazelResponse.url || jazelUrl.href);
            if (jazelResponse.ok &&
                comparableHostname(finalJazelUrl.hostname) === comparableHostname(dealerUrl.hostname)) {
              const jazelLength = Number(jazelResponse.headers.get("content-length") ?? 0);
              if (jazelLength <= 2_000_000) {
                vehicles = extractJazelVehicles(await jazelResponse.text(), dealer);
              }
            }
          }
        }
        if (!vehicles.length && finalUrl.pathname.startsWith("/llm/inventory")) {
          vehicles = extractLlmVehicles(html, dealer, query);
        }
        if (query?.debug) diagnostics.push({
          candidate:candidate.href, final:finalUrl.href, status:response.status,
          bytes:html.length, hasVin:/\bVIN\s*:/i.test(html),
          hasJson:/application\/(?:ld\+)?json/i.test(html), vehicles:vehicles.length,
        });
        if (!vehicles.length) {
          const detailLinks = extractVehicleLinks(
            html,
            finalUrl.href,
            query?.filters?.model?.value,
            8,
          );
          const discovered = await Promise.all(detailLinks.map(async (href) => {
            try {
              const detailResponse = await fetch(href, {
                signal: controller.signal,
                redirect: "follow",
                headers:dealerHeaders(),
                cf: { cacheTtl: 300, cacheEverything: true },
              });
              const detailUrl = validateDealerUrl(detailResponse.url || href);
              if (!detailResponse.ok ||
                  comparableHostname(detailUrl.hostname) !== comparableHostname(dealerUrl.hostname)) return [];
              const detailLength = Number(detailResponse.headers.get("content-length") ?? 0);
              if (detailLength > 2_000_000) return [];
              return extractVehicles(await detailResponse.text(), dealer);
            } catch {
              return [];
            }
          }));
          const seenVehicles = new Set();
          vehicles = discovered.flat().filter((vehicle) => {
            const keyValue = vehicle.vin || `${vehicle.stockNumber || ""}|${vehicle.url || ""}`;
            if (!keyValue || seenVehicles.has(keyValue)) return false;
            seenVehicles.add(keyValue);
            return true;
          });
        }
        if (!vehicles.length) continue;
        const incomplete = vehicles
          .filter((vehicle) => vehicle.url && (!vehicle.powertrain || !vehicle.trim))
          .slice(0, 6);
        await Promise.all(incomplete.map(async (vehicle) => {
          try {
            const detailUrl = validateDealerUrl(vehicle.url);
            if (comparableHostname(detailUrl.hostname) !== comparableHostname(dealerUrl.hostname)) return;
            const detailResponse = await fetch(detailUrl, {
              signal: controller.signal,
              redirect: "follow",
              headers:dealerHeaders(),
              cf: { cacheTtl: 300, cacheEverything: true },
            });
            const finalDetailUrl = validateDealerUrl(detailResponse.url || detailUrl.href);
            if (!detailResponse.ok ||
                comparableHostname(finalDetailUrl.hostname) !== comparableHostname(dealerUrl.hostname)) return;
            const contentLength = Number(detailResponse.headers.get("content-length") ?? 0);
            if (contentLength > 2_000_000) return;
            const detailed = extractVehicles(await detailResponse.text(), dealer)
              .find((candidate) =>
                (vehicle.vin && candidate.vin === vehicle.vin) ||
                (vehicle.stockNumber && candidate.stockNumber === vehicle.stockNumber));
            if (!detailed) return;
            for (const field of ["trim", "powertrain", "drivetrain", "exteriorColor", "status"]) {
              if (!vehicle[field] && detailed[field]) vehicle[field] = detailed[field];
            }
            if (detailed.name && (!vehicle.name || detailed.name.length > vehicle.name.length)) {
              vehicle.name = detailed.name;
            }
          } catch { /* keep the inventory-page data when a detail page is unavailable */ }
        }));
        const ranked = rank(vehicles, query.filters, query.allowRequiredViolations);
        return { exact: ranked.filter((item) => item.exact), close: ranked.filter((item) => !item.exact), diagnostics };
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        if (query?.debug) diagnostics.push({ candidate:candidate.href, error:String(error?.message || error) });
        lastError = error;
      }
    }
    if (lastError?.message === "BLOCKED_OR_CAPTCHA") {
      if (query?.debug) lastError.diagnostics = diagnostics;
      throw lastError;
    }
    if (!reachedDealer && lastError) {
      if (query?.debug) lastError.diagnostics = diagnostics;
      throw lastError;
    }
    const unreadable = new Error("INVENTORY_NOT_READABLE");
    if (query?.debug) unreadable.diagnostics = diagnostics;
    throw unreadable;
  } finally {
    clearTimeout(timer);
  }
}
import { fetchAudiVehicles } from "./audi.js";
import { fetchMercedesVehicles } from "./mercedes.js";
