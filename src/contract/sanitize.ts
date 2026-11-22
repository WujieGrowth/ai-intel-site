const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " ",
};

/** Drop markup and control characters. Does not invent missing words. */
export function sanitizeText(value: string, max = 500): string {
  const withoutTags = value.replace(/<[^>]*>/g, " ");
  const decoded = withoutTags.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_entity, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
    }
    return NAMED[body] ?? " ";
  });
  return decoded
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
