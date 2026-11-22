import { ELIGIBILITY_KEYS, PRIVATE_CANDIDATE_KEYS, PUBLIC_ITEM_KEYS } from "./fields";
import { isUpdatedAt } from "./dates";
import {
  duplicateErrors,
  exactKeys,
  findForbiddenKeys,
  isPlainObject,
  scanText,
} from "./inspect";
import { checkPriorityCase, parsePriorityCase } from "./priority";
import { fail, ok, type Result } from "./result";
import {
  readEnum,
  readString,
  readStringArray,
  checkCoverage,
} from "./schema";
import { checkSourceDate } from "./dates";
import { isHttpUrl } from "./inspect";
import {
  PRIVATE_STATUSES,
  PRIORITIES,
  RIGHTS_BASES,
  type Priority,
  type PrivateCandidate,
  type PrivateStatus,
  type PublicItem,
  type PublicationLedgerRecord,
  type ReleaseCandidateFile,
  type ReleaseCandidateItem,
} from "./types";

const PRIVATE_ID = /^[a-z][a-z0-9-]{2,63}$/;
const DEMO_ID = /^demo-[a-z0-9]+(?:-[a-z0-9]+)*$/;

const TRANSITIONS: Record<PrivateStatus, readonly PrivateStatus[]> = {
  draft: ["review"],
  review: ["approved"],
  approved: ["published"],
  published: ["retracted"],
  retracted: [],
};

export function transition(from: PrivateStatus, to: PrivateStatus): Result<PrivateStatus> {
  if (!TRANSITIONS[from].includes(to)) return fail(`bad-transition:${from}->${to}`);
  return ok(to);
}

export function parsePrivateCandidate(value: unknown): Result<PrivateCandidate> {
  const errors = [...findForbiddenKeys(value), ...scanText(value)];
  if (!isPlainObject(value)) return fail(...errors, "bad-type:$");
  errors.push(...exactKeys(value, PRIVATE_CANDIDATE_KEYS, "$"));
  if ("publication" in value) errors.push("unknown-key:$.publication");

  const id = readString(value, "id", "$", errors, 3, 80);
  const title = readString(value, "title", "$", errors, 4, 80);
  const topics = readStringArray(value.topics, "$.topics", errors, 1, 4, 1, 16);
  const priority = readEnum(value.priority, PRIORITIES, "$.priority", errors);
  const facts = readStringArray(value.facts, "$.facts", errors, 1, 6, 4, 500);
  const inferences = readStringArray(value.inferences, "$.inferences", errors, 0, 6, 4, 500);
  const analysis = readString(value, "analysis", "$", errors, 4, 500);
  const sourceName = readString(value, "sourceName", "$", errors, 2, 80);
  const sourceUrl = readString(value, "sourceUrl", "$", errors, 8, 200);
  const updatedAt = readString(value, "updatedAt", "$", errors, 20, 40);
  const status = readEnum(value.status, PRIVATE_STATUSES, "$.status", errors);
  errors.push(...checkSourceDate(value.sourcePublishedAt, "$.sourcePublishedAt"));
  errors.push(...checkCoverage(value.coverage, "$.coverage"));
  if (typeof value.demo !== "boolean") errors.push("bad-type:$.demo");
  if (typeof sourceUrl === "string" && !isHttpUrl(sourceUrl)) errors.push("bad-url:$.sourceUrl");
  if (typeof updatedAt === "string" && !isUpdatedAt(updatedAt)) errors.push("bad-updatedAt:$.updatedAt");
  if (typeof id === "string" && value.demo === true && !DEMO_ID.test(id)) errors.push("bad-id:$");
  if (typeof id === "string" && value.demo === false && !PRIVATE_ID.test(id)) errors.push("bad-id:$");

  const eligibility = parseEligibility(value.eligibility, errors);
  const priorityParsed = parsePriorityCase(value.priorityCase);
  errors.push(...priorityParsed.errors);

  if (
    errors.length > 0 ||
    id === null ||
    title === null ||
    topics === null ||
    priority === null ||
    facts === null ||
    inferences === null ||
    analysis === null ||
    sourceName === null ||
    sourceUrl === null ||
    updatedAt === null ||
    status === null ||
    eligibility === null ||
    priorityParsed.value === null ||
    typeof value.demo !== "boolean"
  ) {
    return fail(...(errors.length > 0 ? errors : ["bad-type:$"]));
  }

  const candidate: PrivateCandidate = {
    id,
    title,
    topics,
    priority: priority as Priority,
    facts,
    inferences,
    analysis,
    sourceName,
    sourceUrl,
    sourcePublishedAt: value.sourcePublishedAt as PrivateCandidate["sourcePublishedAt"],
    updatedAt,
    coverage: value.coverage as PrivateCandidate["coverage"],
    status: status as PrivateStatus,
    demo: value.demo,
    eligibility,
    priorityCase: priorityParsed.value,
  };
  errors.push(...checkPriorityCase(candidate.priority, candidate.priorityCase));
  if (errors.length > 0) return fail(...errors);
  return ok(candidate);
}

function parseEligibility(value: unknown, errors: string[]): PrivateCandidate["eligibility"] | null {
  if (!isPlainObject(value)) {
    errors.push("bad-type:$.eligibility");
    return null;
  }
  errors.push(...exactKeys(value, ELIGIBILITY_KEYS, "$.eligibility"));
  if (typeof value.redistributionAllowed !== "boolean") {
    errors.push("bad-type:$.eligibility.redistributionAllowed");
  }
  if (typeof value.humanApproved !== "boolean") errors.push("bad-type:$.eligibility.humanApproved");
  if (typeof value.sourceValidated !== "boolean") errors.push("bad-type:$.eligibility.sourceValidated");
  const rightsBasis = readEnum(value.rightsBasis, RIGHTS_BASES, "$.eligibility.rightsBasis", errors);
  if (
    typeof value.redistributionAllowed !== "boolean" ||
    typeof value.humanApproved !== "boolean" ||
    typeof value.sourceValidated !== "boolean" ||
    rightsBasis === null
  ) {
    return null;
  }
  return {
    redistributionAllowed: value.redistributionAllowed,
    rightsBasis,
    humanApproved: value.humanApproved,
    sourceValidated: value.sourceValidated,
  };
}

export function checkEligibility(
  item: PrivateCandidate,
  mode: "real" | "sample",
): Result<PrivateCandidate> {
  const errors = [...checkPriorityCase(item.priority, item.priorityCase)];
  if (item.status !== "approved") errors.push("not-approved");
  if (item.eligibility.humanApproved !== true) errors.push("human-approval-required");
  if (item.eligibility.sourceValidated !== true) errors.push("source-validation-required");
  if (mode === "sample") {
    if (item.demo !== true) errors.push("sample-requires-demo");
    if (item.eligibility.rightsBasis !== "sample-synthetic") {
      errors.push("sample-requires-synthetic-basis");
    }
    if (item.eligibility.redistributionAllowed !== false) {
      errors.push("sample-must-not-claim-redistribution-right");
    }
  } else {
    if (item.eligibility.rightsBasis !== "owner-authorized-public") {
      errors.push("real-requires-owner-authorization");
    }
    if (item.eligibility.redistributionAllowed !== true) {
      errors.push("real-requires-affirmative-right");
    }
  }
  if (errors.length > 0) return fail(...errors);
  return ok(item);
}

const RELEASE_NOTE = "导出只生成待审副本，不标记 published，也不表示已经部署。";

export function buildReleaseCandidate(
  items: readonly PrivateCandidate[],
  mode: "real" | "sample",
): Result<ReleaseCandidateFile> {
  const errors: string[] = [];
  const projected: ReleaseCandidateItem[] = [];
  items.forEach((item, index) => {
    const eligible = checkEligibility(item, mode);
    if (!eligible.ok) {
      eligible.errors.forEach((error) => errors.push(`item[${index}]:${error}`));
      return;
    }
    projected.push(projectReleaseItem(item));
  });
  errors.push(...duplicateErrors(projected));
  if (errors.length > 0) return fail(...errors);
  const file: ReleaseCandidateFile = {
    kind: "public-release-candidate",
    sampleOnly: mode === "sample",
    publicationConfirmed: false,
    generatedBy: "export-public",
    note: RELEASE_NOTE,
    items: projected,
  };
  return ok(file);
}

function projectReleaseItem(item: PrivateCandidate): ReleaseCandidateItem {
  return {
    id: item.id,
    title: item.title,
    topics: [...item.topics],
    priority: item.priority,
    facts: [...item.facts],
    inferences: [...item.inferences],
    analysis: item.analysis,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    sourcePublishedAt: { ...item.sourcePublishedAt },
    updatedAt: item.updatedAt,
    coverage: {
      completeness: item.coverage.completeness,
      examinedCount: item.coverage.examinedCount,
      completeCount: item.coverage.completeCount,
      warnings: [...item.coverage.warnings],
    },
    demo: item.demo,
    release: {
      state: "approved-unpublished",
      publicationConfirmed: false,
    },
  };
}

export function buildPublishedLocalCopy(
  item: PrivateCandidate,
  deploymentUrl: string,
): Result<PublicItem> {
  if (item.demo !== true) return fail("mvp-site-is-demo-only");
  if (!isHttpUrl(deploymentUrl) || !deploymentUrl.startsWith("https://")) {
    return fail("deployment-url-required");
  }
  const mode = item.eligibility.rightsBasis === "sample-synthetic" ? "sample" : "real";
  const eligible = checkEligibility(item, mode);
  if (!eligible.ok) return eligible;
  const moved = transition(item.status, "published");
  if (!moved.ok) return moved;
  const note = `本地副本，命令未访问网络。地址：${deploymentUrl}`;
  if (note.length > 200) return fail("bad-length:$.publication.note");
  const publicValue = {
    id: item.id,
    title: item.title,
    topics: [...item.topics],
    priority: item.priority,
    facts: [...item.facts],
    inferences: [...item.inferences],
    analysis: item.analysis,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    sourcePublishedAt: { ...item.sourcePublishedAt },
    updatedAt: item.updatedAt,
    coverage: {
      ...item.coverage,
      warnings: [...item.coverage.warnings],
    },
    status: "published" as const,
    demo: true as const,
    publication: {
      confirmed: true,
      note,
    },
  };
  const keys = Object.keys(publicValue);
  const missing = PUBLIC_ITEM_KEYS.filter((key) => !keys.includes(key));
  if (missing.length > 0) return fail(...missing.map((key) => `missing-key:$.${key}`));
  return ok(publicValue);
}

export function createPublicationLedgerRecord(input: {
  id: string;
  recordedAt: string;
  deploymentUrl: string | null;
  state: PublicationLedgerRecord["state"];
}): Result<PublicationLedgerRecord> {
  if (!isUpdatedAt(input.recordedAt)) return fail("bad-updatedAt:$.recordedAt");
  if (input.deploymentUrl !== null && !isHttpUrl(input.deploymentUrl)) return fail("bad-url:$.deploymentUrl");
  const record: PublicationLedgerRecord = {
    id: input.id,
    recordedAt: input.recordedAt,
    deploymentUrl: input.deploymentUrl,
    state: input.state,
    deployed: false,
    note: "deployed 固定为 false。本工具不探测现网，也不能代替部署。",
  };
  return ok(record);
}
