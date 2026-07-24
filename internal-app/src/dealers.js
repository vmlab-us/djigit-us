import { google } from "googleapis";
import { cleanText, normalizeDealerName, normalizePrice } from "./normalize.js";

const DEALER_TAB = "Дилерские центры";
const FLEET_TAB = "Fleet-контакты";

const indexRows = (values = []) => {
  const [headers = [], ...rows] = values;
  return rows
    .filter((row) => row.some((value) => cleanText(value)))
    .map((row) => Object.fromEntries(headers.map((header, index) => [cleanText(header), row[index] ?? ""])));
};

const splitAligned = (value) =>
  String(value ?? "")
    .split(/\r?\n|;\s*(?=\d+[\).:-]?\s*)/)
    .map((part) => part.replace(/^\s*\d+[\).:-]?\s*/, "").trim())
    .filter(Boolean);

export function linkDealersAndFleet(dealerValues, fleetValues) {
  const fleetByName = new Map();
  for (const row of indexRows(fleetValues)) {
    const key = normalizeDealerName(row["Дилерский центр"]);
    if (!key) continue;
    const names = splitAligned(row["Fleet-контакты и должности"]);
    const phones = splitAligned(row["Прямые телефоны"]);
    const emails = splitAligned(row["Электронная почта"]);
    const contacts = Array.from({ length: Math.max(names.length, phones.length, emails.length) }, (_, i) => ({
      nameAndTitle: names[i] || null,
      phone: phones[i] || null,
      email: emails[i] || null,
    }));
    const record = {
      contacts,
      departmentPhone: cleanText(row["Телефон отдела / основной"]) || null,
      status: cleanText(row["Статус контакта"]) || null,
      notes: cleanText(row["Примечания"]) || null,
      sources: cleanText(row["Источники"]) || null,
    };
    const existing = fleetByName.get(key) ?? [];
    existing.push(record);
    fleetByName.set(key, existing);
  }

  return indexRows(dealerValues).map((row) => {
    const name = cleanText(row["Дилерский центр"]);
    const matches = fleetByName.get(normalizeDealerName(name)) ?? [];
    return {
      id: cleanText(row["ID дилера"]) || normalizeDealerName(name).replace(/[^a-z0-9]+/g, "-"),
      brand: cleanText(row["Бренд"]) || null,
      name,
      distanceMiles: normalizePrice(row["Расстояние (мили)"]),
      address: cleanText(row["Адрес / сведения из карточки"]) || null,
      phone: cleanText(row["Телефон"]) || null,
      website: cleanText(row["Веб-сайт"]) || null,
      mapsUrl: cleanText(row["Google Maps"]) || null,
      fleetStatus: cleanText(row["Статус fleet-направления"]) || null,
      verified: cleanText(row["Проверено"]) || null,
      notes: cleanText(row["Примечания"]) || null,
      fleet: matches.length === 1 ? matches[0] : null,
      fleetLinkStatus: matches.length === 1 ? "matched" : matches.length > 1 ? "ambiguous" : "unmatched",
    };
  });
}

export function createDealerDirectory(config) {
  let cache = null;
  const load = async ({ force = false } = {}) => {
    if (!force && cache && Date.now() - cache.loadedAt < config.dealerCacheTtlMs) return cache;
    if (!config.spreadsheetId || !config.serviceAccountEmail || !config.serviceAccountPrivateKey) {
      throw new Error("DEALER_DIRECTORY_NOT_CONFIGURED");
    }
    const auth = new google.auth.JWT({
      email: config.serviceAccountEmail,
      key: config.serviceAccountPrivateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: config.spreadsheetId,
      ranges: [`'${DEALER_TAB}'!A:K`, `'${FLEET_TAB}'!A:J`],
      valueRenderOption: "FORMATTED_VALUE",
    });
    const [dealerRange, fleetRange] = response.data.valueRanges ?? [];
    const dealers = linkDealersAndFleet(dealerRange?.values, fleetRange?.values);
    cache = { dealers, loadedAt: Date.now(), loadedAtIso: new Date().toISOString() };
    return cache;
  };
  return { load };
}
