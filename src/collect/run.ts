import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PUBLIC_FEED_CAP } from "../contract/limits";
import { parsePublicItem, type PublicItem } from "../contract/index";
import { enabledSources } from "../data/sources/registry";
import { fetchAllowlisted } from "./fetch";
import { signalToItem } from "./map";
import { parseArxiv, parseRss } from "./parse";

const itemsPath = new URL("../data/published/items.json", import.meta.url);
const sitePath = new URL("../data/published/site.json", import.meta.url);
const healthPath = new URL("../data/published/health.json", import.meta.url);
const historyPath = new URL("../data/published/history.json", import.meta.url);

interface HealthRow {
  id: string;
  ok: boolean;
  fetched: number;
  error: string | null;
}

interface IdLedger {
  ids: string[];
}

export function merge(previous: PublicItem[], fresh: PublicItem[]): PublicItem[] {
  const byId = new Map(previous.map((item) => [item.id, item]));
  for (const item of fresh) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id));
}

/** Append-only id ledger. Ids that miss the live cap stay recorded. */
export function retainHistoryIds(existing: readonly string[], mergedIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of [...existing, ...mergedIds]) {
    if (typeof id !== "string" || id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

async function main(): Promise<void> {
  const previous = readItems();
  const fetchedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const health: HealthRow[] = [];
  const fresh: PublicItem[] = [];
  for (const source of enabledSources()) {
    try {
      const xml = await fetchAllowlisted(source.feedUrl, source.allowedHosts);
      const signals = source.kind === "arxiv-api" ? parseArxiv(xml) : parseRss(xml);
      const mapped = signals
        .slice(0, 12)
        .map((signal) => signalToItem(source, signal, fetchedAt))
        .filter((item): item is PublicItem => item !== null);
      fresh.push(...mapped);
      health.push({ id: source.id, ok: true, fetched: mapped.length, error: null });
      await new Promise((resolve) => setTimeout(resolve, source.rateLimitMs));
    } catch (error) {
      const message = error instanceof Error ? error.message : "fetch-failed";
      health.push({ id: source.id, ok: false, fetched: 0, error: message });
    }
  }
  const anyOk = health.some((row) => row.ok);
  const merged = merge(previous, anyOk ? fresh : []);
  const published = merged.slice(0, PUBLIC_FEED_CAP);
  const historyIds = retainHistoryIds(
    readHistoryIds(),
    merged.map((item) => item.id),
  );
  const next = `${JSON.stringify(published, null, 2)}\n`;
  const current = readFileSync(itemsPath, "utf8");
  if (next !== current) writeFileSync(itemsPath, next);
  writeHistory(historyIds);
  const site = JSON.parse(readFileSync(sitePath, "utf8")) as { updatedAt: string };
  if (anyOk) site.updatedAt = fetchedAt;
  writeFileSync(sitePath, `${JSON.stringify(site, null, 2)}\n`);
  writeFileSync(healthPath, `${JSON.stringify({ fetchedAt, sources: health, keptPrevious: !anyOk }, null, 2)}\n`);
  console.log(JSON.stringify({ fetchedAt, anyOk, count: published.length, health }));
}

function readItems(): PublicItem[] {
  const parsed = JSON.parse(readFileSync(itemsPath, "utf8")) as unknown[];
  return parsed.flatMap((entry) => {
    const result = parsePublicItem(entry);
    return result.ok ? [result.value] : [];
  });
}

function readHistoryIds(): string[] {
  let raw: string;
  try {
    raw = readFileSync(historyPath, "utf8");
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as IdLedger).ids)) {
    throw new Error("history-ledger-invalid");
  }
  return (parsed as IdLedger).ids.filter((id): id is string => typeof id === "string" && id.length > 0);
}

function writeHistory(ids: string[]): void {
  const next = `${JSON.stringify({ ids }, null, 2)}\n`;
  let current = "";
  try {
    current = readFileSync(historyPath, "utf8");
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  if (next !== current) writeFileSync(historyPath, next);
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const entryUrl = pathToFileURL(realpathSync(entry)).href;
    const moduleUrl = pathToFileURL(realpathSync(fileURLToPath(import.meta.url))).href;
    return entryUrl === moduleUrl;
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  await main();
}
