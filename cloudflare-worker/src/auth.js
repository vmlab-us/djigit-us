const decoder = new TextDecoder();
const decodePart = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
};
const decodeJson = (value) => JSON.parse(decoder.decode(decodePart(value)));

let jwksCache = null;
let jwksExpires = 0;

async function getGoogleJwks() {
  if (jwksCache && Date.now() < jwksExpires) return jwksCache;
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", { cf: { cacheTtl: 3600 } });
  if (!response.ok) throw new Error("GOOGLE_JWKS_UNAVAILABLE");
  jwksCache = await response.json();
  jwksExpires = Date.now() + 3600_000;
  return jwksCache;
}

export async function authenticate(request, env) {
  if (!env.GOOGLE_OAUTH_CLIENT_ID) throw new Error("AUTH_NOT_CONFIGURED");
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const header = decodeJson(parts[0]);
  const payload = decodeJson(parts[1]);
  if (header.alg !== "RS256" || !header.kid) return null;
  const jwks = await getGoogleJwks();
  const jwk = jwks.keys?.find((key) => key.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey(
    "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", key, decodePart(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  const email = String(payload.email ?? "").toLowerCase();
  const validIssuer = payload.iss === "https://accounts.google.com" || payload.iss === "accounts.google.com";
  if (!valid || !validIssuer || payload.aud !== env.GOOGLE_OAUTH_CLIENT_ID ||
      payload.exp * 1000 <= Date.now() || payload.email_verified !== true ||
      email !== env.DEALER_INVENTORY_ALLOWED_EMAIL.toLowerCase()) return null;
  return { email, sub: payload.sub };
}
