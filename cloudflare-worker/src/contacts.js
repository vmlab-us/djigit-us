const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}/g;
const MOBILE_LABEL = /\b(?:cell|mobile|sms|text)\b|мобил|сотов/i;

const unique = (values) => [...new Set(values)];

export function extractEmails(value) {
  return unique((String(value ?? "").match(EMAIL_PATTERN) ?? []).map((email) => email.toLowerCase()));
}

export function normalizeUsPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return "";
}

export function extractPhones(value) {
  return unique((String(value ?? "").match(PHONE_PATTERN) ?? []).map(normalizeUsPhone).filter(Boolean));
}

export function extractSmsPhone(value) {
  const text = String(value ?? "");
  const matches = [...text.matchAll(PHONE_PATTERN)];
  const labeled = matches.find((match, index) => {
    const previousEnd = index ? matches[index - 1].index + matches[index - 1][0].length : 0;
    const nextStart = index + 1 < matches.length ? matches[index + 1].index : text.length;
    const before = text.slice(Math.max(previousEnd, match.index - 18), match.index);
    const after = text.slice(match.index + match[0].length, nextStart);
    return MOBILE_LABEL.test(`${before} ${after}`);
  });
  if (labeled) return normalizeUsPhone(labeled[0]);
  if (matches.length === 1 && MOBILE_LABEL.test(text)) return normalizeUsPhone(matches[0][0]);
  return null;
}
