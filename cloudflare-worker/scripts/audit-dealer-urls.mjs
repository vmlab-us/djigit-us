import { Buffer } from "node:buffer";
import { writeFile } from "node:fs/promises";

const records = JSON.parse(Buffer.from(process.argv[2], "hex").toString("utf8"));
const concurrency = Math.max(1, Math.min(20, Number(process.env.AUDIT_CONCURRENCY) || 10));
const timeoutMs = Math.max(2_000, Math.min(30_000, Number(process.env.AUDIT_TIMEOUT_MS) || 12_000));

const blockedPattern = /access denied|captcha|verify you are human|cf-chl-|akamai/i;
const publicUrl = (value) => {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
};

async function probe(input) {
  const parsed = publicUrl(input);
  if (!parsed) return { status: 0, error: "INVALID_URL" };
  const candidates = parsed.protocol === "http:"
    ? [new URL(parsed.href.replace(/^http:/, "https:")), parsed]
    : [parsed];
  let last = null;
  for (const candidate of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(candidate, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en-US,en;q=0.8",
          "user-agent": "Mozilla/5.0 (compatible; DJIGITInventoryAudit/1.0; +https://djigit.us)",
        },
      });
      const body = await response.text();
      // Large, otherwise healthy dealer pages sometimes contain the words
      // "captcha" or "access denied" inside bundled scripts. Only treat that
      // text as an actual block page when the response body is small.
      const blocked = [401, 403, 429].includes(response.status)
        || (body.length < 100_000 && blockedPattern.test(body.slice(0, 20_000)));
      return {
        status: response.status,
        final: response.url,
        blocked,
        httpsUpgrade: parsed.protocol === "http:" && candidate.protocol === "https:" && response.ok,
        hasJsonLd: /application\/ld\+json/i.test(body),
        bytes: body.length,
      };
    } catch (error) {
      last = {
        status: 0,
        error: error?.name === "AbortError" ? "TIMEOUT" : String(error?.cause?.code || error?.message || "FETCH_FAILED").slice(0, 80),
      };
    } finally {
      clearTimeout(timer);
    }
  }
  return last;
}

const output = new Array(records.length);
let cursor = 0;
async function worker() {
  while (cursor < records.length) {
    const index = cursor++;
    const record = records[index];
    output[index] = { ...record, ...(await probe(record.url)) };
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, records.length) }, worker));
const serialized = JSON.stringify(output);
if (process.argv[3]) {
  await writeFile(process.argv[3], serialized, "utf8");
  process.stdout.write(JSON.stringify({ outputFile: process.argv[3], records: output.length }));
} else {
  process.stdout.write(serialized);
}
