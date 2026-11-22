import { flagOn, flagString, type FlagMap } from "./args";
import { acceptVerified } from "../src/bridge/verified";
import { isUpdatedAt } from "../src/contract/dates";
import { assertUnchanged, invalid, okOut, readHashed, usage, writeJson, checkWritable, resolveFinal, type RunResult } from "./safe-path";

/** Read a reviewed public artifact. This command does not write the live feed. */
export function acceptVerifiedCommand(flags: FlagMap): RunResult {
  const input = flagString(flags, "--input");
  const at = flagString(flags, "--at");
  if (!input) return usage(["missing-flag:--input"]);
  if (!at) return usage(["missing-flag:--at"]);
  if (!isUpdatedAt(at)) return invalid(["bad-updatedAt"]);
  const write = flagOn(flags, "--write");
  const publicOut = flagString(flags, "--public-out");
  const privateOut = flagString(flags, "--private-out");
  if (write && !publicOut) return usage(["write-requires-output"]);
  const publicTarget = checkedOutput(publicOut, input);
  if (!publicTarget.ok) return publicTarget.result;
  const privateTarget = checkedOutput(privateOut, input);
  if (!privateTarget.ok) return privateTarget.result;
  if (publicTarget.path && privateTarget.path && publicTarget.path === privateTarget.path) {
    return usage(["refused-path:same-output"]);
  }

  const read = readHashed(input);
  if (!read.ok) return read.result;
  const decided = acceptVerified(read.text, at);
  if (!decided.ok) return invalid(decided.errors);
  const changed = assertUnchanged(input, read.hash);
  if (changed) return changed;

  const decision = decided.value;
  const privateFile = {
    kind: "verified-refusals" as const,
    scheduled: false as const,
    records: decision.refusals,
  };
  if (write && publicTarget.path) {
    const wrote = writeJson(publicTarget.path, {
      kind: "accepted-public-items",
      scheduled: false,
      items: decision.items,
    });
    if (wrote) return wrote;
  }
  if (write && privateTarget.path) {
    const wrote = writeJson(privateTarget.path, privateFile);
    if (wrote) return wrote;
  }
  const changedAfter = assertUnchanged(input, read.hash);
  if (changedAfter) return changedAfter;
  return okOut({
    ok: true,
    command: "accept-verified",
    scheduled: false,
    endToEnd: false,
    accepted: decision.items.length,
    refused: decision.refusals.length,
    refusalReasons: [...new Set(decision.refusals.flatMap((row) => row.reasons))],
    ids: decision.items.map((item) => item.id),
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
