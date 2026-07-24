import { describe, expect, it } from "vitest";
import {
  audiDealerCode, audiModelCode, normalizeAudiVehicles,
} from "../src/audi.js";

describe("Audi inventory fallback", () => {
  it("maps protected Audi dealers and current model names", () => {
    expect(audiDealerCode("Audi Van Nuys")).toBe("22A18");
    expect(audiDealerCode("Audi Santa Monica")).toBe("22A57");
    expect(audiModelCode("Q6 e-tron")).toBe("q6etron");
    expect(audiModelCode("e-tron GT")).toBe("etrongt");
  });

  it("normalizes Audi Omnigraph vehicles for the common ranking pipeline", () => {
    const dealer = { name: "Audi Van Nuys", website: "https://www.audivannuys.com/" };
    const vehicles = normalizeAudiVehicles([{
      stockCar: {
        vin: "WA1LVBF73TD008891",
        titleText: "2026 Audi Q7",
        subtitleText: "Premium Plus 55 TFSI® quattro® tiptronic®",
        driveText: "All-wheel drive",
        model: { salesModelyear: 2026 },
        carline: { id: "q7", name: "Q7" },
        carPrices: [
          { type: "list", price: { value: 78105 } },
          { type: "final", price: { value: 68285 } },
        ],
        salesInfo: { orderStatusText: "Dealer Stock" },
        colorInfo: { exteriorColor: { colorInfo: { text: "Glacier White metallic" } } },
        engineInfo: { fuel: { code: "B", text: "Gas" } },
        dynamicAttributes: [
          { id: "VEHICLE_ID", value: "TD008891" },
          { id: "URLAOA_AUDI", value: "https://www.audivannuys.com/en/inventory/vehicle/?vehicleId=WA1LVBF73TD008891" },
        ],
      },
    }], dealer);

    expect(vehicles[0]).toMatchObject({
      name: "2026 Audi Q7",
      year: 2026,
      make: "Audi",
      model: "Q7",
      trim: "Premium Plus 55",
      powertrain: "Gasoline",
      drivetrain: "All-wheel drive",
      stockNumber: "TD008891",
      price: 68285,
      msrp: 78105,
      status: "In Stock",
    });
  });
});
