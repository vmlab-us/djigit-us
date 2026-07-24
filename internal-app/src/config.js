const integer = (name, fallback, min, max) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid server configuration: ${name}`);
  }
  return value;
};

export function loadConfig() {
  return {
    port: integer("PORT", 8787, 1, 65535),
    spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "",
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "",
    serviceAccountPrivateKey: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    authProvider: process.env.AUTH_PROVIDER ?? "cloudflare-access",
    cloudflareTeamDomain: process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN ?? "",
    cloudflareAud: process.env.CLOUDFLARE_ACCESS_AUD ?? "",
    allowedEmails: new Set(
      (process.env.DEALER_INVENTORY_ALLOWED_EMAILS ?? "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
    dealerTimeoutMs: integer("DEALER_TIMEOUT_MS", 15000, 1000, 30000),
    searchTimeoutMs: integer("SEARCH_TIMEOUT_MS", 90000, 10000, 120000),
    maxSearchTimeoutMs: integer("MAX_SEARCH_TIMEOUT_MS", 120000, 10000, 120000),
    maxConcurrency: integer("MAX_CONCURRENCY", 5, 1, 10),
    dealerCacheTtlMs: integer("DEALER_CACHE_TTL_MS", 1200000, 60000, 1800000),
    searchCacheTtlMs: integer("SEARCH_CACHE_TTL_MS", 300000, 0, 600000),
  };
}
