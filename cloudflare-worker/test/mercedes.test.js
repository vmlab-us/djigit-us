import { describe, expect, it } from "vitest";
import {
  mercedesClassCode, mercedesDealerCode, normalizeMercedesVehicles,
} from "../src/mercedes.js";

describe("Mercedes-Benz official inventory", () => {
  it("maps our dealer names and model labels to official IDs", () => {
    expect(mercedesDealerCode("Mercedes-Benz of Los Angeles")).toBe("05321");
    expect(mercedesDealerCode("Calstar Motors, Inc.")).toBe("05758");
    expect(mercedesClassCode("GLB-Class")).toBe("GLB");
  });

  it("normalizes official GLB records into inventory cards", () => {
    const dealer = {
      name:"Mercedes-Benz of Los Angeles",
      website:"https://www.mbzla.com",
    };
    const [vehicle] = normalizeMercedesVehicles([{
      type:"NEW", dealerId:"05321", classId:"GLB", className:"GLB",
      bodyStyleId:"SUV", bodyStyleName:"SUVs", modelId:"GLB250W",
      modelName:"GLB 250 SUV", year:"2026", msrp:46860,
      inventoryPrice:46860, vin:"W1N4M4GBXTW489246", available:true,
      fuelType:{name:"Gasoline"}, driveTrain:{name:"Automatic"},
      paint:{name:"Polar White"}, upholstery:{name:"Black MB-Tex"},
      stockId:"489246", dealer:{name:"Mercedes-Benz of Los Angeles"},
    }], dealer);
    expect(vehicle).toMatchObject({
      name:"2026 Mercedes-Benz GLB 250 SUV",
      model:"GLB", trim:"GLB 250 SUV", drivetrain:"FWD",
      powertrain:"Gasoline", condition:"New", price:46860,
      vin:"W1N4M4GBXTW489246", stockNumber:"489246",
    });
    expect(vehicle.url).toContain("/Mercedes-Benz-of-Los-Angeles/05321/GLB/SUV/GLB250W/");
  });
});
