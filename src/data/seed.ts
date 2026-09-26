import { RULES, slotKey, todayStr } from "../domain/catalog";
import { evaluateEye } from "../domain/rules";
import type {
  ActorRole,
  AuditEvent,
  EyeAssessment,
  EyeSide,
  FreezeRecord,
  TreatmentPlan,
} from "../types";

/** 数据层：演示数据。同一仪器同一时段在演示数据中也只出现一次 */

interface AppState {
  plans: TreatmentPlan[];
  assessments: EyeAssessment[];
  audits: AuditEvent[];
}

function timeAt(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function assessment(
  patientId: string,
  eye: EyeSide,
  butFirst: number,
  butSecond: number,
  stainGrade: EyeAssessment["stainGrade"],
  extra: {
    asRecheck?: boolean;
    slotResult?: EyeAssessment["slotResult"];
    slotMessage?: string;
    at: string;
    by: ActorRole;
    deviceId?: string;
    slotId?: string;
  },
): EyeAssessment {
  const verdict = evaluateEye(eye, { butFirst, butSecond, stainGrade });
  return {
    id: `ASS-${patientId}-${eye}`,
    patientId,
    eye,
    butFirst,
    butSecond,
    stainGrade,
    date: todayStr(),
    deviceId: extra.deviceId ?? "DTP-01",
    slotId: extra.slotId ?? "S1",
    asRecheck: extra.asRecheck ?? false,
    needsReview: verdict.needsReview,
    reasons: verdict.reasons,
    slotResult: extra.slotResult ?? "arranged",
    slotMessage: extra.slotMessage ?? "",
    savedAt: extra.at,
    savedBy: extra.by,
  };
}

const t = todayStr();

const plans: TreatmentPlan[] = [
  {
    id: "PL-001",
    patientId: "P-001",
    patientName: "王秀兰",
    status: "ready",
    booking: { deviceId: "DTP-01", date: t, slotId: "S2", bookedAt: timeAt(8, 42) },
    freeze: null,
    updatedAt: timeAt(8, 42),
  },
  {
    id: "PL-002",
    patientId: "P-002",
    patientName: "李建国",
    status: "pending_review",
    booking: null,
    freeze: null,
    updatedAt: timeAt(8, 55),
  },
  {
    id: "PL-003",
    patientId: "P-003",
    patientName: "赵晓梅",
    status: "frozen",
    booking: null,
    freeze: {
      type: "epithelial_defect",
      detail: "护理中发现右眼上方点片状上皮脱落，畏光流泪明显。",
      at: timeAt(9, 20),
      by: "doctor",
    } satisfies FreezeRecord,
    updatedAt: timeAt(9, 20),
  },
  {
    id: "PL-004",
    patientId: "P-004",
    patientName: "陈志远",
    status: "awaiting_doctor",
    booking: null,
    freeze: null,
    updatedAt: timeAt(9, 30),
  },
  {
    id: "PL-005",
    patientId: "P-005",
    patientName: "孙慧",
    status: "new",
    booking: null,
    freeze: null,
    updatedAt: timeAt(8, 0),
  },
];

const assessments: EyeAssessment[] = [
  // P-001：双眼正常 → 可排程，占用 DTP-01 / S2
  assessment("P-001", "OD", 9, 10, 1, {
    deviceId: "DTP-01",
    slotId: "S2",
    slotResult: "arranged",
    slotMessage: "已安排 " + slotKey("DTP-01", t, "S2"),
    at: timeAt(8, 40),
    by: "nurse",
  }),
  assessment("P-001", "OS", 8, 9, 1, {
    deviceId: "DTP-01",
    slotId: "S2",
    slotResult: "arranged",
    slotMessage: "沿用同一时段",
    at: timeAt(8, 42),
    by: "nurse",
  }),
  // P-002：右眼 BUT 3/4 秒 → 待复核，时段已释放
  assessment("P-002", "OD", 3, 4, 2, {
    deviceId: "DTP-02",
    slotId: "S3",
    slotResult: "skipped",
    slotMessage: `破裂时间低于 ${RULES.BUT_MIN_SECONDS} 秒，未占用时段`,
    at: timeAt(8, 50),
    by: "nurse",
  }),
  assessment("P-002", "OS", 7, 8, 1, {
    deviceId: "DTP-02",
    slotId: "S3",
    slotResult: "skipped",
    slotMessage: "同疗程存在异常眼，整体待复核",
    at: timeAt(8, 55),
    by: "nurse",
  }),
  // P-003：初评正常排机，灼伤/脱落后冻结并释放（冻结原因记在计划上）
  assessment("P-003", "OD", 8, 9, 1, {
    deviceId: "DTP-01",
    slotId: "S4",
    slotResult: "arranged",
    slotMessage: "初评已安排，冻结时已释放",
    at: timeAt(8, 30),
    by: "nurse",
  }),
  // P-004：初评染色 3 级 → 待复核；护理后复查改善，已提交医生
  assessment("P-004", "OS", 6, 7, 3, {
    deviceId: "DTP-02",
    slotId: "S5",
    slotResult: "skipped",
    slotMessage: `染色达 ${RULES.STAIN_REVIEW_GRADE} 级，未占用时段`,
    at: timeAt(8, 58),
    by: "nurse",
  }),
  assessment("P-004", "OS", 8, 9, 1, {
    asRecheck: true,
    deviceId: "DTP-02",
    slotId: "S5",
    slotResult: "blocked_status",
    slotMessage: "护理后复查须医生确认，暂不排机",
    at: timeAt(9, 30),
    by: "nurse",
  }),
];

const audits: AuditEvent[] = [
  {
    id: "AUD-SEED-1",
    at: timeAt(8, 40),
    role: "nurse",
    action: "评估存档",
    message: "王秀兰 右眼评估存档：BUT 9s/10s，染色 1 级。",
    planId: "PL-001",
  },
  {
    id: "AUD-SEED-2",
    at: timeAt(8, 42),
    role: "system",
    action: "时段安排",
    message: "王秀兰 占用 热脉动仪01 09:30–10:00。",
    planId: "PL-001",
  },
  {
    id: "AUD-SEED-3",
    at: timeAt(8, 55),
    role: "system",
    action: "待复核",
    message: "李建国 右眼破裂时间 3s/4s ＜ 5s，进入待复核，时段已释放。",
    planId: "PL-002",
  },
  {
    id: "AUD-SEED-4",
    at: timeAt(9, 20),
    role: "doctor",
    action: "冻结计划",
    message: "赵晓梅 角膜上皮脱落：右眼上方点片状上皮脱落，计划冻结并停止后续预约。",
    planId: "PL-003",
  },
  {
    id: "AUD-SEED-5",
    at: timeAt(9, 30),
    role: "nurse",
    action: "复查提交",
    message: "陈志远 护理后复查已提交（左眼 BUT 8s/9s，染色 1 级），等待医生确认。",
    planId: "PL-004",
  },
];

export const seedState: AppState = { plans, assessments, audits };
export type { AppState };
