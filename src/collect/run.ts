import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PUBLIC_FEED_CAP } from "../contract/limits";
import { parsePublicItem, type PublicItem } from "../contract/index";
import { enabledSources } from "../data/sources/registry";
import { canonicalEvidenceUrl } from "./canonical";
import { fetchAllowlisted } from "./fetch";
import { signalToItem } from "./map";
import { parseArxiv, parseRss } from "./parse";
import { selectSignals } from "./select";
import { splitFutureItems } from "./future";

const itemsPath = new URL("../data/published/items.json", import.meta.url);
const sitePath = new URL("../data/published/site.json", import.meta.url);
const healthPath = new URL("../data/published/health.json", import.meta.url);
const historyPath = new URL("../data/published/history.json", import.meta.url);
const cachePath = new URL("../data/published/feed-cache.json", import.meta.url);

interface HealthRow {
  id: string;
  ok: boolean;
  fetched: number;
  error: string | null;
  notModified: boolean;
  skippedFuture: number;
}

interface FeedCache {
  sources: Record<string, { etag: string | null; lastModified: string | null }>;
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
  const cache = readCache();
  for (const source of enabledSources()) {
    const prior = cache.sources[source.id];
    try {
      const fetched = await fetchAllowlisted(source.feedUrl, source.allowedHosts, {
        etag: prior?.etag,
        lastModified: prior?.lastModified,
      });
      cache.sources[source.id] = { etag: fetched.etag, lastModified: fetched.lastModified };
      if (fetched.status === 304) {
        health.push({
          id: source.id,
          ok: true,
          fetched: previous.filter((item) => item.id.startsWith(`${source.id}-`)).length,
          error: null,
          notModified: true,
          skippedFuture: 0,
        });
      } else {
        const parsed = source.kind === "arxiv-api" ? parseArxiv(fetched.body) : parseRss(fetched.body);
        const mapped = selectSignals(source, parsed)
          .map((signal) => signalToItem(source, signal, fetchedAt))
          .filter((item): item is PublicItem => item !== null);
        fresh.push(...mapped);
        health.push({ id: source.id, ok: true, fetched: mapped.length, error: null, notModified: false, skippedFuture: 0 });
      }
      await new Promise((resolve) => setTimeout(resolve, source.rateLimitMs));
    } catch (error) {
      const message = error instanceof Error ? error.message : "fetch-failed";
      health.push({ id: source.id, ok: false, fetched: 0, error: message, notModified: false, skippedFuture: 0 });
    }
  }
  const anyOk = health.some((row) => row.ok);
  const merged = merge(previous, anyOk ? dedupAgainst(previous, fresh) : []);
  const dated = splitFutureItems(merged, Date.parse(fetchedAt));
  for (const row of health) {
    row.skippedFuture = dated.quarantined.filter((record) => record.id.startsWith(`${row.id}-`)).length;
  }
  const published = capPublished(dated.keep, PUBLIC_FEED_CAP);
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
  writeFileSync(healthPath, `${JSON.stringify({ fetchedAt, sources: health, keptPrevious: !anyOk, quarantine: dated.quarantined }, null, 2)}\n`);
  writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
  console.log(JSON.stringify({ fetchedAt, anyOk, count: published.length, health }));
}

/** Drop a second copy of a canonical URL. A different host is a different record. */
export function dedupAgainst(previous: readonly PublicItem[], fresh: readonly PublicItem[]): PublicItem[] {
  const owned = new Map<string, string>();
  for (const item of previous) {
    const key = canonicalEvidenceUrl(item.sourceUrl);
    if (key) owned.set(key, item.id);
  }
  const seen = new Set<string>();
  const out: PublicItem[] = [];
  for (const item of fresh) {
    const key = canonicalEvidenceUrl(item.sourceUrl) ?? item.sourceUrl;
    if (seen.has(key)) continue;
    seen.add(key);
    const owner = owned.get(key);
    if (owner && owner !== item.id) continue;
    out.push(item);
  }
  return out;
}

/** Reviewed public originals stay even when newer collector rows fill the window. */
export function capPublished(items: readonly PublicItem[], cap: number): PublicItem[] {
  const sorted = [...items].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id));
  const pinned = sorted.filter((item) => item.id.startsWith("origin-"));
  const rest = sorted.filter((item) => !item.id.startsWith("origin-"));
  return [...pinned, ...rest.slice(0, Math.max(cap - pinned.length, 0))].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id),
  );
}

function readCache(): FeedCache {
  try {
    const parsed = JSON.parse(readFileSync(cachePath, "utf8")) as FeedCache;
    if (!parsed || typeof parsed !== "object" || !parsed.sources) return { sources: {} };
    return parsed;
  } catch (error) {
    if (isMissing(error)) return { sources: {} };
    return { sources: {} };
  }
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
