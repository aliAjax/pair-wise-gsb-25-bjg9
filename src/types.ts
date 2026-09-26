// 领域模型：数据层与判定层共用的类型定义

export type EyeSide = "OD" | "OS"; // OD=右眼 OS=左眼
export type StainGrade = 0 | 1 | 2 | 3 | 4;

/** 操作角色：护理师 / 医生 / 系统（自动判定记为 system） */
export type ActorRole = "nurse" | "doctor" | "system";

/**
 * 疗程计划状态
 * new             待评估：未存档任何测量，不能排机
 * ready           可排程：评估正常，允许占用仪器时段
 * pending_review  待复核：BUT 不足 5s 或染色 ≥3 级，已自动释放时段
 * awaiting_doctor 护理后复查已提交，等待医生确认是否继续
 * frozen          冻结：出现角膜上皮脱落或灼伤，停止一切后续预约
 */
export type PlanStatus =
  | "new"
  | "ready"
  | "pending_review"
  | "awaiting_doctor"
  | "frozen";

export type SlotResultCode =
  | "arranged" // 已安排
  | "blocked_conflict" // 同一仪器同一时段已有人
  | "blocked_status" // 状态不允许排机
  | "skipped"; // 本次未申请时段

/** 按「患者 + 眼别」存档的一次评估：两次破裂时间、染色分级、拟安排仪器时段 */
export interface EyeAssessment {
  id: string;
  patientId: string;
  eye: EyeSide;
  butFirst: number; // 第 1 次泪膜破裂时间（秒）
  butSecond: number; // 第 2 次泪膜破裂时间（秒）
  stainGrade: StainGrade; // 角膜荧光素染色分级
  date: string; // 申请/安排的仪器日期 YYYY-MM-DD
  deviceId: string; // 仪器编号
  slotId: string; // 时段编号
  asRecheck: boolean; // 是否为护理后复查
  needsReview: boolean; // 判定快照：是否触发待复核
  reasons: string[]; // 判定理由快照
  slotResult: SlotResultCode; // 时段处理结果快照
  slotMessage: string;
  savedAt: string; // ISO 时间
  savedBy: ActorRole;
}

export interface Booking {
  deviceId: string;
  date: string;
  slotId: string;
  bookedAt: string;
}

export type FreezeType = "epithelial_defect" | "burn";

export interface FreezeRecord {
  type: FreezeType;
  detail: string;
  at: string;
  by: ActorRole;
}

export interface TreatmentPlan {
  id: string;
  patientId: string;
  patientName: string;
  status: PlanStatus;
  booking: Booking | null;
  freeze: FreezeRecord | null;
  updatedAt: string;
}

/** 留档事件：只追加，不修改 */
export interface AuditEvent {
  id: string;
  at: string;
  role: ActorRole;
  action: string;
  message: string;
  planId?: string;
}
