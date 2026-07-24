import dns from "node:dns/promises";
import net from "node:net";

const blockedV4 = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4],
];

const toInt = (ip) => ip.split(".").reduce((sum, octet) => (sum << 8) + Number(octet), 0) >>> 0;
const inCidr = (ip, network, bits) => {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (toInt(ip) & mask) === (toInt(network) & mask);
};

export function isBlockedAddress(address) {
  const type = net.isIP(address);
  if (type === 4) return blockedV4.some(([network, bits]) => inCidr(address, network, bits));
  if (type === 6) {
    const value = address.toLowerCase();
    return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") ||
      value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") ||
      value.startsWith("feb") || value.startsWith("ff") || value.startsWith("::ffff:");
  }
  return true;
}

export function createSafeFetch({ trustedHosts, timeoutMs = 15000, fetchImpl = fetch, lookup = dns.lookup }) {
  const allowlist = new Set([...trustedHosts].map((host) => host.toLowerCase()));
  return async (input, options = {}) => {
    const url = new URL(input);
    if (url.protocol !== "https:" || !allowlist.has(url.hostname.toLowerCase())) {
      throw new Error("UNTRUSTED_DEALER_URL");
    }
    const addresses = await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => isBlockedAddress(address))) {
      throw new Error("BLOCKED_DEALER_ADDRESS");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        ...options,
        redirect: "manual",
        signal: AbortSignal.any([controller.signal, ...(options.signal ? [options.signal] : [])]),
        headers: {
          "user-agent": "DJIGIT-Internal-Inventory/1.0 (+https://djigit.us)",
          accept: "text/html,application/xhtml+xml,application/json",
          ...(options.headers ?? {}),
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error("INVALID_REDIRECT");
        return await createSafeFetch({ trustedHosts, timeoutMs, fetchImpl, lookup })(
          new URL(location, url),
          { ...options, signal: controller.signal },
        );
      }
      return response;
    } finally {
      clearTimeout(timer);
    }
  };
}
