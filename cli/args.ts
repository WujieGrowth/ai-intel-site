export type FlagMap = Map<string, string | true>;

export type FlagSpec = {
  bool: readonly string[];
  value: readonly string[];
};

export function parseFlags(
  argv: readonly string[],
  spec: FlagSpec,
): { ok: true; flags: FlagMap } | { ok: false; errors: string[] } {
  const allowed = new Set<string>([...spec.bool, ...spec.value]);
  const booleans = new Set<string>(spec.bool);
  const flags: FlagMap = new Map();
  const errors: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (!token.startsWith("-") || token === "-") {
      errors.push(`unexpected-argument:${token}`);
      continue;
    }

    let name = token;
    let inline: string | undefined;
    const eq = token.indexOf("=");
    if (token.startsWith("--") && eq > 1) {
      name = token.slice(0, eq);
      inline = token.slice(eq + 1);
    }

    if (!allowed.has(name)) {
      errors.push(`unknown-flag:${name}`);
      if (inline === undefined && !booleans.has(name)) index = skipValue(argv, index);
      continue;
    }
    if (flags.has(name)) {
      errors.push(`duplicate-flag:${name}`);
      if (inline === undefined && !booleans.has(name)) index = skipValue(argv, index);
      continue;
    }
    if (booleans.has(name)) {
      if (inline !== undefined) {
        errors.push(`unexpected-value:${name}`);
        continue;
      }
      flags.set(name, true);
      continue;
    }
    if (inline !== undefined) {
      if (inline.length === 0) errors.push(`missing-value:${name}`);
      else flags.set(name, inline);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("-")) {
      errors.push(`missing-value:${name}`);
      continue;
    }
    index += 1;
    flags.set(name, value);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, flags };
}

function skipValue(argv: readonly string[], index: number): number {
  const next = argv[index + 1];
  if (next !== undefined && !next.startsWith("-")) return index + 1;
  return index;
}

export function flagString(flags: FlagMap, name: string): string | undefined {
  const value = flags.get(name);
  return typeof value === "string" ? value : undefined;
}

export function flagOn(flags: FlagMap, name: string): boolean {
  return flags.get(name) === true;
}
