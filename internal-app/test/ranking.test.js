import { describe, expect, it } from "vitest";
import { deduplicateVehicles, rankVehicle, rankVehicles } from "../src/ranking.js";

const vehicle = {
  make:"Toyota",model:"RAV4",trim:"XLE",condition:"New",powertrain:"Hybrid",
  drivetrain:"AWD",exteriorColor:"Red",year:2025,price:41900,status:"In Stock",
  vin:"ABC",dealer:{id:"d1",distanceMiles:10,fleet:{}},
};
const query = { filters:{
  make:{value:"Toyota",required:true},model:{value:"RAV4",required:true},
  exteriorColor:{value:"White",required:false},priceMax:{value:40000,required:false},
}};

describe("ranking", () => {
  it("rejects a required mismatch", () => {
    expect(rankVehicle(vehicle, { make:{value:"Honda",required:true} })).toBeNull();
  });
  it("explains close differences and keeps groups separate", () => {
    const ranked = rankVehicles([vehicle], query);
    expect(ranked.exact).toHaveLength(0);
    expect(ranked.close[0].explanations).toContain("Цвет кузова: Red вместо White");
    expect(ranked.close[0].explanations).toContain("Максимальная цена: 41900 вместо 40000");
  });
  it("deduplicates primarily by VIN", () => {
    expect(deduplicateVehicles([vehicle, {...vehicle,dealer:{id:"d2"}}])).toHaveLength(1);
  });
});
