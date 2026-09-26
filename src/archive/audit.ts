// 留档层：决定「哪些事件要记录、记录成什么样」。
// 只产出 AuditSpec（不含 id 与时间），由数据层统一落库。

import {
  ADVERSE_LABEL,
  EYE_LABEL,
  type AdverseEvent,
  type AuditAction,
  type AuditEntry,
  type EyeSide,
} from "../domain/types";
import { averageTbut, SESSIONS_PER_PLAN, type ExamInput, type ExamVerdict } from "../domain/rules";

export type AuditSpec = Omit<AuditEntry, "id" | "at">;

function spec(
  actor: string,
  action: AuditAction,
  summary: string,
  planId: string | null,
  sessionId: string | null
): AuditSpec {
  return { actor, action, summary, planId, sessionId };
}

export const Audit = {
  planCreated(actor: string, patientName: string, eye: EyeSide, planId: string): AuditSpec {
    return spec(
      actor,
      "plan_created",
      `为 ${patientName} 建立${EYE_LABEL[eye]}热脉动疗程（共 ${SESSIONS_PER_PLAN} 次）`,
      planId,
      null
    );
  },

  slotBooked(
    actor: string,
    seq: number,
    deviceName: string,
    slotLabel: string,
    planId: string,
    sessionId: string
  ): AuditSpec {
    return spec(actor, "slot_booked", `第 ${seq} 次排机：${deviceName} · ${slotLabel}`, planId, sessionId);
  },

  examSaved(actor: string, seq: number, exam: ExamInput, planId: string, sessionId: string): AuditSpec {
    const avg = averageTbut(exam).toFixed(1);
    return spec(
      actor,
      "exam_saved",
      `第 ${seq} 次检查录入：破裂时间 ①${exam.tbutFirst}s ②${exam.tbutSecond}s（均值 ${avg}s），染色 ${exam.staining} 级`,
      planId,
      sessionId
    );
  },

  examVerdict(seq: number, verdict: ExamVerdict, planId: string, sessionId: string): AuditSpec {
    const summary =
      verdict.kind === "pass"
        ? `第 ${seq} 次判定：指标正常（破裂时间均值 ${verdict.avgTbut.toFixed(1)}s），可上机`
        : `第 ${seq} 次判定：待复核（${verdict.reasons.join("；")}），时段已释放`;
    return spec("系统", "exam_verdict", summary, planId, sessionId);
  },

  slotReleased(seq: number, deviceName: string, slotLabel: string, planId: string, sessionId: string): AuditSpec {
    return spec("系统", "slot_released", `第 ${seq} 次释放时段：${deviceName} · ${slotLabel}`, planId, sessionId);
  },

  reviewConfirmed(
    doctor: string,
    seq: number,
    deviceName: string,
    slotLabel: string,
    note: string,
    planId: string,
    sessionId: string
  ): AuditSpec {
    const suffix = note ? `；复查意见：${note}` : "";
    return spec(
      doctor,
      "review_confirmed",
      `第 ${seq} 次复核通过，重新排机 ${deviceName} · ${slotLabel}${suffix}`,
      planId,
      sessionId
    );
  },

  sessionCompleted(actor: string, seq: number, planId: string, sessionId: string): AuditSpec {
    return spec(actor, "session_completed", `第 ${seq} 次治疗完成`, planId, sessionId);
  },

  planFrozen(actor: string, event: AdverseEvent, reason: string, planId: string): AuditSpec {
    return spec(
      actor,
      "plan_frozen",
      `冻结计划：${ADVERSE_LABEL[event]}——${reason}；后续预约全部停止`,
      planId,
      null
    );
  },

  sessionCancelled(seq: number, reason: string, planId: string, sessionId: string): AuditSpec {
    return spec("系统", "session_cancelled", `第 ${seq} 次预约取消：${reason}`, planId, sessionId);
  },
};
