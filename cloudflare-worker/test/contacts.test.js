import { expect, it } from "vitest";
import { extractEmails, extractPhones, extractSmsPhone, normalizeUsPhone } from "../src/contacts.js";

it("keeps multiple fleet phones separate and selects the labeled cell number", () => {
  const value = "1–5. 213-493-0258 | 6. 213-204-7917 direct, 323-251-6880 cell";
  expect(extractPhones(value)).toEqual(["+12134930258", "+12132047917", "+13232516880"]);
  expect(extractSmsPhone(value)).toBe("+13232516880");
});

it("does not use an unlabeled office or direct number for SMS", () => {
  expect(extractSmsPhone("1. 424-281-5607")).toBeNull();
  expect(extractSmsPhone("909-625-5575 ext. 223")).toBeNull();
});

it("normalizes US phones and rejects malformed concatenated numbers", () => {
  expect(normalizeUsPhone("(626) 229-2587")).toBe("+16262292587");
  expect(normalizeUsPhone("21349302582132047917")).toBe("");
});

it("extracts individual normalized email addresses from a grouped cell", () => {
  expect(extractEmails("3. cyi@dtlamotors.com | 5. NCHOI@dtlamotors.com | 6. sarvatz@dtlamotors.com"))
    .toEqual(["cyi@dtlamotors.com", "nchoi@dtlamotors.com", "sarvatz@dtlamotors.com"]);
});
