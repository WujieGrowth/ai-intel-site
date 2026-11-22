import {
  PUBLICATION_RECORD_KEYS,
  READ_LEDGER_KEYS,
  READ_RECORD_KEYS,
  RELEASE_FILE_KEYS,
  RELEASE_ITEM_KEYS,
  RELEASE_STATE_KEYS,
  SENT_RECORD_KEYS,
} from "../src/contract/fields";
import {
  canonicalizeHttpUrl,
  deepTrim,
  duplicateErrors,
  fail,
  findForbiddenKeys,
  isHttpUrl,
  isPlainObject,
  isUpdatedAt,
  ok,
  parseJsonText,
  parsePrivateCandidate,
  type PrivateCandidate,
  type Result,
} from "../src/contract/index";
import type {
  PublicationLedgerFile,
  PublicationLedgerRecord,
  ReadLedgerFile,
  SentLedgerFile,
} from "../src/contract/types";
import { exactKeys, scanText } from "../src/contract/inspect";

export function loadCandidates(text: string): Result<PrivateCandidate[]> {
  const parsed = parseJsonText(text);
  if (!parsed.ok) return parsed;
  if (!Array.isArray(parsed.value)) return fail("bad-type:$");

  const errors: string[] = [];
  const items: PrivateCandidate[] = [];
  parsed.value.forEach((raw, index) => {
    const trimmed = deepTrim(raw);
    if (isPlainObject(trimmed) && typeof trimmed.sourceUrl === "string") {
      trimmed.sourceUrl = canonicalizeHttpUrl(trimmed.sourceUrl);
    }
    const result = parsePrivateCandidate(trimmed);
    if (!result.ok) {
      for (const error of result.errors) errors.push(`item[${index}]:${error}`);
      return;
    }
    items.push(result.value);
  });
  if (errors.length > 0) return fail(...errors);
  const duplicates = duplicateErrors(items);
  if (duplicates.length > 0) return fail(...duplicates);
  return ok(items);
}

export function loadReleaseIds(text: string): Result<string[]> {
  const parsed = parseJsonText(text);
  if (!parsed.ok) return parsed;
  const errors = [...findForbiddenKeys(parsed.value), ...scanText(parsed.value)];
  if (!isPlainObject(parsed.value)) return fail(...errors, "bad-type:$");
  errors.push(...exactKeys(parsed.value, RELEASE_FILE_KEYS, "$"));
  if (parsed.value.kind !== "public-release-candidate") errors.push("bad-type:$.kind");
  if (parsed.value.publicationConfirmed !== false) errors.push("publication-confirmed-must-stay-false");
  if (typeof parsed.value.sampleOnly !== "boolean") errors.push("bad-type:$.sampleOnly");
  if (parsed.value.generatedBy !== "export-public") errors.push("bad-type:$.generatedBy");
  if (typeof parsed.value.note !== "string") errors.push("bad-type:$.note");
  if (!Array.isArray(parsed.value.items)) return fail(...errors, "bad-type:$.items");

  const ids: string[] = [];
  parsed.value.items.forEach((item, index) => {
    const itemPath = `$.items[${index}]`;
    if (!isPlainObject(item)) {
      errors.push(`bad-type:${itemPath}`);
      return;
    }
    errors.push(...exactKeys(item, RELEASE_ITEM_KEYS, itemPath));
    if (typeof item.id !== "string" || item.id.length === 0) {
      errors.push(`bad-type:${itemPath}.id`);
    } else {
      ids.push(item.id);
    }
    if (!isPlainObject(item.release)) {
      errors.push(`bad-type:${itemPath}.release`);
      return;
    }
    errors.push(...exactKeys(item.release, RELEASE_STATE_KEYS, `${itemPath}.release`));
    if (item.release.state !== "approved-unpublished") errors.push(`bad-type:${itemPath}.release.state`);
    if (item.release.publicationConfirmed !== false) errors.push("publication-confirmed-must-stay-false");
  });
  if (errors.length > 0) return fail(...errors);
  return ok(ids);
}

export function loadPublicationLedger(text: string): Result<PublicationLedgerFile> {
  const parsed = parseJsonText(text);
  if (!parsed.ok) return parsed;
  const errors = [...findForbiddenKeys(parsed.value), ...scanText(parsed.value)];
  if (!isPlainObject(parsed.value)) return fail(...errors, "bad-type:$");
  errors.push(...exactKeys(parsed.value, READ_LEDGER_KEYS, "$"));
  if (parsed.value.kind !== "publication-ledger") errors.push("bad-type:$.kind");
  if (!Array.isArray(parsed.value.records)) return fail(...errors, "bad-type:$.records");

  const records: PublicationLedgerRecord[] = [];
  parsed.value.records.forEach((record, index) => {
    const taken = takePublicationRecord(record, `$.records[${index}]`, errors);
    if (taken) records.push(taken);
  });
  if (errors.length > 0) return fail(...errors);
  return ok({ kind: "publication-ledger", records });
}

export function loadReadLedger(text: string): Result<ReadLedgerFile> {
  const parsed = parseJsonText(text);
  if (!parsed.ok) return parsed;
  const errors = [...scanText(parsed.value)];
  if (!isPlainObject(parsed.value)) return fail(...errors, "bad-type:$");
  errors.push(...exactKeys(parsed.value, READ_LEDGER_KEYS, "$"));
  if (parsed.value.kind !== "read-ledger") errors.push("bad-type:$.kind");
  if (!Array.isArray(parsed.value.records)) return fail(...errors, "bad-type:$.records");

  const records: ReadLedgerFile["records"] = [];
  parsed.value.records.forEach((record, index) => {
    const taken = takeReadRecord(record, `$.records[${index}]`, errors);
    if (taken) records.push(taken);
  });
  if (errors.length > 0) return fail(...errors);
  return ok({ kind: "read-ledger", records });
}

export function loadSentLedger(text: string): Result<SentLedgerFile> {
  const parsed = parseJsonText(text);
  if (!parsed.ok) return parsed;
  const errors = [...scanText(parsed.value)];
  if (!isPlainObject(parsed.value)) return fail(...errors, "bad-type:$");
  errors.push(...exactKeys(parsed.value, READ_LEDGER_KEYS, "$"));
  if (parsed.value.kind !== "sent-ledger") errors.push("bad-type:$.kind");
  if (!Array.isArray(parsed.value.records)) return fail(...errors, "bad-type:$.records");

  const records: SentLedgerFile["records"] = [];
  parsed.value.records.forEach((record, index) => {
    const taken = takeSentRecord(record, `$.records[${index}]`, errors);
    if (taken) records.push(taken);
  });
  if (errors.length > 0) return fail(...errors);
  return ok({ kind: "sent-ledger", records });
}

function takePublicationRecord(
  record: unknown,
  recordPath: string,
  errors: string[],
): PublicationLedgerRecord | null {
  const before = errors.length;
  if (!isPlainObject(record)) {
    errors.push(`bad-type:${recordPath}`);
    return null;
  }
  errors.push(...exactKeys(record, PUBLICATION_RECORD_KEYS, recordPath));
  if (record.deployed !== false) errors.push("deployed-must-stay-false");
  const id = record.id;
  const recordedAt = record.recordedAt;
  const deploymentUrl = record.deploymentUrl;
  const state = record.state;
  const note = record.note;
  const idOk = typeof id === "string" && id.length > 0;
  const timeOk = typeof recordedAt === "string" && isUpdatedAt(recordedAt);
  const urlOk = deploymentUrl === null || (typeof deploymentUrl === "string" && isHttpUrl(deploymentUrl));
  const stateOk = state === "awaiting-deployment" || state === "published-local-copy";
  const noteOk = typeof note === "string";
  if (!idOk) errors.push(`bad-type:${recordPath}.id`);
  if (!timeOk) errors.push(`bad-updatedAt:${recordPath}.recordedAt`);
  if (!urlOk) errors.push(`bad-url:${recordPath}.deploymentUrl`);
  if (!stateOk) errors.push(`bad-type:${recordPath}.state`);
  if (!noteOk) errors.push(`bad-type:${recordPath}.note`);
  if (!idOk || !timeOk || !urlOk || !stateOk || !noteOk || errors.length !== before) return null;
  if (typeof id !== "string" || typeof recordedAt !== "string" || typeof note !== "string") return null;
  if (!(deploymentUrl === null || typeof deploymentUrl === "string")) return null;
  if (state !== "awaiting-deployment" && state !== "published-local-copy") return null;
  return {
    id,
    recordedAt,
    deploymentUrl,
    state,
    deployed: false,
    note,
  };
}

function takeReadRecord(
  record: unknown,
  recordPath: string,
  errors: string[],
): ReadLedgerFile["records"][number] | null {
  const before = errors.length;
  if (!isPlainObject(record)) {
    errors.push(`bad-type:${recordPath}`);
    return null;
  }
  errors.push(...exactKeys(record, READ_RECORD_KEYS, recordPath));
  const id = record.id;
  const readAt = record.readAt;
  const idOk = typeof id === "string" && id.length > 0;
  const timeOk = typeof readAt === "string" && isUpdatedAt(readAt);
  if (!idOk) errors.push(`bad-type:${recordPath}.id`);
  if (!timeOk) errors.push(`bad-updatedAt:${recordPath}.readAt`);
  if (!idOk || !timeOk || errors.length !== before) return null;
  if (typeof id !== "string" || typeof readAt !== "string") return null;
  return { id, readAt };
}

function takeSentRecord(
  record: unknown,
  recordPath: string,
  errors: string[],
): SentLedgerFile["records"][number] | null {
  const before = errors.length;
  if (!isPlainObject(record)) {
    errors.push(`bad-type:${recordPath}`);
    return null;
  }
  errors.push(...exactKeys(record, SENT_RECORD_KEYS, recordPath));
  const id = record.id;
  const sentAt = record.sentAt;
  const channel = record.channel;
  const idOk = typeof id === "string" && id.length > 0;
  const timeOk = typeof sentAt === "string" && isUpdatedAt(sentAt);
  const channelOk = typeof channel === "string";
  if (!idOk) errors.push(`bad-type:${recordPath}.id`);
  if (!timeOk) errors.push(`bad-updatedAt:${recordPath}.sentAt`);
  if (!channelOk) errors.push(`bad-type:${recordPath}.channel`);
  if (!idOk || !timeOk || !channelOk || errors.length !== before) return null;
  if (typeof id !== "string" || typeof sentAt !== "string" || typeof channel !== "string") return null;
  return { id, sentAt, channel };
}

export function duplicateLedgerIds(ids: readonly string[]): string[] {
  const errors: string[] = [];
  const known = new Set<string>();
  for (const id of ids) {
    if (known.has(id)) errors.push(`ledger-duplicate:${id}`);
    known.add(id);
  }
  return errors;
}
