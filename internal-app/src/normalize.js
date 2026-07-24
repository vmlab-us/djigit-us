const DASHES = /[\u2010-\u2015\u2212]/g;
const APOSTROPHES = /[\u2018\u2019\u02bc\u0060]/g;

export const cleanText = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .replace(DASHES, "-")
    .replace(APOSTROPHES, "'")
    .replace(/\s+/g, " ")
    .trim();

export const keyText = (value) => cleanText(value).toLocaleLowerCase("en-US");

export const normalizeDealerName = keyText;

export function normalizePrice(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function normalizeMileage(value) {
  const number = normalizePrice(value);
  return number === null ? null : Math.round(number);
}

export function normalizeDrivetrain(value) {
  const normalized = keyText(value).replace(/\s+/g, "");
  const aliases = new Map([
    ["allwheeldrive", "AWD"], ["awd", "AWD"],
    ["fourwheeldrive", "4WD"], ["4wd", "4WD"], ["4x4", "4WD"],
    ["frontwheeldrive", "FWD"], ["fwd", "FWD"],
    ["rearwheeldrive", "RWD"], ["rwd", "RWD"],
  ]);
  return aliases.get(normalized) ?? (cleanText(value) || null);
}

export function normalizeCondition(value) {
  const text = keyText(value);
  if (/\b(certified|cpo)\b/.test(text)) return "CPO";
  if (/\bused|pre-owned\b/.test(text)) return "Used";
  if (/\bnew\b/.test(text)) return "New";
  return cleanText(value) || null;
}

export function normalizeInventoryStatus(value) {
  const text = keyText(value);
  if (/in[\s-]?transit|arriving|on the way/.test(text)) return "In Transit";
  if (/in[\s-]?stock|available/.test(text)) return "In Stock";
  return cleanText(value) || null;
}

export function normalizeVehicle(raw, dealer, checkedAt = new Date().toISOString()) {
  return {
    year: Number(raw.year) || null,
    make: cleanText(raw.make) || null,
    model: cleanText(raw.model) || null,
    trim: cleanText(raw.trim) || null,
    condition: normalizeCondition(raw.condition),
    bodyStyle: cleanText(raw.bodyStyle) || null,
    powertrain: cleanText(raw.powertrain) || null,
    transmission: cleanText(raw.transmission) || null,
    drivetrain: normalizeDrivetrain(raw.drivetrain),
    exteriorColor: cleanText(raw.exteriorColor) || null,
    interiorColor: cleanText(raw.interiorColor) || null,
    vin: cleanText(raw.vin).toUpperCase() || null,
    stockNumber: cleanText(raw.stockNumber) || null,
    msrp: normalizePrice(raw.msrp),
    price: normalizePrice(raw.price),
    mileage: normalizeMileage(raw.mileage),
    status: normalizeInventoryStatus(raw.status),
    features: Array.isArray(raw.features) ? raw.features.map(cleanText).filter(Boolean) : [],
    imageUrl: raw.imageUrl || null,
    url: raw.url || null,
    raw: raw.raw ?? {},
    dealer,
    checkedAt,
  };
}
