import { describe, expect, it } from "vitest";
import { extractVehicles, rank, validateDealerUrl } from "../src/inventory.js";

const dealer = { id:"d1", name:"Dealer", website:"https://dealer.example", fleet:null };
const fixture = `<script type="application/ld+json">{
  "@context":"https://schema.org","@type":"Vehicle","vehicleModelDate":"2025",
  "brand":{"name":"Toyota"},"model":"RAV4","vehicleConfiguration":"XLE","fuelType":"Hybrid",
  "vehicleIdentificationNumber":"JT123","sku":"STK-9","color":"White",
  "offers":{"price":"39995","availability":"https://schema.org/InStock","url":"/vehicle/JT123"}
}</script>`;

describe("Worker inventory", () => {
  it("extracts normalized JSON-LD vehicles", () => {
    expect(extractVehicles(fixture,dealer)[0]).toMatchObject({
      year:2025,make:"Toyota",model:"RAV4",trim:"XLE",powertrain:"Hybrid",
      vin:"JT123",stockNumber:"STK-9",price:39995,status:"In Stock",
      url:"https://dealer.example/vehicle/JT123",
    });
  });
  it("infers trim from the vehicle name without drivetrain and transmission", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type":"Vehicle", name:"New 2026 Kia Sportage LX FWD Automatic",
      vehicleModelDate:"2026", brand:{name:"Kia"}, model:"Sportage",
      vehicleIdentificationNumber:"5XYK23DF0TG439927",
      fuelType:"Gasoline Fuel", offers:{price:"30485",availability:"InStock"},
    })}</script>`;
    expect(extractVehicles(html, dealer)[0]).toMatchObject({
      name:"New 2026 Kia Sportage LX FWD Automatic",
      trim:"LX", powertrain:"Gasoline Fuel",
    });
  });
  it("keeps exact and close matches deterministic", () => {
    const [vehicle]=extractVehicles(fixture,dealer);
    const [result]=rank([vehicle],{
      make:{value:"Toyota",required:true},model:{value:"RAV4",required:true},
      exteriorColor:{value:"Black",required:false},
    });
    expect(result.exact).toBe(false);
    expect(result.explanations[0]).toContain("White вместо Black");
  });
  it("rejects internal dealer URLs", () => {
    expect(()=>validateDealerUrl("http://dealer.example")).toThrow();
    expect(()=>validateDealerUrl("https://127.0.0.1/cars")).toThrow();
    expect(()=>validateDealerUrl("https://dealer.example/cars")).not.toThrow();
  });
  it("does not mistake a normal inventory page mentioning CAPTCHA for a challenge", () => {
    expect(extractVehicles(`${fixture}${" ".repeat(100_000)}captcha support`, dealer)).toHaveLength(1);
  });
});
