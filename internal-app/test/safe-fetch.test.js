import { describe, expect, it, vi } from "vitest";
import { createSafeFetch, isBlockedAddress } from "../src/safe-fetch.js";

describe("SSRF protection", () => {
  it("blocks private and metadata addresses", () => {
    expect(isBlockedAddress("127.0.0.1")).toBe(true);
    expect(isBlockedAddress("169.254.169.254")).toBe(true);
    expect(isBlockedAddress("8.8.8.8")).toBe(false);
  });
  it("rejects arbitrary client-selected domains", async () => {
    const safeFetch = createSafeFetch({
      trustedHosts:new Set(["dealer.example"]),
      lookup:vi.fn(),fetchImpl:vi.fn(),
    });
    await expect(safeFetch("https://evil.example/cars")).rejects.toThrow("UNTRUSTED_DEALER_URL");
  });
  it("blocks a trusted hostname resolving to a private IP", async () => {
    const safeFetch = createSafeFetch({
      trustedHosts:new Set(["dealer.example"]),
      lookup:vi.fn().mockResolvedValue([{address:"10.0.0.2",family:4}]),
      fetchImpl:vi.fn(),
    });
    await expect(safeFetch("https://dealer.example/cars")).rejects.toThrow("BLOCKED_DEALER_ADDRESS");
  });
});
