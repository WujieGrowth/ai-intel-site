import { flagOn, flagString, type FlagMap } from "./args";
import { readRawFeed } from "../src/bridge/raw-feed";
import { assertUnchanged, invalid, okOut, readHashed, usage, writeJson, checkWritable, resolveFinal, type RunResult } from "./safe-path";

/** Read a local connector body. Editorial text is dropped and nothing is publishable. */
export function importRawCommand(flags: FlagMap): RunResult {
  const input = flagString(flags, "--input");
  if (!input) return usage(["missing-flag:--input"]);
  const write = flagOn(flags, "--write");
  const privateOut = flagString(flags, "--private-out");
  if (write && !privateOut) return usage(["write-requires-output"]);
  const target = checkedOutput(privateOut, input);
  if (!target.ok) return target.result;

  const read = readHashed(input);
  if (!read.ok) return read.result;
  const decided = readRawFeed(read.text);
  if (!decided.ok) return invalid(decided.errors);
  const changed = assertUnchanged(input, read.hash);
  if (changed) return changed;

  const decision = decided.value;
  const privateFile = {
    kind: "private-raw-dedup" as const,
    scheduled: false as const,
    publishable: 0 as const,
    records: decision.records,
  };
  if (write && target.path) {
    const wrote = writeJson(target.path, privateFile);
    if (wrote) return wrote;
    const changedAfter = assertUnchanged(input, read.hash);
    if (changedAfter) return changedAfter;
  }
  return okOut({
    ok: true,
    command: "import-raw",
    scheduled: false,
    endToEnd: false,
    publishable: 0,
    kept: decision.records.length,
    reasons: decision.refusalReasons,
  });
}

function checkedOutput(
  target: string | undefined,
  input: string,
): { ok: true; path: string | null } | { ok: false; result: RunResult } {
  if (!target) return { ok: true, path: null };
  const allowed = checkWritable(target);
  if (!allowed.ok) return { ok: false, result: invalid(allowed.errors) };
  if (resolveFinal(input) === allowed.path) return { ok: false, result: usage(["refused-path:input"]) };
  return { ok: true, path: allowed.path };
}
