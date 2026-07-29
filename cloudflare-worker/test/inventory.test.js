import { describe, expect, it } from "vitest";
import {
  extractDealerOnVehicles, extractDealerVenomVehicles, extractEmbeddedVehicles, extractLlmVehicles,
  extractJazelVehicles, extractVehicleLinks, extractVehicles,
  inventoryCandidates, rank, validateDealerUrl,
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
  it("treats a selected powertrain as a strict filter", () => {
    const vehicles = [
      { name:"2026 Cadillac Escalade Diesel", make:"Cadillac", model:"Escalade", powertrain:"Diesel", dealer },
      { name:"2026 Cadillac Escalade Gasoline", make:"Cadillac", model:"Escalade", powertrain:"Gasoline", dealer },
      { name:"2026 Cadillac Escalade PHEV", make:"Cadillac", model:"Escalade", powertrain:"Plug-in Hybrid", dealer },
      { name:"2026 Cadillac Escalade", make:"Cadillac", model:"Escalade", powertrain:null, dealer },
    ];
    const filters = {
      make:{value:"Cadillac",required:true}, model:{value:"Escalade",required:true},
      powertrain:{value:"Diesel",required:true},
    };
    expect(rank(vehicles, filters).map((item) => item.vehicle.powertrain)).toEqual(["Diesel"]);
  });
  it("does not mix hybrid with plug-in hybrid and applies availability strictly", () => {
    const vehicles = [
      { name:"RAV4 Hybrid", make:"Toyota", model:"RAV4", powertrain:"Hybrid", status:"In Stock", dealer },
      { name:"RAV4 Plug-in Hybrid", make:"Toyota", model:"RAV4", powertrain:"Plug-in Hybrid", status:"In Transit", dealer },
    ];
    const filters = {
      make:{value:"Toyota",required:true}, model:{value:"RAV4",required:true},
      powertrain:{value:"Hybrid",required:true}, status:{value:"In Stock",required:true},
    };
    expect(rank(vehicles, filters).map((item) => item.vehicle.name)).toEqual(["RAV4 Hybrid"]);
  });
  it("matches manufacturer paint names to the selected base color", () => {
    const vehicles = [
      { name:"Sportage", make:"Kia", model:"Sportage", exteriorColor:"Wolf Gray", dealer },
      { name:"Sportage", make:"Kia", model:"Sportage", exteriorColor:"Glacial White Pearl", dealer },
    ];
    const filters = {
      make:{value:"Kia",required:true}, model:{value:"Sportage",required:true},
      exteriorColor:{value:"Gray",required:true},
    };
    expect(rank(vehicles, filters).map((item) => item.vehicle.exteriorColor)).toEqual(["Wolf Gray"]);
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
  it("accepts model fields prefixed with the manufacturer name", () => {
    const vehicle = {
      name:"New 2026 Mazda Mazda CX-5 2.5 S AWD",
      make:"Mazda", model:"Mazda CX-5", condition:"New", dealer,
    };
    expect(rank([vehicle],{
      make:{value:"Mazda",required:true},
      model:{value:"CX-5",required:true},
    })).toHaveLength(1);
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
    expect(urls[0]).toBe("https://www.dealer.example/llm/inventory/?type=new");
    expect(urls).toContain("https://www.dealer.example/new-subaru/wrx.htm");
    expect(urls).toContain("https://www.dealer.example/new-inventory/index.htm");
    expect(urls).toContain("https://www.dealer.example/search/new/");
    expect(urls).toContain("https://www.dealer.example/sitemap.xml");
    expect(urls.at(-1)).toBe("https://www.dealer.example/");
    expect(new Set(urls).size).toBe(urls.length);
  });
  it("extracts the standardized dealer LLM inventory format", () => {
    const html = `<h1>New Vehicle Inventory</h1><ul><li><a href="/vehicle/1GNS5CKD6TR383056">
      2026 Chevrolet Suburban LT</a><p>New</p><p>0 miles</p><p>$76,830</p>
      <p>VIN: 1GNS5CKD6TR383056</p></li></ul>`;
    expect(extractLlmVehicles(html, {...dealer,brand:"Chevrolet"}, { filters:{
      make:{value:"Chevrolet"}, model:{value:"Suburban"},
    }})).toEqual([expect.objectContaining({
      year:2026, make:"Chevrolet", model:"Suburban", trim:"LT",
      vin:"1GNS5CKD6TR383056", price:76830, condition:"New",
    })]);
  });
  it("extracts inventory objects from Next-style JSON payloads", () => {
    const html = `<script type="application/json">${JSON.stringify({props:{vehicles:[{
      vin:"5XYK23DF0TG439927",year:2026,make:"Kia",model:"Sportage",trim:"LX",
      price:30485,fuelType:"Gasoline",driveTrain:"FWD",stockNumber:"2N20323",
    }]}})}</script>`;
    expect(extractEmbeddedVehicles(html, dealer)).toEqual([expect.objectContaining({
      make:"Kia",model:"Sportage",trim:"LX",vin:"5XYK23DF0TG439927",
      price:30485,powertrain:"Gasoline",drivetrain:"FWD",stockNumber:"2N20323",
    })]);
  });
  it("normalizes DealerOn API vehicle cards", () => {
    const payload = {DisplayCards:[{VehicleCard:{
      VehicleName:"2026 Chevrolet Suburban 2WD Premier", VehicleYear:2026,
      VehicleMake:"Chevrolet", VehicleModel:"Suburban", VehicleTrim:"Premier",
      VehicleFuelType:"Gasoline", VehicleDriveTrain:"RWD",
      VehicleVin:"1GNS5EK84TR291376", VehicleStockNumber:"CD-009",
      VehicleInternetPrice:"80120", VehicleMsrp:"82000",
      ExteriorColorLabel:"Black", VehicleDetailUrl:"/vehicle/1GNS5EK84TR291376",
      VehicleInStock:true,
    },VehicleStatusModel:{StatusText:"In Stock"}}]};
    expect(extractDealerOnVehicles(payload, dealer)).toEqual([expect.objectContaining({
      name:"2026 Chevrolet Suburban 2WD Premier", year:2026,
      make:"Chevrolet", model:"Suburban", trim:"Premier",
      powertrain:"Gasoline", drivetrain:"RWD", price:80120, msrp:82000,
      vin:"1GNS5EK84TR291376", stockNumber:"CD-009", status:"In Stock",
      url:"https://dealer.example/vehicle/1GNS5EK84TR291376",
    })]);
  });
  it("normalizes Dealer Venom Typesense results", () => {
    const payload = {hits:[{document:{
      vehicleTitle:"2026 Kia Sportage LX", year:"2026", make:"Kia", model:"Sportage",
      trim:"LX", condition:"New", fuel:"Gasoline", drivetrain:"FWD",
      vin:"5XYK23DF0TG439927", stockNumber:"2N20323", finalPriceInt:30485,
      msrp:"$31,000", mileage:0, status:"In Stock", exteriorColor:"Black",
      vdpUrl:"/vehicle/New/2026/Kia/Sportage/5XYK23DF0TG439927/",
      imageUrls:["https://dealer.example/sportage.jpg"],
    }}]};
    expect(extractDealerVenomVehicles(payload, dealer)).toEqual([expect.objectContaining({
      name:"2026 Kia Sportage LX", year:2026, make:"Kia", model:"Sportage",
      trim:"LX", condition:"New", powertrain:"Gasoline", drivetrain:"FWD",
      vin:"5XYK23DF0TG439927", stockNumber:"2N20323", price:30485, msrp:31000,
      url:"https://dealer.example/vehicle/New/2026/Kia/Sportage/5XYK23DF0TG439927/",
    })]);
  });
  it("extracts Jazel data-vehicle inventory cards", () => {
    const payload = JSON.stringify({
      year:"2026",make:"Honda",model:"CR-V",trim:"EX-L",bodyType:["SUV"],
      fuelType:"Gasoline",vin:"2HKRS4H71TH497477",exterior_color:"White",
      drivetrain:"All Wheel Drive",transmission:"CVT",condition:"new",
      mileage:4,price:"35,975",stockNumber:"H263795",
    }).replaceAll('"', "&quot;");
    const html = `<div data-vehicle="${payload}"></div>`;
    expect(extractJazelVehicles(html, dealer)).toEqual([expect.objectContaining({
      name:"2026 Honda CR-V EX-L", year:2026, make:"Honda", model:"CR-V",
      trim:"EX-L", powertrain:"Gasoline", drivetrain:"All Wheel Drive",
      vin:"2HKRS4H71TH497477", stockNumber:"H263795", price:35975, mileage:4,
    })]);
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
  it("prioritizes detail links containing the requested model over unrelated VIN links", () => {
    const unrelated = Array.from({ length: 9 }, (_, index) =>
      `<a href="/viewdetails/new/JT0000000000000${String(index).padStart(2, "0")}/2026-toyota-camry">Camry</a>`
    ).join("");
    const html = `${unrelated}
      <a href="/viewdetails/new/JT999999999999999/2026-toyota-rav4-xle">RAV4</a>`;
    expect(extractVehicleLinks(html, "https://www.dealer.example/", "RAV4", 8)[0])
      .toContain("rav4");
  });
  it("does not mistake a normal inventory page mentioning CAPTCHA for a challenge", () => {
    expect(extractVehicles(`${fixture}${" ".repeat(100_000)}captcha support`, dealer)).toHaveLength(1);
  });
});
