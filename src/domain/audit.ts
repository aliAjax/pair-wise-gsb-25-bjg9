import type { ActorRole, AuditEvent } from "../types";

let seq = 0;

/** 留档层：事件只可追加。统一的构造与排序工具 */
export function createEvent(
  role: ActorRole,
  action: string,
  message: string,
  planId?: string,
  at: Date = new Date(),
): AuditEvent {
  seq += 1;
  return {
    id: `AUD-${Date.now()}-${seq}`,
    at: at.toISOString(),
    role,
    action,
    message,
    planId,
  };
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}`;
}

export const ROLE_META: Record<ActorRole, string> = {
  nurse: "护理师",
  doctor: "医生",
  system: "系统",
};
