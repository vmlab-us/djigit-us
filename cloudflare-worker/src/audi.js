const endpoint = "https://omnigraph.audi.com/graphql";

const dealerCodes = new Map(Object.entries({
  "audi van nuys": "22A18",
  "audi santa monica": "22A57",
  "audi pasadena": "22A22",
  "audi calabasas": "22A34",
  "audi valencia": "22A53",
  "audi pacific": "22A29",
  "rusnak/westlake audi": "22A63",
  "audi west covina": "22A54",
  "audi ontario": "22A26",
  "audi oxnard": "22A32",
  "audi downtown la": "22A35",
}));

const query = `
  query StockCarSearch(
    $stockIdentifier: StockIdentifierInput!
    $searchParameter: StockCarSearchParameterInput
  ) {
    stockCarSearch(
      stockIdentifier: $stockIdentifier
      searchParameter: $searchParameter
    ) {
      results {
        cars {
          stockCar {
            vin
            titleText
            subtitleText
            commissionNumber
            driveText
            model { name salesModelyear }
            modelInfo { genericModel { text } modelyear }
            dealer { id name region }
            carPrices {
              price { value }
              type
            }
            salesInfo { orderStatusText saleOrderTypeText }
            colorInfo {
              exteriorColor { colorInfo { text } }
              interiorColor { colorInfo { text } }
            }
            engineInfo { fuel { code text } }
            carline { id name }
            mileage { value { number } }
            dynamicAttributes { id value }
          }
        }
      }
    }
  }
`;

const clean = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
const key = (value) => clean(value).toLowerCase();
const alphanumeric = (value) => key(value).replace(/[^a-z0-9]+/g, "");

export const audiDealerCode = (dealerName) => dealerCodes.get(key(dealerName)) ?? null;

export const audiModelCode = (model) => {
  const normalized = alphanumeric(model);
  const aliases = {
    q4etron: "q4",
    q6etron: "q6etron",
    sq6etron: "sq6etron",
    a6etron: "a6etron",
    s6etron: "s6etron",
    etrongt: "etrongt",
    rsetrongt: "rsetrongt",
  };
  return aliases[normalized] ?? normalized;
};

const powertrain = (fuel) => {
  const source = key(`${fuel?.code ?? ""} ${fuel?.text ?? ""}`);
  if (/\be\b|electric/.test(source)) return "Electric";
  if (/\bd\b|diesel/.test(source)) return "Diesel";
  if (/hybrid|phev/.test(source)) return "Hybrid";
  if (/\bb\b|gas/.test(source)) return "Gasoline";
  return null;
};

const trim = (subtitle) => {
  const value = clean(subtitle)
    .replace(/\b(?:TFSI|TDI|quattro|tiptronic|s[\s-]?tronic|automatic)\b/gi, " ")
    .replace(/[®™]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return value || null;
};

const dynamicValue = (vehicle, id) =>
  vehicle.dynamicAttributes?.find((item) => item?.id === id)?.value ?? null;

const selectedPrice = (prices) => {
  for (const type of ["final", "dealerPrice", "sale", "list"]) {
    const value = prices?.find((item) => item?.type === type)?.price?.value;
    if (Number.isFinite(Number(value)) && Number(value) >= 0) return Number(value);
  }
  return null;
};

export function normalizeAudiVehicles(cars, dealer, checkedAt = new Date().toISOString()) {
  return (cars ?? []).map((item) => item?.stockCar).filter(Boolean).map((vehicle) => {
    const orderStatus = clean(vehicle.salesInfo?.orderStatusText);
    const vin = clean(vehicle.vin).toUpperCase() || null;
    return {
      name: clean(vehicle.titleText ?? vehicle.model?.name) || null,
      year: Number(vehicle.model?.salesModelyear ?? vehicle.modelInfo?.modelyear) || null,
      make: "Audi",
      model: clean(vehicle.carline?.name ?? vehicle.modelInfo?.genericModel?.text) || null,
      trim: trim(vehicle.subtitleText),
      condition: "New",
      bodyStyle: null,
      powertrain: powertrain(vehicle.engineInfo?.fuel),
      transmission: null,
      drivetrain: clean(vehicle.driveText) || null,
      exteriorColor: clean(vehicle.colorInfo?.exteriorColor?.colorInfo?.text) || null,
      interiorColor: clean(vehicle.colorInfo?.interiorColor?.colorInfo?.text) || null,
      vin,
      stockNumber: clean(dynamicValue(vehicle, "VEHICLE_ID") ?? vehicle.commissionNumber) || null,
      price: selectedPrice(vehicle.carPrices),
      msrp: Number(vehicle.carPrices?.find((item) => item?.type === "list")?.price?.value) || null,
      mileage: Number(vehicle.mileage?.value?.number) || null,
      status: /dealer stock/i.test(orderStatus) ? "In Stock" :
        /available|transit|order/i.test(`${orderStatus} ${vehicle.salesInfo?.saleOrderTypeText ?? ""}`)
          ? "In Transit"
          : orderStatus || null,
      features: [],
      imageUrl: null,
      url: clean(dynamicValue(vehicle, "URLAOA_AUDI")) || dealer.website,
      checkedAt,
      dealer,
    };
  }).filter((vehicle) => vehicle.vin && vehicle.model);
}

export async function fetchAudiVehicles(dealer, search, signal) {
  const dealerCode = audiDealerCode(dealer.name);
  if (!dealerCode) return null;
  const criteria = [
    { id: "model-range", items: [audiModelCode(search?.model)] },
    { id: "stat-import", items: ["AGC_USA_JDP"] },
    { id: "dealer", items: [dealerCode] },
    { id: "sold-order", items: ["no"] },
  ];
  const response = await fetch(endpoint, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "apollographql-client-name": "fa-vlp-list-page",
      "apollographql-client-version": "5.28.4",
    },
    body: JSON.stringify({
      operationName: "StockCarSearch",
      query,
      variables: {
        stockIdentifier: {
          marketIdentifier: { brand: "A", country: "us", language: "en" },
          stockCarsType: "NEW",
        },
        searchParameter: {
          paging: { limit: 200, offset: 0 },
          sort: { id: "DATE_PREDATEEND", direction: "ASC" },
          criteria,
        },
      },
    }),
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!response.ok) throw new Error(`AUDI_API_${response.status}`);
  const result = await response.json();
  if (result.errors?.length) throw new Error("AUDI_API_ERROR");
  return normalizeAudiVehicles(result.data?.stockCarSearch?.results?.cars, dealer);
}
