import type { EyeSide, FreezeType, PlanStatus } from "../types";

/** 判定阈值（业务规则单一来源） */
export const RULES = {
  BUT_MIN_SECONDS: 5, // 泪膜破裂时间低于该值需待复核
  STAIN_REVIEW_GRADE: 3, // 染色达到该等级需待复核
} as const;

export const DEVICES = [
  { id: "DTP-01", name: "热脉动仪 01" },
  { id: "DTP-02", name: "热脉动仪 02" },
] as const;

/** 每台仪器每天的可约时段 */
export const SLOTS = [
  { id: "S1", label: "09:00 – 09:30" },
  { id: "S2", label: "09:30 – 10:00" },
  { id: "S3", label: "10:00 – 10:30" },
  { id: "S4", label: "10:30 – 11:00" },
  { id: "S5", label: "11:00 – 11:30" },
  { id: "S6", label: "14:00 – 14:30" },
  { id: "S7", label: "14:30 – 15:00" },
  { id: "S8", label: "15:00 – 15:30" },
  { id: "S9", label: "15:30 – 16:00" },
  { id: "S10", label: "16:00 – 16:30" },
] as const;

export const STAIN_GRADES = [0, 1, 2, 3, 4] as const;

export const EYE_META: Record<EyeSide, { label: string; short: string }> = {
  OD: { label: "右眼 OD", short: "右" },
  OS: { label: "左眼 OS", short: "左" },
};

export const FREEZE_META: Record<FreezeType, { label: string }> = {
  epithelial_defect: { label: "角膜上皮脱落" },
  burn: { label: "眼部灼伤" },
};

export const STATUS_META: Record<
  PlanStatus,
  { label: string; badge: string; desc: string }
> = {
  new: {
    label: "待评估",
    badge: "badge-muted",
    desc: "尚未存档评估数据，不能排机。",
  },
  ready: {
    label: "可排程",
    badge: "badge-ok",
    desc: "评估正常，可安排仪器时段。",
  },
  pending_review: {
    label: "待复核",
    badge: "badge-warn",
    desc: "BUT 不足 5 秒或染色达 3 级，已释放时段；护理后复查提交医生确认。",
  },
  awaiting_doctor: {
    label: "待医生确认",
    badge: "badge-info",
    desc: "护理后复查已提交，医生确认继续后方可重新排机。",
  },
  frozen: {
    label: "已冻结",
    badge: "badge-danger",
    desc: "出现角膜上皮脱落或灼伤，计划冻结，停止一切后续预约。",
  },
};

export function deviceName(id: string): string {
  return DEVICES.find((d) => d.id === id)?.name ?? id;
}

export function slotLabel(id: string): string {
  return SLOTS.find((s) => s.id === id)?.label ?? id;
}

export function slotKey(deviceId: string, date: string, slotId: string): string {
  return `${date}|${deviceId}|${slotId}`;
}

export function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
