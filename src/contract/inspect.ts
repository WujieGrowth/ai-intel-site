import { FORBIDDEN_KEY_NORMALIZED } from "./fields";
import { STRING_MAX } from "./limits";
import { fail, ok, type Result } from "./result";

const FORBIDDEN = new Set<string>(FORBIDDEN_KEY_NORMALIZED);

const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ["secret-aws", /AKIA[0-9A-Z]{16}/],
  ["secret-private-key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["secret-sk", /\bsk-[A-Za-z0-9]{10,}/],
  ["secret-github", /\bgh[pousr]_[A-Za-z0-9]{20,}/],
  ["secret-slack", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ["secret-bearer", /Bearer\s+[A-Za-z0-9\-._~+/]{8,}/],
  [
    "secret-assign",
    /\b(api[_-]?key|secret|password|access[_-]?token)\b\s*[:=]\s*\S+/i,
  ],
];

const XSS_PATTERNS: Array<[string, RegExp]> = [
  ["xss-script", /<\s*script\b/i],
  ["xss-javascript-url", /javascript\s*:/i],
  ["xss-handler", /\bon(?:error|load|click)\s*=/i],
  ["xss-iframe", /<\s*iframe\b/i],
];

const REVENUE_PATTERNS: RegExp[] = [
  /保证[^。\n]{0,16}(收入|盈利|回本|赚钱)/,
  /一定会(赚钱|盈利)/,
  /稳赚/,
  /收入无忧/,
];

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeKeyName(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

export function findForbiddenKeys(value: unknown, path = "$"): string[] {
  const errors: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      errors.push(...findForbiddenKeys(item, `${path}[${index}]`));
    });
    return errors;
  }
  if (!isPlainObject(value)) return errors;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN.has(normalizeKeyName(key))) {
      errors.push(`forbidden-key:${path}.${key}`);
    }
    errors.push(...findForbiddenKeys(value[key], `${path}.${key}`));
  }
  return errors;
}

export function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): string[] {
  const allowedSet = new Set(allowed);
  const errors: string[] = [];
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) errors.push(`unknown-key:${path}.${key}`);
  }
  for (const key of allowed) {
    if (!(key in value)) errors.push(`missing-key:${path}.${key}`);
  }
  return errors;
}

/** Secrets and markup only. Does not apply the public string length cap. */
export function unsafeTextIssues(value: unknown, path = "$"): string[] {
  const errors: string[] = [];
  walkStrings(value, path, (text, textPath) => {
    for (const [code, pattern] of SECRET_PATTERNS) {
      if (pattern.test(text)) errors.push(`secret-pattern:${textPath}:${code}`);
    }
    for (const [code, pattern] of XSS_PATTERNS) {
      if (pattern.test(text)) errors.push(`xss-pattern:${textPath}:${code}`);
    }
  });
  return errors;
}

export function scanText(value: unknown, path = "$"): string[] {
  const errors: string[] = [];
  walkStrings(value, path, (text, textPath) => {
    if (text.length > STRING_MAX) errors.push(`bad-length:${textPath}`);
    for (const [code, pattern] of SECRET_PATTERNS) {
      if (pattern.test(text)) errors.push(`secret-pattern:${textPath}:${code}`);
    }
    for (const [code, pattern] of XSS_PATTERNS) {
      if (pattern.test(text)) errors.push(`xss-pattern:${textPath}:${code}`);
    }
    for (const pattern of REVENUE_PATTERNS) {
      if (pattern.test(text)) errors.push(`revenue-promise:${textPath}`);
    }
  });
  return errors;
}

function walkStrings(
  value: unknown,
  path: string,
  visit: (text: string, path: string) => void,
): void {
  if (typeof value === "string") {
    visit(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, `${path}[${index}]`, visit));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    walkStrings(child, `${path}.${key}`, visit);
  }
}

export function parseJsonText(text: string): Result<unknown> {
  if (text.trim().length === 0) return fail("empty-json");
  try {
    return ok(JSON.parse(text));
  } catch {
    return fail("malformed-or-truncated-json");
  }
}

export function deepTrim(value: unknown): unknown {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map((item) => deepTrim(item));
  if (!isPlainObject(value)) return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) next[key] = deepTrim(child);
  return next;
}

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

export function stringIssues(value: string, path: string, min: number, max: number): string[] {
  const errors: string[] = [];
  if (value !== value.trim()) errors.push(`not-trimmed:${path}`);
  if (value.length < min || value.length > max) errors.push(`bad-length:${path}`);
  if (CONTROL_CHARS.test(value)) errors.push(`control-char:${path}`);
  return errors;
}

export function isHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  return true;
}

/**
 * Canonical form for http(s) URLs. Non-http values are only trimmed.
 * Does not add a scheme, host, year, or timezone.
 */
export function canonicalizeHttpUrl(input: string): string {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return trimmed;
  if (url.username || url.password) return trimmed;
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80")
  ) {
    url.port = "";
  }
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}

export function duplicateErrors(
  items: ReadonlyArray<{ id: string; sourceUrl: string }>,
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const urls = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) errors.push(`duplicate-id:${item.id}`);
    ids.add(item.id);
    const url = canonicalizeHttpUrl(item.sourceUrl);
    if (urls.has(url)) errors.push(`duplicate-url:${url}`);
    urls.add(url);
  }
  return errors;
}
