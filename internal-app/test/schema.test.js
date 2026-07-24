import { expect, it } from "vitest";
import { prepareSearchQuery } from "../src/schema.js";

it("supports a useful free-text-only query", () => {
  const query = prepareSearchQuery({freeText:"2025 Toyota RAV4 AWD white, до $40,000",filters:{}});
  expect(query.filters.make).toEqual({value:"Toyota",required:true});
  expect(query.filters.model).toEqual({value:"RAV4",required:true});
  expect(query.filters.priceMax.value).toBe(40000);
});
