import { authenticate } from "./auth.js";
import { readDirectory } from "./google.js";
import { searchDealer } from "./inventory.js";

const securityHeaders = {
  "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
const json = (body, status = 200) => Response.json(body, { status, headers: securityHeaders });
const fallbackModels = {
  Acura:["ADX","Integra","TLX","RDX","MDX","ZDX"],
  Audi:["A3","A4","A5","A6","A7","A8","Q3","Q4 e-tron","Q5","Q6 e-tron","Q7","Q8","e-tron GT"],
  BMW:["2 Series","3 Series","4 Series","5 Series","7 Series","8 Series","i4","i5","i7","iX","X1","X2","X3","X4","X5","X6","X7","XM","Z4"],
  Buick:["Enclave","Encore GX","Envision","Envista"],
  Cadillac:["CT4","CT5","Escalade","Escalade IQ","LYRIQ","OPTIQ","XT4","XT5","XT6"],
  Chevrolet:["Blazer","Blazer EV","Bolt EV","Bolt EUV","Colorado","Corvette","Equinox","Equinox EV","Express","Malibu","Silverado 1500","Silverado 2500HD","Silverado 3500HD","Silverado EV","Suburban","Tahoe","Trailblazer","Traverse","Trax"],
  Chrysler:["300","Pacifica","Pacifica Hybrid","Voyager"],
  Dodge:["Challenger","Charger","Durango","Hornet"],
  Ford:["Bronco","Bronco Sport","E-Transit","Edge","Escape","Expedition","Explorer","F-150","F-150 Lightning","Maverick","Mustang","Mustang Mach-E","Ranger","Super Duty","Transit"],
  GMC:["Acadia","Canyon","Hummer EV","Savana","Sierra 1500","Sierra 2500HD","Sierra 3500HD","Terrain","Yukon","Yukon XL"],
  Honda:["Accord","Civic","CR-V","HR-V","Odyssey","Passport","Pilot","Prologue","Ridgeline"],
  Hyundai:["Elantra","Ioniq 5","Ioniq 6","Kona","Palisade","Santa Cruz","Santa Fe","Sonata","Tucson","Venue"],
  Jeep:["Cherokee","Compass","Gladiator","Grand Cherokee","Grand Cherokee L","Grand Wagoneer","Recon","Renegade","Wagoneer","Wagoneer S","Wrangler"],
  Kia:["Carnival","EV6","EV9","Forte","K4","K5","Niro","Seltos","Sorento","Soul","Sportage","Stinger","Telluride"],
  Lexus:["ES","GX","IS","LC","LS","LX","NX","RC","RX","RZ","TX","UX"],
  Mazda:["CX-30","CX-5","CX-50","CX-70","CX-90","Mazda3","MX-5 Miata"],
  "Mercedes-Benz":["A-Class","C-Class","CLA","CLE","E-Class","EQA","EQB","EQE","EQS","G-Class","GLA","GLB","GLC","GLE","GLS","Metris","S-Class","Sprinter"],
  Nissan:["Altima","Ariya","Armada","Frontier","GT-R","Kicks","Leaf","Murano","Pathfinder","Rogue","Sentra","Titan","Versa","Z"],
  Porsche:["718","911","Cayenne","Macan","Panamera","Taycan"],
  Ram:["1500","1500 Classic","2500","3500","ProMaster","ProMaster City"],
  Subaru:["Ascent","BRZ","Crosstrek","Forester","Impreza","Legacy","Outback","Solterra","WRX"],
  Tesla:["Cybertruck","Model 3","Model S","Model X","Model Y"],
  Toyota:["4Runner","bZ4X","Camry","Corolla","Corolla Cross","Crown","Crown Signia","GR86","Grand Highlander","Highlander","Land Cruiser","Mirai","Prius","RAV4","Sequoia","Sienna","Tacoma","Tundra","Venza"],
  Volkswagen:["Arteon","Atlas","Atlas Cross Sport","Golf GTI","Golf R","ID.4","ID. Buzz","Jetta","Taos","Tiguan"],
  Volvo:["C40 Recharge","EC40","EX30","EX40","EX90","S60","S90","V60","V90","XC40","XC60","XC90"],
};
const withHeaders = (response) => {
  const result = new Response(response.body, response);
  Object.entries(securityHeaders).forEach(([name, value]) => result.headers.set(name, value));
  return result;
};

const validQuery = (input) => {
  if (!input || typeof input !== "object" || !input.filters || typeof input.filters !== "object") return false;
  const make = input.filters.make?.value, model = input.filters.model?.value;
  return typeof make === "string" && make.trim() && typeof model === "string" && model.trim();
};

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: securityHeaders });
      if (url.pathname === "/api/auth/config" && request.method === "GET") {
        return json({ clientId: env.GOOGLE_OAUTH_CLIENT_ID || null });
      }
      if (!url.pathname.startsWith("/api/")) {
        const assetPath = url.pathname === "/internal/dealer-inventory"
          ? "/index.html"
          : url.pathname.replace(/^\/internal\/dealer-inventory\/assets\//, "/");
        const assetUrl = new URL(assetPath, url);
        return withHeaders(await env.ASSETS.fetch(new Request(assetUrl, request)));
      }
      const user = await authenticate(request, env);
      if (!user) return json({ error: "Требуется вход с разрешённого адреса." }, 401);
      if (url.pathname === "/api/internal/dealers" && request.method === "GET") {
        return json(await readDirectory(env, url.searchParams.get("refresh") === "1"));
      }
      if (url.pathname === "/api/internal/models" && request.method === "GET") {
        const make = url.searchParams.get("make")?.trim();
        if (!make || make.length > 60) return json({ error: "Укажите марку." }, 400);
        const cacheKey = new Request(`https://cache.internal/models/${encodeURIComponent(make.toLowerCase())}`);
        const cached = await caches.default.match(cacheKey);
        if (cached) return withHeaders(cached);
        let data = null;
        for (let attempt = 0; attempt < 2 && !data; attempt += 1) {
          try {
            const response = await fetch(
              `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMake/${encodeURIComponent(make)}?format=json`,
              { headers: { accept: "application/json" }, cf: { cacheTtl: 86400 } },
            );
            if (response.ok) data = await response.json();
          } catch { /* fall back to the embedded current-model list */ }
        }
        const official = (data?.Results ?? [])
          .map((item) => String(item.Model_Name ?? "").trim()).filter(Boolean);
        const fallback = fallbackModels[make] ?? [];
        const models = [...new Set([...official, ...fallback])]
          .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
        if (!models.length) return json({ error: "Для этой марки модели не найдены." }, 404);
        const result = Response.json({ make, models }, { headers: { "cache-control": "public,max-age=86400" } });
        await caches.default.put(cacheKey, result.clone());
        return withHeaders(result);
      }
      if (url.pathname === "/api/internal/inventory/dealer-search" && request.method === "POST") {
        const body = await request.json();
        if (!body?.dealerId || !validQuery(body.query)) return json({ error: "Проверьте марку и модель." }, 400);
        const { dealers } = await readDirectory(env);
        const dealer = dealers.find((item) => item.id === body.dealerId);
        if (!dealer) return json({ error: "Дилер не найден в доверенном справочнике." }, 404);
        if (!dealer.brand.toLowerCase().includes(body.query.filters.make.value.toLowerCase())) {
          return json({ error: "Дилер не соответствует марке." }, 400);
        }
        return json({ dealerId: dealer.id, ...(await searchDealer(dealer, body.query)) });
      }
      if (url.pathname.startsWith("/api/")) return json({ error: "Не найдено." }, 404);
    } catch (error) {
      console.error("dealer-inventory", { name: error?.name, code: String(error?.message ?? "").slice(0, 40) });
      const message = error?.message === "SHEETS_NOT_CONFIGURED" ? "Google Sheet ещё не подключена." :
        error?.message === "SHEETS_READ_FAILED" ? "Не удалось прочитать справочник дилеров." :
        error?.name === "AbortError" ? "Сайт дилера не ответил вовремя." :
        error?.message === "BLOCKED_OR_CAPTCHA" ? "Сайт заблокирован или требует CAPTCHA." :
        "Не удалось проверить дилера.";
      return json({ error: message }, 503);
    }
  },
};
