import { z } from "zod";

const textPreference = z.object({
  value: z.string().trim().min(1).max(100),
  required: z.boolean().default(false),
});
const numberPreference = z.object({
  value: z.number().finite().nonnegative(),
  required: z.boolean().default(false),
});

export const searchSchema = z.object({
  freeText: z.string().trim().max(500).optional().default(""),
  filters: z.object({
    make: textPreference.optional(),
    model: textPreference.optional(),
    trim: textPreference.optional(),
    condition: textPreference.optional(),
    drivetrain: textPreference.optional(),
    powertrain: textPreference.optional(),
    exteriorColor: textPreference.optional(),
    interiorColor: textPreference.optional(),
    status: textPreference.optional(),
    yearMin: numberPreference.optional(),
    yearMax: numberPreference.optional(),
    priceMin: numberPreference.optional(),
    priceMax: numberPreference.optional(),
    mileageMax: numberPreference.optional(),
  }),
  dealerIds: z.array(z.string().max(100)).max(100).optional().default([]),
  maxDistanceMiles: z.number().finite().positive().max(1000).optional(),
  allowRequiredViolations: z.boolean().optional().default(false),
});

const brands = ["Toyota","Honda","Ford","Chevrolet","Hyundai","Kia","Lexus","BMW","Mercedes-Benz","Tesla","Subaru","Nissan","Mazda","Volkswagen","Audi","Volvo","Jeep","GMC"];
const colors = ["white","black","silver","gray","grey","red","blue","green","brown","beige","gold"];

export function prepareSearchQuery(input) {
  const query = searchSchema.parse(input);
  const text = query.freeText;
  const brand = brands.find((item) => new RegExp(`\\b${item.replace("-", "[- ]")}\\b`, "i").test(text));
  if (!query.filters.make && brand) query.filters.make = { value: brand, required: true };
  if (!query.filters.model && brand) {
    const afterBrand = text.slice(text.toLowerCase().indexOf(brand.toLowerCase()) + brand.length).trim();
    const model = afterBrand.match(/^([A-Za-z0-9-]{2,20})/)?.[1];
    if (model) query.filters.model = { value: model, required: true };
  }
  const year = text.match(/\b(19|20)\d{2}\b/)?.[0];
  if (!query.filters.yearMin && year) query.filters.yearMin = { value: Number(year), required: false };
  if (!query.filters.yearMax && year) query.filters.yearMax = { value: Number(year), required: false };
  const maxPrice = text.match(/(?:до|under|up to)\s*\$?\s*([\d,]+)/i)?.[1];
  if (!query.filters.priceMax && maxPrice) query.filters.priceMax = { value: Number(maxPrice.replaceAll(",", "")), required: false };
  const drivetrain = text.match(/\b(AWD|FWD|RWD|4WD|4x4)\b/i)?.[1];
  if (!query.filters.drivetrain && drivetrain) query.filters.drivetrain = { value: drivetrain.toUpperCase(), required: false };
  const condition = text.match(/\b(New|Used|CPO)\b/i)?.[1];
  if (!query.filters.condition && condition) query.filters.condition = { value: condition, required: true };
  const color = colors.find((item) => new RegExp(`\\b${item}\\b`, "i").test(text));
  if (!query.filters.exteriorColor && color) query.filters.exteriorColor = { value: color, required: false };
  if (!query.filters.make || !query.filters.model) {
    throw new ZodError([{ code:"custom", path:["filters"], message:"Укажите марку и модель." }]);
  }
  return query;
}
