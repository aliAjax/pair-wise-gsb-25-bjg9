// 判定规则层：全部为纯函数，不读写存储、不依赖 React。
//
// 规则：
// 1. 两次破裂时间取均值，均值不足 5 秒 -> 待复核；
// 2. 角膜染色达到 3 级 -> 待复核；
// 3. 同一仪器同一时段只能被一个「占机中」的疗程占用；
// 4. 出现角膜上皮脱落或灼伤 -> 冻结计划，未结束的后续预约全部取消。

import { ADVERSE_LABEL, type AdverseEvent, type ConsoleData, type SessionStatus, type TreatmentPlan, type TreatmentSession } from "./types";

export const TBUT_MIN_SECONDS = 5;
export const STAINING_REVIEW_GRADE = 3;
export const SESSIONS_PER_PLAN = 3;
export const TBUT_RANGE = { min: 0, max: 60 } as const;
export const STAINING_RANGE = { min: 0, max: 5 } as const;

export interface ExamInput {
  tbutFirst: number;
  tbutSecond: number;
  staining: number;
}

export function averageTbut(exam: ExamInput): number {
  return (exam.tbutFirst + exam.tbutSecond) / 2;
}

export function examInputValid(input: ExamInput): boolean {
  const tbutOk = (value: number) =>
    Number.isFinite(value) && value >= TBUT_RANGE.min && value <= TBUT_RANGE.max;
  return (
    tbutOk(input.tbutFirst) &&
    tbutOk(input.tbutSecond) &&
    Number.isInteger(input.staining) &&
    input.staining >= STAINING_RANGE.min &&
    input.staining <= STAINING_RANGE.max
  );
}

export type ExamVerdict =
  | { kind: "pass"; avgTbut: number }
  | { kind: "review"; avgTbut: number; reasons: string[] };

export function evaluateExam(exam: ExamInput): ExamVerdict {
  const avgTbut = averageTbut(exam);
  const reasons: string[] = [];

  if (avgTbut < TBUT_MIN_SECONDS) {
    reasons.push(`破裂时间均值 ${avgTbut.toFixed(1)}s 不足 ${TBUT_MIN_SECONDS}s`);
  }
  if (exam.staining >= STAINING_REVIEW_GRADE) {
    reasons.push(`角膜染色 ${exam.staining} 级，达到 ${STAINING_REVIEW_GRADE} 级`);
  }

  return reasons.length > 0
    ? { kind: "review", avgTbut, reasons }
    : { kind: "pass", avgTbut };
}

/** 哪些状态实际占用仪器时段（待复核已释放、已完成/取消均不占用） */
const SLOT_HOLDING_STATUSES: ReadonlySet<SessionStatus> = new Set(["scheduled", "ready"]);

export function sessionHoldsSlot(session: TreatmentSession): boolean {
  return (
    SLOT_HOLDING_STATUSES.has(session.status) &&
    session.deviceId !== null &&
    session.slotId !== null
  );
}

export function isFinalSessionStatus(status: SessionStatus): boolean {
  return status === "completed" || status === "cancelled";
}

export function canBookSession(session: TreatmentSession): boolean {
  return session.status === "unscheduled" || session.status === "scheduled";
}

export function canSaveExam(session: TreatmentSession): boolean {
  return session.status === "scheduled" || session.status === "ready";
}

export function slotKey(deviceId: string, slotId: string): string {
  return `${deviceId}|${slotId}`;
}

export interface SlotOccupant {
  plan: TreatmentPlan;
  session: TreatmentSession;
}

/** 当前仪器时段占用表：同一 key 至多一条记录 */
export function occupancyBySlot(data: ConsoleData): Map<string, SlotOccupant> {
  const map = new Map<string, SlotOccupant>();
  for (const plan of data.plans) {
    for (const session of plan.sessions) {
      if (sessionHoldsSlot(session) && session.deviceId && session.slotId) {
        map.set(slotKey(session.deviceId, session.slotId), { plan, session });
      }
    }
  }
  return map;
}

export function findSlotConflict(
  data: ConsoleData,
  deviceId: string,
  slotId: string,
  ignoreSessionId?: string
): SlotOccupant | null {
  const occupant = occupancyBySlot(data).get(slotKey(deviceId, slotId));
  if (!occupant || occupant.session.id === ignoreSessionId) {
    return null;
  }
  return occupant;
}

/** 冻结计划：保留已完成的疗程，其余后续预约全部取消并记录原因 */
export function applyFreeze(
  plan: TreatmentPlan,
  event: AdverseEvent,
  reason: string,
  at: string
): { plan: TreatmentPlan; cancelled: TreatmentSession[] } {
  const cancelReason = `计划冻结：${ADVERSE_LABEL[event]}`;
  const cancelled: TreatmentSession[] = [];

  const sessions = plan.sessions.map((session) => {
    if (isFinalSessionStatus(session.status)) {
      return session;
    }
    const next: TreatmentSession = {
      ...session,
      status: "cancelled",
      cancelReason,
    };
    cancelled.push(next);
    return next;
  });

  return {
    plan: {
      ...plan,
      status: "frozen",
      frozenAt: at,
      freezeReason: reason,
      adverseEvent: event,
      sessions,
    },
    cancelled,
  };
}
