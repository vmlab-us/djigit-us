import { describe, expect, it } from "vitest";
import { curatedModels, selectCurrentModels } from "../src/index.js";

describe("Current US model catalog", () => {
  it("uses a curated list for every supported dealer brand", () => {
    expect(Object.keys(curatedModels)).toHaveLength(25);
    for (const models of Object.values(curatedModels)) {
      expect(models.length).toBeGreaterThan(0);
      expect(models).toEqual([...new Set(models)]);
    }
  });

  it("never exposes NHTSA motorcycle and commercial chassis names", () => {
    const models = selectCurrentModels("Honda", [
      "Accord", "Civic", "CR-V", "HR-V", "Odyssey", "Passport", "Pilot", "Prologue", "Ridgeline",
      "CRF110F", "CRF450R", "FourTrax Foreman Rubicon", "Gold Wing Tour", "Grom", "NT1100",
    ]);
    expect(models).toEqual([
      "Accord", "Civic", "CR-V", "HR-V", "Odyssey", "Passport", "Pilot", "Prologue", "Ridgeline",
    ]);
  });

  it("falls back to the US retail lineup when NHTSA naming is incomplete", () => {
    expect(selectCurrentModels("Mercedes-Benz", ["GLB-Class"])).toEqual(
      [...curatedModels["Mercedes-Benz"]].sort((a,b)=>a.localeCompare(b,"en",{sensitivity:"base"})),
    );
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
