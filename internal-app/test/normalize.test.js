import { describe, expect, it } from "vitest";
import { normalizeDealerName, normalizeDrivetrain, normalizePrice, normalizeVehicle } from "../src/normalize.js";

describe("normalization", () => {
  it("normalizes dealer punctuation and whitespace deterministically", () => {
    expect(normalizeDealerName("  Bob’s  Toyota — North ")).toBe("bob's toyota - north");
  });
  it("normalizes prices and drivetrains", () => {
    expect(normalizePrice("$40,995")).toBe(40995);
    expect(normalizeDrivetrain("All Wheel Drive")).toBe("AWD");
  });
  it("does not invent missing vehicle fields", () => {
    const vehicle = normalizeVehicle({ make: "Toyota", model: "RAV4" }, { id: "d1" });
    expect(vehicle.price).toBeNull();
    expect(vehicle.vin).toBeNull();
  });
});
