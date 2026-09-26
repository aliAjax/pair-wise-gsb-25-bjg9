import { RULES } from "./catalog";
import type { EyeSide, PlanStatus, StainGrade } from "../types";

/** 判定层：全部为纯函数，不接触存储与界面 */

export interface EyeVerdict {
  eye: EyeSide;
  needsReview: boolean;
  reasons: string[];
}

export interface ValidatedAssessment {
  butFirst: number;
  butSecond: number;
  stainGrade: StainGrade;
}

/** 单眼规则：任一眼 BUT 不足 5 秒，或染色达到 3 级 → 待复核 */
export function evaluateEye(
  eye: EyeSide,
  input: ValidatedAssessment,
): EyeVerdict {
  const reasons: string[] = [];
  const { butFirst, butSecond, stainGrade } = input;
  const eyeLabel = eye === "OD" ? "右眼" : "左眼";

  if (butFirst < RULES.BUT_MIN_SECONDS) {
    reasons.push(
      `${eyeLabel}第 1 次破裂时间 ${butFirst}s ＜ ${RULES.BUT_MIN_SECONDS}s`,
    );
  }
  if (butSecond < RULES.BUT_MIN_SECONDS) {
    reasons.push(
      `${eyeLabel}第 2 次破裂时间 ${butSecond}s ＜ ${RULES.BUT_MIN_SECONDS}s`,
    );
  }
  if (stainGrade >= RULES.STAIN_REVIEW_GRADE) {
    reasons.push(
      `${eyeLabel}角膜染色 ${stainGrade} 级 ≥ ${RULES.STAIN_REVIEW_GRADE} 级`,
    );
  }

  return { eye, needsReview: reasons.length > 0, reasons };
}

/** 双眼汇总：任意一眼异常即需待复核 */
export function summarize(verdicts: EyeVerdict[]): {
  needsReview: boolean;
  reasons: string[];
} {
  return {
    needsReview: verdicts.some((v) => v.needsReview),
    reasons: verdicts.flatMap((v) => v.reasons),
  };
}

/** 只有「可排程」状态允许占用时段；冻结/待复核/待确认一律拦截 */
export function canBookSlot(status: PlanStatus): boolean {
  return status === "ready";
}

export type SlotIssue = "ok" | "conflict" | "status_blocked";

export function slotDecision(
  status: PlanStatus,
  occupiedByOther: boolean,
): SlotIssue {
  if (!canBookSlot(status)) return "status_blocked";
  if (occupiedByOther) return "conflict";
  return "ok";
}

/** 护理后复查能否提交（仅待复核计划） */
export function canSubmitRecheck(status: PlanStatus): boolean {
  return status === "pending_review";
}

/** 医生是否需要处理 */
export function needsDoctor(status: PlanStatus): boolean {
  return status === "awaiting_doctor";
}

/** 冻结计划不可再做任何操作（只读） */
export function isFrozen(status: PlanStatus): boolean {
  return status === "frozen";
}
