export const PUBLIC_ITEM_KEYS = [
  "id",
  "title",
  "topics",
  "priority",
  "facts",
  "inferences",
  "analysis",
  "sourceName",
  "sourceUrl",
  "sourcePublishedAt",
  "updatedAt",
  "coverage",
  "status",
  "demo",
  "publication",
] as const;

export const SOURCE_DATE_KEYS = [
  "raw",
  "year",
  "month",
  "day",
  "time",
  "timezone",
  "certainty",
] as const;

export const COVERAGE_KEYS = [
  "completeness",
  "examinedCount",
  "completeCount",
  "warnings",
] as const;

export const PUBLICATION_KEYS = ["confirmed", "note"] as const;

export const SITE_META_KEYS = [
  "name",
  "tagline",
  "description",
  "updatedAt",
  "latestLimit",
  "paginationAvailable",
  "demo",
  "limitNote",
] as const;

export const PRIVATE_CANDIDATE_KEYS = [
  ...PUBLIC_ITEM_KEYS.filter((key) => key !== "publication"),
  "eligibility",
  "priorityCase",
] as const;

export const ELIGIBILITY_KEYS = [
  "redistributionAllowed",
  "rightsBasis",
  "humanApproved",
  "sourceValidated",
] as const;

export const PRIORITY_CASE_KEYS = [
  "observation",
  "buyerOrPayer",
  "paymentSignal",
  "need",
  "delivery",
  "testPlan",
  "risks",
  "evidenceGaps",
] as const;

export const RELEASE_FILE_KEYS = [
  "kind",
  "sampleOnly",
  "publicationConfirmed",
  "generatedBy",
  "note",
  "items",
] as const;

export const RELEASE_ITEM_KEYS = [
  "id",
  "title",
  "topics",
  "priority",
  "facts",
  "inferences",
  "analysis",
  "sourceName",
  "sourceUrl",
  "sourcePublishedAt",
  "updatedAt",
  "coverage",
  "demo",
  "release",
] as const;

export const RELEASE_STATE_KEYS = ["state", "publicationConfirmed"] as const;

export const READ_LEDGER_KEYS = ["kind", "records"] as const;
export const READ_RECORD_KEYS = ["id", "readAt"] as const;
export const SENT_RECORD_KEYS = ["id", "sentAt", "channel"] as const;
export const PUBLICATION_RECORD_KEYS = [
  "id",
  "recordedAt",
  "deploymentUrl",
  "state",
  "deployed",
  "note",
] as const;

/** Keys that must never appear anywhere in a public or candidate document. */
export const FORBIDDEN_KEY_NORMALIZED = [
  "membertext",
  "memberid",
  "inbox",
  "rawevidence",
  "privateevidence",
  "oauth",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "password",
  "passwd",
  "secret",
  "authorization",
  "cookie",
  "session",
  "mcp",
  "mcppayload",
  "credentials",
  "email",
  "phone",
  "userid",
  "seen",
  "readat",
  "sentat",
  "privatenotes",
  "rawmembership",
  "scys",
  "token",
  "bearer",
] as const;
