const endpoint = "https://nafta-service.mbusa.com/api/inv/v1/en_us/combined/vehicles/search";

const dealerCodeEntries = {
  "keyes european": "05400",
  "calstar": "05758",
  "calstar motors": "05758",
  "trophy mercedes-benz of encino": "05257",
  "mercedes-benz of encino": "05257",
  "mercedes-benz of beverly hills": "05421",
  "mercedes-benz of los angeles": "05321",
  "w.i. simonson": "05154",
  "mercedes-benz of calabasas": "05179",
  "mercedes-benz of arcadia": "05646",
  "mercedes-benz of valencia": "05322",
  "mercedes-benz of south bay": "05705",
  "mercedes-benz of thousand oaks": "05412",
  "mercedes-benz of west covina": "05327",
  "mercedes-benz of long beach": "05119",
  "house of imports": "05734",
  "mercedes-benz of anaheim": "05422",
  "mercedes-benz of anaheim hills": "05422",
};

const clean = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
const key = (value) => clean(value)
  .toLowerCase()
  .replace(/\b(?:llc|inc|motors)\b\.?/g, " ")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim();
const dealerCodes = new Map(Object.entries(dealerCodeEntries).map(([name, code]) => [key(name), code]));

export const mercedesDealerCode = (dealerName) => dealerCodes.get(key(dealerName)) ?? null;

export const mercedesClassCode = (model) => {
  const normalized = clean(model)
    .replace(/mercedes[- ]benz/gi, "")
    .replace(/-?class\b/gi, "")
    .trim()
    .toUpperCase();
  return normalized.split(/\s+/)[0] || null;
};

const drivetrain = (vehicle) => {
  const name = clean(vehicle.modelName).toUpperCase();
  if (/\b4MATIC\b/.test(name)) return "AWD";
  if (vehicle.classId === "GLB") return "FWD";
  return null;
};

const vehicleUrl = (vehicle) => {
  const dealerName = clean(vehicle.dealer?.name).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  if (!dealerName || !vehicle.dealerId || !vehicle.vin) return null;
  return [
    "https://www.mbusa.com/en/vehicles/inventory",
    dealerName,
    vehicle.dealerId,
    vehicle.classId,
    vehicle.bodyStyleId,
    vehicle.modelId,
    vehicle.vin,
  ].map((part, index) => index ? encodeURIComponent(part ?? "") : part).join("/");
};

export function normalizeMercedesVehicles(records, dealer, checkedAt = new Date().toISOString()) {
  return (records ?? []).filter(Boolean).map((vehicle) => ({
    name: clean(`${vehicle.year ?? ""} Mercedes-Benz ${vehicle.modelName ?? ""}`) || null,
    year: Number(vehicle.year) || null,
    make: "Mercedes-Benz",
    model: clean(vehicle.className ?? vehicle.classId) || null,
    trim: clean(vehicle.modelName) || null,
    condition: vehicle.type === "NEW" ? "New" : vehicle.usedVehicleAttributes?.certified ? "CPO" : "Used",
    bodyStyle: clean(vehicle.bodyStyleName) || null,
    powertrain: clean(vehicle.fuelType?.name ?? vehicle.usedVehicleAttributes?.fuelType?.text) || null,
    transmission: clean(vehicle.driveTrain?.name) || null,
    drivetrain: drivetrain(vehicle),
    exteriorColor: clean(vehicle.paint?.name) || null,
    interiorColor: clean(vehicle.upholstery?.name) || null,
    vin: clean(vehicle.vin).toUpperCase() || null,
    stockNumber: clean(vehicle.stockId ?? vehicle.usedVehicleAttributes?.stockId) || null,
    price: Number(vehicle.inventoryPrice ?? vehicle.msrp) || null,
    msrp: Number(vehicle.msrp) || null,
    mileage: Number(vehicle.usedVehicleAttributes?.mileage) || null,
    status: vehicle.available ? "In Stock" : null,
    features: [],
    imageUrl: vehicle.exteriorBaseImage?.desktop?.url ?? vehicle.exteriorBaseImage?.mobile?.url ?? null,
    url: vehicleUrl(vehicle) ?? dealer.website,
    checkedAt,
    dealer,
  })).filter((vehicle) => vehicle.vin && vehicle.model);
}

export async function fetchMercedesVehicles(dealer, search, signal) {
  const dealerId = mercedesDealerCode(dealer.name);
  const classCode = mercedesClassCode(search?.model);
  if (!dealerId || !classCode) return null;
  const url = new URL(endpoint);
  url.searchParams.set("dealerId", dealerId);
  url.searchParams.set("class", classCode);
  const response = await fetch(url, {
    signal,
    headers: {
      accept: "application/json",
      "accept-language": "en-US,en;q=0.8",
      referer: "https://www.mbusa.com/",
    },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!response.ok) throw new Error(`MERCEDES_API_${response.status}`);
  const result = await response.json();
  return normalizeMercedesVehicles(result?.result?.pagedVehicles?.records, dealer);
}
