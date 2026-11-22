import { PRIORITY_CASE_KEYS } from "./fields";
import { exactKeys, isPlainObject } from "./inspect";
import { readNullableString, readString, readStringArray } from "./schema";
import type { Priority, PriorityCase } from "./types";

const PLACEHOLDER = /^(未知|不详|无|没有|暂无|N\/A|n\/a|null|undefined|待定|不清楚)$/;

export function parsePriorityCase(value: unknown): { errors: string[]; value: PriorityCase | null } {
  const errors: string[] = [];
  if (!isPlainObject(value)) return { errors: ["bad-type:$.priorityCase"], value: null };
  errors.push(...exactKeys(value, PRIORITY_CASE_KEYS, "$.priorityCase"));
  const observation = readString(value, "observation", "$.priorityCase", errors, 8, 500);
  const buyerOrPayer = readNullableString(value.buyerOrPayer, "$.priorityCase.buyerOrPayer", errors, 8, 200);
  const paymentSignal = readNullableString(value.paymentSignal, "$.priorityCase.paymentSignal", errors, 8, 200);
  const need = readNullableString(value.need, "$.priorityCase.need", errors, 8, 200);
  const delivery = readNullableString(value.delivery, "$.priorityCase.delivery", errors, 8, 200);
  const testPlan = readNullableString(value.testPlan, "$.priorityCase.testPlan", errors, 8, 200);
  const risks = readNullableString(value.risks, "$.priorityCase.risks", errors, 8, 200);
  const evidenceGaps = readStringArray(value.evidenceGaps, "$.priorityCase.evidenceGaps", errors, 0, 6, 4, 200);
  if (
    observation === null ||
    buyerOrPayer === undefined ||
    paymentSignal === undefined ||
    need === undefined ||
    delivery === undefined ||
    testPlan === undefined ||
    risks === undefined ||
    evidenceGaps === null
  ) {
    return { errors, value: null };
  }
  return {
    errors,
    value: {
      observation,
      buyerOrPayer,
      paymentSignal,
      need,
      delivery,
      testPlan,
      risks,
      evidenceGaps,
    },
  };
}

export function checkPriorityCase(priority: Priority, priorityCase: PriorityCase): string[] {
  const errors: string[] = [];
  if (priority === "P0") {
    requireConcrete(priorityCase.buyerOrPayer, "p0-missing-buyer", errors);
    requireConcrete(priorityCase.paymentSignal, "p0-missing-payment", errors);
    requireConcrete(priorityCase.need, "p0-missing-need", errors);
    requireConcrete(priorityCase.delivery, "p0-missing-delivery", errors);
    requireConcrete(priorityCase.testPlan, "p0-missing-test", errors);
    requireConcrete(priorityCase.risks, "p0-missing-risk", errors);
  } else if (priority === "P1") {
    requireConcrete(priorityCase.need, "p1-missing-need", errors);
    requireConcrete(priorityCase.testPlan, "p1-missing-path", errors);
    if (priorityCase.evidenceGaps.length < 1) errors.push("p1-missing-gap");
  } else {
    if (priorityCase.buyerOrPayer !== null || priorityCase.paymentSignal !== null) {
      errors.push("p2-has-commercial-signal");
    }
    if (priorityCase.delivery !== null || priorityCase.testPlan !== null || priorityCase.need !== null) {
      errors.push("p2-has-testable-path");
    }
    if (priorityCase.evidenceGaps.length < 1) errors.push("p2-missing-gap");
  }
  return errors;
}

function requireConcrete(value: string | null, code: string, errors: string[]): void {
  if (value === null || PLACEHOLDER.test(value)) errors.push(code);
}
