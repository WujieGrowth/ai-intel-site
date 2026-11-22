import { DATE_CERTAINTIES, type DateCertainty, type SourcePublishedAt } from "./types";
import { isPlainObject, exactKeys, stringIssues } from "./inspect";
import { SOURCE_DATE_KEYS } from "./fields";

const UPDATED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIMEZONE = /^(?:Z|UTC|(?:[+-]\d{2}:\d{2})|(?:[A-Za-z_]+\/[A-Za-z0-9_+-]+))$/;

export function isUpdatedAt(value: string): boolean {
  if (!UPDATED_AT.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

export function checkSourceDate(value: unknown, path: string): string[] {
  if (!isPlainObject(value)) return [`bad-type:${path}`];
  const errors = exactKeys(value, SOURCE_DATE_KEYS, path);
  if (errors.length > 0) return errors;

  const raw = value.raw;
  const year = value.year;
  const month = value.month;
  const day = value.day;
  const time = value.time;
  const timezone = value.timezone;
  const certainty = value.certainty;

  if (raw !== null && (typeof raw !== "string" || stringIssues(raw, `${path}.raw`, 1, 80).length)) {
    errors.push(...(typeof raw === "string" ? stringIssues(raw, `${path}.raw`, 1, 80) : [`bad-type:${path}.raw`]));
  }
  if (!(year === null || (typeof year === "number" && Number.isInteger(year)))) {
    errors.push(`bad-type:${path}.year`);
  }
  if (!(month === null || (typeof month === "number" && Number.isInteger(month)))) {
    errors.push(`bad-type:${path}.month`);
  }
  if (!(day === null || (typeof day === "number" && Number.isInteger(day)))) {
    errors.push(`bad-type:${path}.day`);
  }
  if (!(time === null || typeof time === "string")) errors.push(`bad-type:${path}.time`);
  if (!(timezone === null || typeof timezone === "string")) {
    errors.push(`bad-type:${path}.timezone`);
  }
  if (typeof certainty !== "string" || !DATE_CERTAINTIES.includes(certainty as DateCertainty)) {
    errors.push(`bad-type:${path}.certainty`);
    return errors;
  }
  if (errors.length > 0) return errors;

  const date = value as unknown as SourcePublishedAt;
  if (date.year !== null && (date.year < 1000 || date.year > 9999)) {
    errors.push(`date-inconsistent:${path}`);
  }
  if (date.month !== null && (date.month < 1 || date.month > 12)) {
    errors.push(`date-inconsistent:${path}`);
  }
  if (date.day !== null && (date.day < 1 || date.day > 31)) {
    errors.push(`date-inconsistent:${path}`);
  }
  if (date.time !== null && !TIME.test(date.time)) errors.push(`date-inconsistent:${path}`);
  if (date.timezone !== null && !TIMEZONE.test(date.timezone)) {
    errors.push(`date-inconsistent:${path}`);
  }
  if (
    date.year !== null &&
    date.month !== null &&
    date.day !== null &&
    !calendarDay(date.year, date.month, date.day)
  ) {
    errors.push(`date-inconsistent:${path}`);
  }
  if (!certaintyMatches(date)) errors.push(`date-inconsistent:${path}`);
  return errors;
}

function calendarDay(year: number, month: number, day: number): boolean {
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

function certaintyMatches(date: SourcePublishedAt): boolean {
  const ymd = date.year !== null && date.month !== null && date.day !== null;
  switch (date.certainty) {
    case "complete":
      return ymd && date.time !== null && date.timezone !== null;
    case "date-only":
      return ymd && date.time === null && date.timezone === null;
    case "year-missing":
      return date.year === null && (date.raw !== null || date.month !== null || date.day !== null);
    case "time-unknown":
      return ymd && date.time === null;
    case "unknown":
      return (
        date.year === null &&
        date.month === null &&
        date.day === null &&
        date.time === null &&
        date.timezone === null
      );
    default:
      return false;
  }
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Display helper. Never fills a missing year, time, or timezone. */
export function formatSourceDate(input: SourcePublishedAt): string {
  switch (input.certainty) {
    case "complete":
      return `${input.year}-${pad(input.month ?? 0)}-${pad(input.day ?? 0)} ${input.time}（${input.timezone}）`;
    case "date-only":
      return `${input.year}-${pad(input.month ?? 0)}-${pad(input.day ?? 0)}（仅日期，时刻与时区未知）`;
    case "year-missing":
      return `原始记录「${input.raw ?? "未提供原文"}」（缺少年份，未补全）`;
    case "time-unknown": {
      const zone = input.timezone ? `时区 ${input.timezone}` : "时区未知";
      return `${input.year}-${pad(input.month ?? 0)}-${pad(input.day ?? 0)}（时刻未知，${zone}）`;
    }
    case "unknown":
      return "来源未提供时间（未知，未推测）";
    default:
      return "来源未提供时间（未知，未推测）";
  }
}
