import { existsSync } from "node:fs";
import { flagOn, flagString, parseFlags, type FlagMap, type FlagSpec } from "./args";
import { duplicateLedgerIds, loadCandidates, loadPublicationLedger, loadReadLedger, loadReleaseIds, loadSentLedger } from "./load";
import { assertUnchanged, invalid, okOut, readHashed, resolveFinal, usage, writeJson, checkWritable, type RunResult } from "./safe-path";
import {
  buildPublishedLocalCopy,
  buildReleaseCandidate,
  createPublicationLedgerRecord,
  fail,
  isUpdatedAt,
  ok,
  PRIVATE_STATUSES,
  transition,
  type PrivateCandidate,
  type PrivateStatus,
  type PublicationLedgerRecord,
  type Result,
} from "../src/contract/index";
import { scanText, stringIssues } from "../src/contract/inspect";
import { importRawCommand } from "./bridge-command";
import { acceptVerifiedCommand } from "./verified-command";

const SPECS: Record<string, FlagSpec> = {
  import: { bool: ["--write"], value: ["--input", "--out"] },
  review: { bool: ["--write"], value: ["--input", "--id", "--to", "--out"] },
  "export-public": { bool: ["--write", "--sample-only"], value: ["--input", "--out"] },
  "confirm-publication": { bool: ["--write"], value: ["--input", "--ledger-out", "--at"] },
  "mark-published": {
    bool: ["--write", "--i-confirm-live-deployment"],
    value: ["--input", "--id", "--deployment-url", "--out", "--at"],
  },
  retract: { bool: ["--write"], value: ["--input", "--id", "--out"] },
  ledger: { bool: ["--write"], value: ["--kind", "--id", "--at", "--channel", "--ledger"] },
  "import-raw": { bool: ["--write"], value: ["--input", "--private-out"] },
  "accept-verified": { bool: ["--write"], value: ["--input", "--at", "--public-out", "--private-out"] },
};

export function execute(command: string, argv: readonly string[]): RunResult {
  const spec = SPECS[command];
  if (!spec) return usage(["未知命令"]);
  const parsed = parseFlags(argv, spec);
  if (!parsed.ok) return usage(parsed.errors);
  switch (command) {
    case "import":
      return importCommand(parsed.flags);
    case "review":
      return reviewCommand(parsed.flags);
    case "export-public":
      return exportCommand(parsed.flags);
    case "confirm-publication":
      return confirmCommand(parsed.flags);
    case "mark-published":
      return markPublishedCommand(parsed.flags);
    case "retract":
      return retractCommand(parsed.flags);
    case "ledger":
      return ledgerCommand(parsed.flags);
    case "import-raw":
      return importRawCommand(parsed.flags);
    case "accept-verified":
      return acceptVerifiedCommand(parsed.flags);
    default:
      return usage(["未知命令"]);
  }
}

function importCommand(flags: FlagMap): RunResult {
  const input = flagString(flags, "--input");
  if (!input) return usage(["missing-flag:--input"]);
  const target = outputTarget(flags, "--out", flagOn(flags, "--write"), input);
  if (!target.ok) return target.result;
  return withCandidates(input, target.path, (items) => {
    const summary = {
      ok: true,
      command: "import",
      count: items.length,
      ids: items.map((item) => item.id),
    };
    return ok({ stdout: summary, file: items });
  });
}

function reviewCommand(flags: FlagMap): RunResult {
  const input = flagString(flags, "--input");
  const id = flagString(flags, "--id");
  const to = flagString(flags, "--to");
  const missing = [
    input ? "" : "missing-flag:--input",
    id ? "" : "missing-flag:--id",
    to ? "" : "missing-flag:--to",
  ].filter((error) => error.length > 0);
  if (missing.length > 0 || !input || !id || !to) return usage(missing);
  const target = outputTarget(flags, "--out", flagOn(flags, "--write"), input);
  if (!target.ok) return target.result;
  if (!isPrivateStatus(to)) return usage([`bad-target:${to}`]);
  return withCandidates(input, target.path, (items) => {
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return fail(`missing-id:${id}`);
    const current = items[index];
    if (!current) return fail(`missing-id:${id}`);
    if (to === "published" || to === "retracted") {
      const moved = transition(current.status, to);
      const errors = moved.ok ? [] : [...moved.errors];
      errors.push("review-cannot-publish");
      return fail(...errors);
    }
    const moved = transition(current.status, to);
    if (!moved.ok) return moved;
    const next = items.map((item, itemIndex) =>
      itemIndex === index ? { ...item, status: moved.value } : item,
    );
    return ok({ stdout: next, file: next });
  });
}

function exportCommand(flags: FlagMap): RunResult {
  const input = flagString(flags, "--input");
  if (!input) return usage(["missing-flag:--input"]);
  const target = outputTarget(flags, "--out", flagOn(flags, "--write"), input);
  if (!target.ok) return target.result;
  const mode = flagOn(flags, "--sample-only") ? "sample" : "real";
  return withCandidates(input, target.path, (items) => {
    const exported = buildReleaseCandidate(items, mode);
    if (!exported.ok) return exported;
    return ok({ stdout: exported.value, file: exported.value });
  });
}

function confirmCommand(flags: FlagMap): RunResult {
  const input = flagString(flags, "--input");
  const at = flagString(flags, "--at");
  const missing = [input ? "" : "missing-flag:--input", at ? "" : "missing-flag:--at"].filter(
    (error) => error.length > 0,
  );
  if (missing.length > 0 || !input || !at) return usage(missing);
  const write = flagOn(flags, "--write");
  const target = outputTarget(flags, "--ledger-out", write, input);
  if (!target.ok) return target.result;
  if (!isUpdatedAt(at)) return invalid(["bad-updatedAt:$.recordedAt"]);

  const read = readHashed(input);
  if (!read.ok) return read.result;
  const release = loadReleaseIds(read.text);
  if (!release.ok) return invalid(release.errors);

  const ledgerPath = flagString(flags, "--ledger-out");
  let existing: PublicationLedgerRecord[] = [];
  let ledgerHash: string | null = null;
  if (ledgerPath && existsSync(ledgerPath)) {
    const ledgerRead = readHashed(ledgerPath);
    if (!ledgerRead.ok) return ledgerRead.result;
    ledgerHash = ledgerRead.hash;
    const parsed = loadPublicationLedger(ledgerRead.text);
    if (!parsed.ok) return invalid(parsed.errors);
    existing = parsed.value.records;
  }

  const created: PublicationLedgerRecord[] = [];
  const errors: string[] = [];
  for (const id of release.value) {
    const record = createPublicationLedgerRecord({
      id,
      recordedAt: at,
      deploymentUrl: null,
      state: "awaiting-deployment",
    });
    if (!record.ok) {
      errors.push(...record.errors);
      continue;
    }
    created.push(record.value);
  }
  errors.push(...duplicateLedgerIds([...existing.map((record) => record.id), ...created.map((record) => record.id)]));
  if (errors.length > 0) return invalid(errors);

  const ledger = { kind: "publication-ledger" as const, records: [...existing, ...created] };
  const changed = assertUnchanged(input, read.hash);
  if (changed) return changed;
  if (ledgerPath && ledgerHash && !write) {
    const ledgerChanged = assertUnchanged(ledgerPath, ledgerHash);
    if (ledgerChanged) return ledgerChanged;
  }
  if (target.path) {
    const wrote = writeJson(target.path, ledger);
    if (wrote) return wrote;
    const changedAfter = assertUnchanged(input, read.hash);
    if (changedAfter) return changedAfter;
  }
  return okOut(ledger);
}

function markPublishedCommand(flags: FlagMap): RunResult {
  const input = flagString(flags, "--input");
  const id = flagString(flags, "--id");
  const deploymentUrl = flagString(flags, "--deployment-url");
  const out = flagString(flags, "--out");
  const at = flagString(flags, "--at");
  const missing = [
    input ? "" : "missing-flag:--input",
    id ? "" : "missing-flag:--id",
    deploymentUrl ? "" : "missing-flag:--deployment-url",
    out ? "" : "missing-flag:--out",
    at ? "" : "missing-flag:--at",
  ].filter((error) => error.length > 0);
  if (!flagOn(flags, "--i-confirm-live-deployment")) missing.push("confirmation-flag-required");
  if (missing.length > 0 || !input || !id || !deploymentUrl || !at) return usage(missing);
  if (!isUpdatedAt(at)) return invalid(["bad-updatedAt:--at"]);
  const target = outputTarget(flags, "--out", flagOn(flags, "--write"), input);
  if (!target.ok) return target.result;
  return withCandidates(input, target.path, (items) => {
    const index = items.findIndex((item) => item.id === id);
    const current = index < 0 ? undefined : items[index];
    if (!current) return fail(`missing-id:${id}`);
    // The public object is the contract copy. --at is required from the operator and is not stored.
    const copy = buildPublishedLocalCopy(current, deploymentUrl);
    if (!copy.ok) return copy;
    return ok({ stdout: copy.value, file: copy.value });
  });
}

function retractCommand(flags: FlagMap): RunResult {
  const input = flagString(flags, "--input");
  const id = flagString(flags, "--id");
  const missing = [input ? "" : "missing-flag:--input", id ? "" : "missing-flag:--id"].filter(
    (error) => error.length > 0,
  );
  if (missing.length > 0 || !input || !id) return usage(missing);
  const target = outputTarget(flags, "--out", flagOn(flags, "--write"), input);
  if (!target.ok) return target.result;
  return withCandidates(input, target.path, (items) => {
    const index = items.findIndex((item) => item.id === id);
    const current = index < 0 ? undefined : items[index];
    if (!current) return fail(`missing-id:${id}`);
    const moved = transition(current.status, "retracted");
    if (!moved.ok) return moved;
    const next = items.map((item, itemIndex) =>
      itemIndex === index ? { ...item, status: moved.value } : item,
    );
    return ok({ stdout: next, file: next });
  });
}

function ledgerCommand(flags: FlagMap): RunResult {
  const kind = flagString(flags, "--kind");
  const id = flagString(flags, "--id");
  const at = flagString(flags, "--at");
  const missing = [
    kind ? "" : "missing-flag:--kind",
    id ? "" : "missing-flag:--id",
    at ? "" : "missing-flag:--at",
  ].filter((error) => error.length > 0);
  if (missing.length > 0 || !kind || !id || !at) return usage(missing);
  if (kind === "publication") return usage(["use-confirm-publication"]);
  if (kind !== "read" && kind !== "sent") return usage([`bad-kind:${kind}`]);
  if (!isUpdatedAt(at)) return invalid(["bad-updatedAt:--at"]);
  const idIssues = [...stringIssues(id, "$.id", 1, 80), ...scanText(id, "$.id")];
  if (idIssues.length > 0) return invalid(idIssues);

  const channel = flagString(flags, "--channel");
  if (kind === "read" && channel !== undefined) return usage(["channel-not-allowed"]);
  let sentChannel = "";
  if (kind === "sent") {
    if (channel === undefined) return usage(["missing-flag:--channel"]);
    sentChannel = channel.trim();
    const channelIssues = [...stringIssues(sentChannel, "$.channel", 1, 80), ...scanText(sentChannel, "$.channel")];
    if (channelIssues.length > 0) return invalid(channelIssues);
  }

  const write = flagOn(flags, "--write");
  const target = outputTarget(flags, "--ledger", write, null);
  if (!target.ok) return target.result;
  const ledgerPath = flagString(flags, "--ledger");

  if (kind === "read") {
    const loaded = readExisting(ledgerPath, loadReadLedger);
    if (!loaded.ok) return loaded.result;
    const records = [...loaded.records, { id, readAt: at }];
    const duplicates = duplicateLedgerIds(records.map((record) => record.id));
    if (duplicates.length > 0) return invalid(duplicates);
    const file = { kind: "read-ledger" as const, records };
    return commitLedger(loaded, ledgerPath, write, target.path, file);
  }

  const loaded = readExisting(ledgerPath, loadSentLedger);
  if (!loaded.ok) return loaded.result;
  const records = [...loaded.records, { id, sentAt: at, channel: sentChannel }];
  const duplicates = duplicateLedgerIds(records.map((record) => record.id));
  if (duplicates.length > 0) return invalid(duplicates);
  const file = { kind: "sent-ledger" as const, records };
  return commitLedger(loaded, ledgerPath, write, target.path, file);
}

type Produced = { stdout: unknown; file: unknown };

function withCandidates(
  input: string,
  writePath: string | null,
  produce: (items: PrivateCandidate[]) => Result<Produced>,
): RunResult {
  const read = readHashed(input);
  if (!read.ok) return read.result;
  const loaded = loadCandidates(read.text);
  if (!loaded.ok) return invalid(loaded.errors);
  const produced = produce(loaded.value);
  if (!produced.ok) return invalid(produced.errors);
  return commitInput(input, read.hash, writePath, produced.value.file, produced.value.stdout);
}

function commitInput(
  input: string,
  hash: string,
  writePath: string | null,
  fileValue: unknown,
  stdoutValue: unknown,
): RunResult {
  const changed = assertUnchanged(input, hash);
  if (changed) return changed;
  if (writePath) {
    const wrote = writeJson(writePath, fileValue);
    if (wrote) return wrote;
    const changedAfter = assertUnchanged(input, hash);
    if (changedAfter) return changedAfter;
  }
  return okOut(stdoutValue);
}

function outputTarget(
  flags: FlagMap,
  name: string,
  write: boolean,
  inputPath: string | null,
): { ok: true; path: string | null } | { ok: false; result: RunResult } {
  const out = flagString(flags, name);
  if (write && !out) return { ok: false, result: usage(["write-requires-output"]) };
  if (!out) return { ok: true, path: null };
  const allowed = checkWritable(out);
  if (!allowed.ok) return { ok: false, result: invalid(allowed.errors) };
  if (inputPath && resolveFinal(inputPath) === allowed.path) {
    return { ok: false, result: usage(["refused-path:input"]) };
  }
  return { ok: true, path: write ? allowed.path : null };
}

function isPrivateStatus(value: string): value is PrivateStatus {
  return (PRIVATE_STATUSES as readonly string[]).includes(value);
}

type LoadedLedger<T> = { ok: true; records: T[]; hash: string | null } | { ok: false; result: RunResult };

function readExisting<T>(
  ledgerPath: string | undefined,
  parse: (text: string) => Result<{ records: T[] }>,
): LoadedLedger<T> {
  if (!ledgerPath || !existsSync(ledgerPath)) return { ok: true, records: [], hash: null };
  const read = readHashed(ledgerPath);
  if (!read.ok) return { ok: false, result: read.result };
  const parsed = parse(read.text);
  if (!parsed.ok) return { ok: false, result: invalid(parsed.errors) };
  return { ok: true, records: parsed.value.records, hash: read.hash };
}

function commitLedger(
  loaded: { hash: string | null },
  ledgerPath: string | undefined,
  write: boolean,
  writePath: string | null,
  file: unknown,
): RunResult {
  if (ledgerPath && loaded.hash && !write) {
    const changed = assertUnchanged(ledgerPath, loaded.hash);
    if (changed) return changed;
  }
  if (writePath) {
    const wrote = writeJson(writePath, file);
    if (wrote) return wrote;
  }
  return okOut(file);
}
