import { expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const config = { dealerCacheTtlMs:1, maxConcurrency:1, maxSearchTimeoutMs:1000 };
const directory = { load:vi.fn().mockResolvedValue({dealers:[],loadedAtIso:new Date().toISOString()}) };
const searches = { start:vi.fn(),get:vi.fn(),cancel:vi.fn() };
const allow = (req,_res,next) => { req.user={email:"allowed@example.com"}; next(); };

it("protects both UI and internal API", async () => {
  const deny = (_req,res) => res.status(401).json({error:"Требуется вход."});
  const app = createApp(config,{authorize:deny,directory,searches});
  expect((await request(app).get("/internal/dealer-inventory")).status).toBe(401);
  expect((await request(app).get("/api/internal/dealers")).status).toBe(401);
});

it("returns noindex headers on the protected route", async () => {
  const app = createApp(config,{authorize:allow,directory,searches});
  const response = await request(app).get("/internal/dealer-inventory");
  expect(response.status).toBe(200);
  expect(response.headers["x-robots-tag"]).toContain("noindex");
  expect(response.text).toContain('content="noindex,nofollow,noarchive,nosnippet"');
});

it("does not expose technical errors", async () => {
  const broken = {load:vi.fn().mockRejectedValue(new Error("secret stack detail"))};
  const app = createApp(config,{authorize:allow,directory:broken,searches});
  const response = await request(app).get("/api/internal/dealers");
  expect(response.status).toBe(503);
  expect(response.text).not.toContain("secret stack detail");
});
