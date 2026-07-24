import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { jsonLdAdapter } from "../src/adapters/jsonld.js";

it("normalizes a saved dealer structured-data fixture", async () => {
  const html = await readFile(new URL("./fixtures/jsonld-inventory.html", import.meta.url), "utf8");
  const fetchPage = async () => new Response(html, {status:200,headers:{"content-type":"text/html"}});
  const [vehicle] = await jsonLdAdapter.search({
    dealer:{id:"d1",name:"Fixture Dealer",website:"https://dealer.example"},
    fetchPage,
  });
  expect(vehicle).toMatchObject({year:2025,make:"Toyota",model:"RAV4",vin:"JT123",price:39995,drivetrain:"AWD"});
});
