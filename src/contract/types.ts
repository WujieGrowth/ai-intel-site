export const PRIORITIES = ["P0", "P1", "P2"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PUBLIC_STATUSES = ["published", "retracted"] as const;
export type PublicStatus = (typeof PUBLIC_STATUSES)[number];

export const PRIVATE_STATUSES = [
  "draft",
  "review",
  "approved",
  "published",
  "retracted",
] as const;
export type PrivateStatus = (typeof PRIVATE_STATUSES)[number];

export const DATE_CERTAINTIES = [
  "complete",
  "date-only",
  "year-missing",
  "time-unknown",
  "unknown",
] as const;
export type DateCertainty = (typeof DATE_CERTAINTIES)[number];

export const RIGHTS_BASES = [
  "sample-synthetic",
  "owner-authorized-public",
  "unverified",
] as const;
export type RightsBasis = (typeof RIGHTS_BASES)[number];

export interface SourcePublishedAt {
  raw: string | null;
  year: number | null;
  month: number | null;
  day: number | null;
  time: string | null;
  timezone: string | null;
  certainty: DateCertainty;
}

export interface Coverage {
  completeness: "partial" | "complete";
  examinedCount: number;
  completeCount: number;
  warnings: string[];
}

export interface PublicationMark {
  confirmed: boolean;
  note: string;
}

export interface PublicItem {
  id: string;
  title: string;
  topics: string[];
  priority: Priority;
  facts: string[];
  inferences: string[];
  analysis: string;
  sourceName: string;
  sourceUrl: string;
  sourcePublishedAt: SourcePublishedAt;
  updatedAt: string;
  coverage: Coverage;
  status: PublicStatus;
  demo: boolean;
  publication: PublicationMark;
}

export interface SiteMeta {
  name: string;
  tagline: string;
  description: string;
  updatedAt: string;
  latestLimit: number;
  paginationAvailable: false;
  demo: boolean;
  limitNote: string;
}

export interface Eligibility {
  redistributionAllowed: boolean;
  rightsBasis: RightsBasis;
  humanApproved: boolean;
  sourceValidated: boolean;
}

export interface PriorityCase {
  observation: string;
  buyerOrPayer: string | null;
  paymentSignal: string | null;
  need: string | null;
  delivery: string | null;
  testPlan: string | null;
  risks: string | null;
  evidenceGaps: string[];
}

export interface PrivateCandidate {
  id: string;
  title: string;
  topics: string[];
  priority: Priority;
  facts: string[];
  inferences: string[];
  analysis: string;
  sourceName: string;
  sourceUrl: string;
  sourcePublishedAt: SourcePublishedAt;
  updatedAt: string;
  coverage: Coverage;
  status: PrivateStatus;
  demo: boolean;
  eligibility: Eligibility;
  priorityCase: PriorityCase;
}

export interface ReleaseCandidateItem {
  id: string;
  title: string;
  topics: string[];
  priority: Priority;
  facts: string[];
  inferences: string[];
  analysis: string;
  sourceName: string;
  sourceUrl: string;
  sourcePublishedAt: SourcePublishedAt;
  updatedAt: string;
  coverage: Coverage;
  demo: boolean;
  release: {
    state: "approved-unpublished";
    publicationConfirmed: false;
  };
}

export interface ReleaseCandidateFile {
  kind: "public-release-candidate";
  sampleOnly: boolean;
  publicationConfirmed: false;
  generatedBy: "export-public";
  note: string;
  items: ReleaseCandidateItem[];
}

export interface ReadLedgerRecord {
  id: string;
  readAt: string;
}

export interface SentLedgerRecord {
  id: string;
  sentAt: string;
  channel: string;
}

export interface PublicationLedgerRecord {
  id: string;
  recordedAt: string;
  deploymentUrl: string | null;
  state: "awaiting-deployment" | "published-local-copy";
  deployed: false;
  note: string;
}

export interface ReadLedgerFile {
  kind: "read-ledger";
  records: ReadLedgerRecord[];
}

export interface SentLedgerFile {
  kind: "sent-ledger";
  records: SentLedgerRecord[];
}

export interface PublicationLedgerFile {
  kind: "publication-ledger";
  records: PublicationLedgerRecord[];
}
