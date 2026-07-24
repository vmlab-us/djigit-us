const encoder = new TextEncoder();
const decoder = new TextDecoder();
const base64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let tokenCache = null;

const pemBytes = (pem) => Uint8Array.from(
  atob(pem.replace(/-----(BEGIN|END) PRIVATE KEY-----|\s/g, "")),
  (char) => char.charCodeAt(0),
);

async function accessToken(env) {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error("SHEETS_NOT_CONFIGURED");
  const account = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64url(encoder.encode(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: account.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })));
  const key = await crypto.subtle.importKey(
    "pkcs8", pemBytes(account.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(`${header}.${claims}`));
  const assertion = `${header}.${claims}.${base64url(signature)}`;
  const response = await fetch(account.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error("SHEETS_AUTH_FAILED");
  const result = await response.json();
  tokenCache = { value: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 };
  return tokenCache.value;
}

export async function readDirectory(env, force = false) {
  const cache = caches.default;
  const cacheKey = new Request(`https://cache.internal/dealers/${env.GOOGLE_SHEETS_SPREADSHEET_ID}`);
  if (!force) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit.json();
  }
  const params = new URLSearchParams();
  params.append("ranges", "'Дилерские центры'!A:K");
  params.append("ranges", "'Fleet-контакты'!A:J");
  params.set("valueRenderOption", "FORMATTED_VALUE");
  const token = await accessToken(env);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.GOOGLE_SHEETS_SPREADSHEET_ID)}/values:batchGet?${params}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error("SHEETS_READ_FAILED");
  const data = await response.json();
  const directory = linkDirectory(data.valueRanges?.[0]?.values ?? [], data.valueRanges?.[1]?.values ?? []);
  const result = { dealers: directory, loadedAtIso: new Date().toISOString() };
  const cached = Response.json(result, { headers: { "cache-control": "public,max-age=1200" } });
  await cache.put(cacheKey, cached);
  return result;
}

const clean = (value) => String(value ?? "").normalize("NFKC")
  .replace(/[\u2010-\u2015\u2212]/g, "-").replace(/[\u2018\u2019\u02bc`]/g, "'")
  .replace(/\s+/g, " ").trim();
const keyText = (value) => clean(value).toLowerCase();
const rows = (values) => {
  const [headers = [], ...data] = values;
  return data.filter((row) => row.some(clean))
    .map((row) => Object.fromEntries(headers.map((header, i) => [clean(header), row[i] ?? ""])));
};
const number = (value) => {
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

export function linkDirectory(dealerValues, fleetValues) {
  const fleet = new Map();
  for (const row of rows(fleetValues)) {
    const key = keyText(row["Дилерский центр"]);
    const item = {
      nameAndTitle: clean(row["Fleet-контакты и должности"]) || null,
      phone: clean(row["Прямые телефоны"] || row["Телефон отдела / основной"]) || null,
      email: clean(row["Электронная почта"]) || null,
      status: clean(row["Статус контакта"]) || null,
    };
    fleet.set(key, [...(fleet.get(key) ?? []), item]);
  }
  return rows(dealerValues).map((row) => {
    const name = clean(row["Дилерский центр"]);
    const matches = fleet.get(keyText(name)) ?? [];
    return {
      id: clean(row["ID дилера"]) || keyText(name).replace(/[^a-z0-9]+/g, "-"),
      brand: clean(row["Бренд"]) || null, name,
      distanceMiles: number(row["Расстояние (мили)"]),
      address: clean(row["Адрес / сведения из карточки"]) || null,
      phone: clean(row["Телефон"]) || null,
      website: clean(row["Веб-сайт"]) || null,
      mapsUrl: clean(row["Google Maps"]) || null,
      fleet: matches.length === 1 ? matches[0] : null,
      fleetLinkStatus: matches.length === 1 ? "matched" : matches.length ? "ambiguous" : "unmatched",
    };
  });
}
