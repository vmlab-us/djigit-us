import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { createAuthorization } from "./auth.js";
import { createDealerDirectory } from "./dealers.js";
import { createSearchManager, publicSearch } from "./search.js";
import { prepareSearchQuery } from "./schema.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const noIndex = "noindex, nofollow, noarchive, nosnippet";

export function createApp(config, dependencies = {}) {
  const app = express();
  const authorize = dependencies.authorize ?? createAuthorization(config);
  const directory = dependencies.directory ?? createDealerDirectory(config);
  const searches = dependencies.searches ?? createSearchManager(config, directory);

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false, referrerPolicy: { policy: "no-referrer" } }));
  app.use((req, res, next) => {
    res.set("X-Robots-Tag", noIndex);
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "32kb" }));

  app.get("/healthz", (_req, res) => res.json({ ok: true }));
  app.use("/internal/dealer-inventory", authorize);
  app.use("/api/internal", authorize);
  app.use("/internal/dealer-inventory/assets", express.static(path.join(dirname, "../public"), {
    fallthrough: false, immutable: true, maxAge: "1h",
  }));
  app.get("/internal/dealer-inventory", (_req, res) =>
    res.sendFile("index.html", { root: path.resolve(dirname, "../public") }));

  app.get("/api/internal/dealers", async (req, res, next) => {
    try {
      const data = await directory.load({ force: req.query.refresh === "1" });
      res.json(data);
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/internal/inventory/search", async (req, res, next) => {
    try {
      const query = prepareSearchQuery(req.body);
      const search = await searches.start(query, req.user);
      res.status(202).json(publicSearch(search));
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/internal/inventory/search/:id", (req, res) => {
    const search = searches.get(req.params.id);
    if (!search || search.owner !== req.user.email) return res.status(404).json({ error: "Поиск не найден." });
    res.json(publicSearch(search));
  });
  app.post("/api/internal/inventory/search/:id/cancel", (req, res) => {
    const search = searches.get(req.params.id);
    if (!search || search.owner !== req.user.email) return res.status(404).json({ error: "Поиск не найден." });
    searches.cancel(req.params.id);
    res.json(publicSearch(searches.get(req.params.id)));
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: "Проверьте параметры поиска.", fields: error.issues.map((i) => i.path.join(".")) });
    }
    if (error?.message === "DEALER_DIRECTORY_NOT_CONFIGURED") {
      return res.status(503).json({ error: "Справочник дилеров ещё не подключён." });
    }
    console.error("Internal inventory error", { name: error?.name, message: error?.message });
    res.status(503).json({ error: "Сервис временно недоступен. Попробуйте позже." });
  });
  return app;
}
