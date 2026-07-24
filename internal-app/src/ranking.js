import { keyText } from "./normalize.js";

const same = (left, right) => keyText(left) === keyText(right);
const includes = (left, right) => keyText(left).includes(keyText(right));

const checks = {
  make: (v, q) => same(v.make, q.value),
  model: (v, q) => includes(v.model, q.value) || includes(q.value, v.model),
  trim: (v, q) => same(v.trim, q.value),
  condition: (v, q) => same(v.condition, q.value),
  drivetrain: (v, q) => same(v.drivetrain, q.value),
  powertrain: (v, q) => includes(v.powertrain, q.value),
  exteriorColor: (v, q) => includes(v.exteriorColor, q.value),
  interiorColor: (v, q) => includes(v.interiorColor, q.value),
  status: (v, q) => same(v.status, q.value),
  yearMin: (v, q) => v.year !== null && v.year >= q.value,
  yearMax: (v, q) => v.year !== null && v.year <= q.value,
  priceMin: (v, q) => (v.price ?? v.msrp) !== null && (v.price ?? v.msrp) >= q.value,
  priceMax: (v, q) => (v.price ?? v.msrp) !== null && (v.price ?? v.msrp) <= q.value,
  mileageMax: (v, q) => v.mileage !== null && v.mileage <= q.value,
};

const labels = {
  make: "Марка", model: "Модель", trim: "Trim", condition: "Состояние",
  drivetrain: "Привод", powertrain: "Силовая установка",
  exteriorColor: "Цвет кузова", interiorColor: "Цвет салона",
  status: "Наличие", yearMin: "Минимальный год", yearMax: "Максимальный год",
  priceMin: "Минимальная цена", priceMax: "Максимальная цена",
  mileageMax: "Максимальный пробег",
};

const actualValue = (vehicle, field) => {
  if (field === "yearMin" || field === "yearMax") return vehicle.year;
  if (field === "priceMin" || field === "priceMax") return vehicle.price ?? vehicle.msrp;
  if (field === "mileageMax") return vehicle.mileage;
  return vehicle[field];
};

export function rankVehicle(vehicle, filters, { allowRequiredViolations = false } = {}) {
  const explanations = [];
  let score = 0;
  let exact = true;
  for (const [field, preference] of Object.entries(filters)) {
    if (!preference || preference.value === "" || preference.value === null || !checks[field]) continue;
    const actual = actualValue(vehicle, field);
    if (actual === null || actual === undefined || actual === "") {
      exact = false;
      explanations.push(`${labels[field]}: не удалось проверить`);
      if (preference.required && !allowRequiredViolations) return null;
      continue;
    }
    if (checks[field](vehicle, preference)) {
      score += preference.required ? 100 : 20;
    } else {
      exact = false;
      explanations.push(`${labels[field]}: ${actual} вместо ${preference.value}`);
      if (preference.required && !allowRequiredViolations) return null;
      score -= preference.required ? 100 : 20;
    }
  }
  return { vehicle, exact, score, explanations };
}

export function rankVehicles(vehicles, query) {
  const ranked = vehicles
    .map((vehicle) => rankVehicle(vehicle, query.filters, query))
    .filter(Boolean)
    .sort((a, b) =>
      Number(b.exact) - Number(a.exact) ||
      b.score - a.score ||
      Number(b.vehicle.status === "In Stock") - Number(a.vehicle.status === "In Stock") ||
      Number(Boolean(b.vehicle.dealer?.fleet)) - Number(Boolean(a.vehicle.dealer?.fleet)) ||
      (a.vehicle.dealer?.distanceMiles ?? Infinity) - (b.vehicle.dealer?.distanceMiles ?? Infinity) ||
      (a.vehicle.price ?? a.vehicle.msrp ?? Infinity) - (b.vehicle.price ?? b.vehicle.msrp ?? Infinity)
    );
  return {
    exact: ranked.filter((item) => item.exact),
    close: ranked.filter((item) => !item.exact),
  };
}

export function deduplicateVehicles(vehicles) {
  const seen = new Set();
  return vehicles.filter((vehicle) => {
    const key = vehicle.vin
      ? `vin:${vehicle.vin}`
      : `fallback:${vehicle.dealer?.id}:${vehicle.stockNumber ?? ""}:${vehicle.url ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
