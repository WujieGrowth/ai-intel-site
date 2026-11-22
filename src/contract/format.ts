import type { Coverage, DateCertainty, Priority } from "./types";

export function formatCoverage(coverage: Coverage): string {
  if (coverage.completeness === "complete") {
    return `完整覆盖：完成 ${coverage.completeCount} / 检视 ${coverage.examinedCount}。`;
  }
  const warningText = coverage.warnings.join("");
  return `部分覆盖：完成 ${coverage.completeCount} / 检视 ${coverage.examinedCount}。${warningText}`;
}

export function formatCertainty(certainty: DateCertainty): string {
  switch (certainty) {
    case "complete":
      return "日期、时刻和时区都有来源依据";
    case "date-only":
      return "只有日期，时刻与时区未知";
    case "year-missing":
      return "缺少年份，未补全";
    case "time-unknown":
      return "时刻未知";
    case "unknown":
      return "来源时间未知，未推测";
  }
}

export function formatPriority(priority: Priority): string {
  switch (priority) {
    case "P0":
      return "P0 · 有具体的买方、交付和验证路径（不是收入保证）";
    case "P1":
      return "P1 · 有可检验路径，证据仍有缺口";
    case "P2":
      return "P2 · 观察记录，证明弱";
  }
}
