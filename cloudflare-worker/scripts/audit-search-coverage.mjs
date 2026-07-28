import { readFile, writeFile } from "node:fs/promises";
import { searchDealer } from "../src/inventory.js";

const inputFile = process.argv[2];
const outputFile = process.argv[3];
if (!inputFile || !outputFile) throw new Error("Usage: audit-search-coverage.mjs INPUT OUTPUT");

const representativeModels = {
  Acura:"RDX", Audi:"Q5", BMW:"X3", Buick:"Enclave", Cadillac:"Escalade",
  Chevrolet:"Suburban", Chrysler:"Pacifica", Dodge:"Durango", Ford:"F-150",
  GMC:"Yukon", Honda:"CR-V", Hyundai:"Tucson", Jeep:"Grand Cherokee",
  Kia:"Sportage", Lexus:"RX", Mazda:"CX-5", "Mercedes-Benz":"GLB-Class",
  Nissan:"Rogue", Porsche:"Macan", Ram:"1500", Subaru:"Outback",
  Toyota:"RAV4", Volkswagen:"Tiguan", Volvo:"XC60",
};

const input = JSON.parse(await readFile(inputFile, "utf8"));
const output = new Array(input.length);
const concurrency = Math.max(1, Math.min(20, Number(process.env.AUDIT_CONCURRENCY) || 10));
let cursor = 0;

async function worker() {
  while (cursor < input.length) {
    const index = cursor++;
    const record = input[index];
    const model = representativeModels[record.brand];
    const dealer = {
      id:record.id, brand:record.brand, name:record.name,
      website:record.final || record.url, fleet:null,
    };
    const started = Date.now();
    try {
      const result = await searchDealer(dealer, {
        filters: {
          make:{ value:record.brand, required:true },
          model:{ value:model, required:true },
        },
        allowRequiredViolations:false,
        debug:true,
      });
      output[index] = {
        ...record, model, exact:result.exact.length, close:result.close.length,
        diagnostics:result.diagnostics,
        searchStatus:result.exact.length ? "SEARCH_OK" : "NO_MATCHES",
        elapsedMs:Date.now() - started,
      };
    } catch (error) {
      output[index] = {
        ...record, model, exact:0, close:0,
        searchStatus:error?.name === "AbortError" ? "SEARCH_TIMEOUT" : "SEARCH_ERROR",
        searchError:String(error?.message || error).slice(0, 100),
        diagnostics:error?.diagnostics,
        elapsedMs:Date.now() - started,
      };
    }
  }
}

await Promise.all(Array.from({ length:Math.min(concurrency, input.length) }, worker));
await writeFile(outputFile, JSON.stringify(output), "utf8");
process.stdout.write(JSON.stringify({ outputFile, records:output.length }));
