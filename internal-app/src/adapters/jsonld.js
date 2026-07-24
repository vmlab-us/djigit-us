import * as cheerio from "cheerio";
import { normalizeVehicle } from "../normalize.js";

const walk = (value, results) => {
  if (!value) return;
  if (Array.isArray(value)) return value.forEach((item) => walk(item, results));
  if (typeof value !== "object") return;
  const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
  if (types.some((type) => ["Vehicle", "Car", "Product"].includes(type))) results.push(value);
  Object.values(value).forEach((child) => walk(child, results));
};

const offer = (node) => Array.isArray(node.offers) ? node.offers[0] : node.offers ?? {};

export const jsonLdAdapter = {
  id: "jsonld",
  supports: () => true,
  async search({ dealer, fetchPage }) {
    const response = await fetchPage(dealer.website);
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const html = await response.text();
    if (/captcha|access denied|verify you are human/i.test(html)) throw new Error("BLOCKED_OR_CAPTCHA");
    const $ = cheerio.load(html);
    const nodes = [];
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        walk(JSON.parse($(element).text()), nodes);
      } catch {
        // A malformed structured-data block must not fail the whole dealer.
      }
    });
    return nodes.map((node) => {
      const pricing = offer(node);
      const vehicle = node.itemOffered ?? node;
      return normalizeVehicle({
        year: vehicle.vehicleModelDate ?? vehicle.productionDate,
        make: vehicle.brand?.name ?? vehicle.manufacturer?.name ?? vehicle.brand,
        model: vehicle.model,
        trim: vehicle.vehicleConfiguration,
        condition: pricing.itemCondition ?? vehicle.itemCondition,
        bodyStyle: vehicle.bodyType,
        powertrain: vehicle.fuelType,
        transmission: vehicle.vehicleTransmission,
        drivetrain: vehicle.driveWheelConfiguration,
        exteriorColor: vehicle.color,
        interiorColor: vehicle.vehicleInteriorColor,
        vin: vehicle.vehicleIdentificationNumber ?? vehicle.sku,
        stockNumber: vehicle.mpn,
        mileage: vehicle.mileageFromOdometer?.value,
        price: pricing.price,
        status: pricing.availability,
        imageUrl: Array.isArray(vehicle.image) ? vehicle.image[0] : vehicle.image,
        url: pricing.url ?? vehicle.url,
        raw: { name: vehicle.name ?? null },
      }, dealer);
    }).filter((vehicle) => vehicle.make && vehicle.model);
  },
};
