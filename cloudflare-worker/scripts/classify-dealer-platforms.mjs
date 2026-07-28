import { readFile, writeFile } from "node:fs/promises";

const inputFile = process.argv[2];
const outputFile = process.argv[3];
if (!inputFile || !outputFile) throw new Error("Usage: classify-dealer-platforms.mjs INPUT OUTPUT");

const records = JSON.parse(await readFile(inputFile, "utf8"));
const output = new Array(records.length);
const concurrency = Math.max(1, Math.min(12, Number(process.env.AUDIT_CONCURRENCY) || 6));
let cursor = 0;

const identify = (html, headers) => {
  const source = `${html}\n${[...headers.entries()].flat().join(" ")}`.toLowerCase();
  const checks = [
    ["DealerOn", /dlron-srp-model|dealeron_tagging_data|resources\/vhcliaa/],
    ["Dealer.com / DDC", /ddc\.widgetdata|pictures\.dealer\.com|inventory-listing-ws-inv-data-service/],
    ["Dealer Venom", /dv-framework|typesenseinstantsearchadapter|\bindexname\s*=\s*["']vehicles-/],
    ["Dealer Inspire", /dealerinspire|di-assets|di-inventory|inventory\/vehiclesearch|carsforsale\.dealerinspire/],
    ["Sincro", /sincro|sincroweb|cobaltgroup|dealerseo\.com/],
    ["DealerFire", /dealerfire|inventoryplus|dealerfireblog/],
    ["Dealer eProcess", /dealereprocess|dep\.azureedge|dealer-e-process/],
    ["DealerSocket", /dealersocket|dealerfire|inventory\.dealersocket/],
    ["Dealer Car Search", /dealercarsearch|dcs-cdn|dealercarsearch\.com/],
    ["FordDirect", /forddirect|fdcdealer|ford\.com\/dealer/],
    ["Team Velocity", /teamvelocity|apollo\.teamvelocity|dealeronlinemarketing/],
    ["WordPress", /wp-content|wp-json|wordpress/],
    ["Next.js", /__next_data__|\/_next\/static/],
  ];
  return checks.find(([, pattern]) => pattern.test(source))?.[0] || "Unknown";
};

async function worker() {
  while (cursor < records.length) {
    const index = cursor++;
    const record = records[index];
    const target = record.final || record.url;
    const started = Date.now();
    try {
      const response = await fetch(target, {
        redirect:"follow",
        signal:AbortSignal.timeout(15000),
        headers:{
          accept:"text/html,application/xhtml+xml",
          "accept-language":"en-US,en;q=0.8",
          "user-agent":"Mozilla/5.0 (compatible; DJIGITInventory/1.0; +https://djigit.us)",
        },
      });
      const html = await response.text();
      output[index] = {
        ...record, platform:identify(html, response.headers),
        httpStatus:response.status, finalUrl:response.url, bytes:html.length,
        elapsedMs:Date.now() - started,
      };
    } catch (error) {
      output[index] = {
        ...record, platform:"Unreachable", error:String(error?.message || error),
        elapsedMs:Date.now() - started,
      };
    }
  }
}

await Promise.all(Array.from({ length:Math.min(concurrency, records.length) }, worker));
await writeFile(outputFile, JSON.stringify(output), "utf8");
process.stdout.write(JSON.stringify({ outputFile, records:output.length }));
