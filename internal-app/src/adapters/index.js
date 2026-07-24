import { jsonLdAdapter } from "./jsonld.js";

const adapters = [jsonLdAdapter];

export function adapterFor(dealer) {
  return adapters.find((adapter) => adapter.supports(dealer)) ?? null;
}

export const supportedAdapterIds = adapters.map((adapter) => adapter.id);
