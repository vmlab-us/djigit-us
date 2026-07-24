import { createRemoteJWKSet, jwtVerify } from "jose";

const bearerToken = (req) => {
  const accessJwt = req.get("cf-access-jwt-assertion");
  if (accessJwt) return accessJwt;
  const authorization = req.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
};

export function createAuthorization(config) {
  if (config.authProvider !== "cloudflare-access") {
    throw new Error("Unsupported AUTH_PROVIDER");
  }
  const issuer = config.cloudflareTeamDomain.replace(/\/+$/, "");
  const jwks = issuer ? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)) : null;

  return async function requirePermission(req, res, next) {
    try {
      if (!jwks || !config.cloudflareAud || config.allowedEmails.size === 0) {
        return res.status(503).json({ error: "Внутренний доступ ещё не настроен." });
      }
      const token = bearerToken(req);
      if (!token) return res.status(401).json({ error: "Требуется вход." });
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience: config.cloudflareAud,
      });
      const email = String(payload.email ?? "").toLowerCase();
      if (!email || !config.allowedEmails.has(email)) {
        return res.status(403).json({ error: "Нет разрешения dealer_inventory_search." });
      }
      req.user = { email, subject: payload.sub };
      next();
    } catch {
      res.status(401).json({ error: "Сессия недействительна или истекла." });
    }
  };
}
