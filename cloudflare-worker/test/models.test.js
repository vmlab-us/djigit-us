import { describe, expect, it } from "vitest";
import { curatedModels } from "../src/index.js";

describe("Current US model catalog", () => {
  it("uses a curated list for every supported dealer brand", () => {
    expect(Object.keys(curatedModels)).toHaveLength(25);
    for (const models of Object.values(curatedModels)) {
      expect(models.length).toBeGreaterThan(0);
      expect(models).toEqual([...new Set(models)]);
    }
  });

  it("excludes representative discontinued models", () => {
    expect(curatedModels.Kia).not.toContain("Forte");
    expect(curatedModels.Kia).not.toContain("Stinger");
    expect(curatedModels.Chrysler).not.toContain("300");
    expect(curatedModels.Dodge).not.toContain("Challenger");
    expect(curatedModels.Ford).not.toContain("Edge");
    expect(curatedModels.Nissan).not.toContain("Titan");
    expect(curatedModels.Ram).not.toContain("ProMaster City");
    expect(curatedModels.Toyota).not.toContain("Venza");
    expect(curatedModels.Volkswagen).not.toContain("Arteon");
  });
});
