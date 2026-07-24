import { describe, expect, it } from "vitest";
import {
  extractVehicleLinks, extractVehicles, inventoryCandidates, rank, validateDealerUrl,
} from "../src/inventory.js";

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
      fuelType:"Gasoline Fuel", vehicleEngine:{name:"Regular Unleaded I-4 2.5 L/152"},
      offers:{price:"30485",availability:"InStock"},
    })}</script>`;
    expect(extractVehicles(html, dealer)[0]).toMatchObject({
      name:"New 2026 Kia Sportage LX FWD Automatic",
      trim:"LX", powertrain:"Gasoline",
    });
  });
  it("normalizes detailed powertrain descriptions to short categories", () => {
    const html = `<script type="application/ld+json">${JSON.stringify([
      {"@type":"Vehicle",name:"RAV4 Plug-in Hybrid XSE",brand:"Toyota",model:"RAV4",fuelType:"Gas/Electric Hybrid"},
      {"@type":"Vehicle",name:"Silverado",brand:"Chevrolet",model:"Silverado 1500",vehicleEngine:{name:"Turbo-Diesel 3.0L"}},
      {"@type":"Vehicle",name:"IONIQ 5 EV",brand:"Hyundai",model:"IONIQ 5"},
    ])}</script>`;
    expect(extractVehicles(html, dealer).map((vehicle) => vehicle.powertrain))
      .toEqual(["Plug-in Hybrid", "Diesel", "Electric"]);
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
  it("rejects a conflicting vehicle title even when a bad model field says GLB", () => {
    const base = {
      make:"Mercedes-Benz", model:"GLB-Class", year:2027, price:52655,
      condition:"New", dealer,
    };
    const filters = {
      make:{value:"Mercedes-Benz",required:true},
      model:{value:"GLB-Class",required:true},
    };
    expect(rank([{...base,name:"2027 Mercedes-Benz CLA 350"}],filters)).toEqual([]);
    expect(rank([{...base,name:"2026 Mercedes-Benz GLB 250 SUV"}],filters)).toHaveLength(1);
  });
  it("rejects internal dealer URLs", () => {
    expect(()=>validateDealerUrl("http://dealer.example")).toThrow();
    expect(()=>validateDealerUrl("https://127.0.0.1/cars")).toThrow();
    expect(()=>validateDealerUrl("https://dealer.example/cars")).not.toThrow();
  });
  it("tries model-specific and generic inventory pages before the dealer homepage", () => {
    const urls = inventoryCandidates(new URL("https://www.dealer.example/"), {
      filters: { make:{ value:"Subaru" }, model:{ value:"WRX" } },
    }).map((url) => url.href);
    expect(urls[0]).toBe("https://www.dealer.example/new-subaru/wrx.htm");
    expect(urls).toContain("https://www.dealer.example/new-inventory/index.htm");
    expect(urls).toContain("https://www.dealer.example/search/new/");
    expect(urls).toContain("https://www.dealer.example/sitemap.xml");
    expect(urls.at(-1)).toBe("https://www.dealer.example/");
    expect(new Set(urls).size).toBe(urls.length);
  });
  it("discovers same-host vehicle detail links from inventory HTML and sitemaps", () => {
    const html = `
      <a href="/viewdetails/new/JT123456789012345/2026-toyota-rav4-xle">RAV4</a>
      <loc>https://www.dealer.example/new-toyota/rav4/JT999999999999999</loc>
      <a href="https://outside.example/viewdetails/new/JT000000000000000/rav4">Outside</a>`;
    expect(extractVehicleLinks(html,"https://www.dealer.example/","RAV4")).toEqual([
      "https://www.dealer.example/viewdetails/new/JT123456789012345/2026-toyota-rav4-xle",
      "https://www.dealer.example/new-toyota/rav4/JT999999999999999",
    ]);
  });
  it("does not mistake a normal inventory page mentioning CAPTCHA for a challenge", () => {
    expect(extractVehicles(`${fixture}${" ".repeat(100_000)}captcha support`, dealer)).toHaveLength(1);
  });
});
