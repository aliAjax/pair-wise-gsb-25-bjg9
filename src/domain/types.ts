// 领域模型：干眼热脉动疗程
// 仅描述数据结构与领域词表，不含任何存储或界面逻辑。

export type EyeSide = "OD" | "OS"; // 右眼 / 左眼

export interface Patient {
  id: string;
  name: string;
  age: number;
}

export interface Device {
  id: string;
  name: string;
}

export interface TimeSlot {
  id: string;
  label: string;
}

/** 单次眼表检查：两次泪膜破裂时间 + 角膜荧光素染色评分 */
export interface EyeExam {
  tbutFirst: number; // 第一次破裂时间（秒）
  tbutSecond: number; // 第二次破裂时间（秒）
  staining: number; // 角膜染色评分（0–5 级）
  recordedBy: string;
  recordedAt: string; // ISO 时间
}

export type SessionStatus =
  | "unscheduled" // 待排机（未占时段）
  | "scheduled" // 已排机（占用时段，待检查）
  | "pending_review" // 待复核（指标异常，时段已释放）
  | "ready" // 检查通过，待上机（占用时段）
  | "completed" // 已完成
  | "cancelled"; // 已取消（计划冻结等）

export interface ReleasedSlot {
  deviceId: string;
  slotId: string;
  releasedAt: string;
}

export interface TreatmentSession {
  id: string;
  seq: number; // 本疗程第几次
  deviceId: string | null;
  slotId: string | null;
  exam: EyeExam | null;
  status: SessionStatus;
  releasedSlot: ReleasedSlot | null;
  cancelReason: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  completedAt: string | null;
}

export type AdverseEvent = "epithelial_detachment" | "burn"; // 角膜上皮脱落 / 灼伤

export type PlanStatus = "active" | "frozen" | "completed";

export interface TreatmentPlan {
  id: string;
  patientId: string;
  eye: EyeSide;
  status: PlanStatus;
  createdAt: string;
  frozenAt: string | null;
  freezeReason: string | null;
  adverseEvent: AdverseEvent | null;
  sessions: TreatmentSession[];
}

export type AuditAction =
  | "plan_created"
  | "slot_booked"
  | "exam_saved"
  | "exam_verdict"
  | "slot_released"
  | "review_confirmed"
  | "session_completed"
  | "plan_frozen"
  | "session_cancelled";

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: AuditAction;
  summary: string;
  planId: string | null;
  sessionId: string | null;
}

export interface ConsoleData {
  patients: Patient[];
  devices: Device[];
  slots: TimeSlot[];
  plans: TreatmentPlan[];
  audit: AuditEntry[];
}

export const EYE_LABEL: Record<EyeSide, string> = {
  OD: "右眼",
  OS: "左眼",
};

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  unscheduled: "待排机",
  scheduled: "已排机",
  pending_review: "待复核",
  ready: "待上机",
  completed: "已完成",
  cancelled: "已取消",
};

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  active: "进行中",
  frozen: "已冻结",
  completed: "已完成",
};

export const ADVERSE_LABEL: Record<AdverseEvent, string> = {
  epithelial_detachment: "角膜上皮脱落",
  burn: "灼伤",
};

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  plan_created: "建疗程",
  slot_booked: "排机",
  exam_saved: "检查录入",
  exam_verdict: "判定",
  slot_released: "释放时段",
  review_confirmed: "复核继续",
  session_completed: "治疗完成",
  plan_frozen: "冻结计划",
  session_cancelled: "取消预约",
};
