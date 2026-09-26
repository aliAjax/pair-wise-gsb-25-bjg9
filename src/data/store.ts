// 数据层：localStorage 持久化 + 全部状态流转动作。
// 每个动作都是纯函数：接收当前 ConsoleData，返回新数据与提示语；
// 判定委托给 domain/rules，留档委托给 archive/audit。

import {
  ADVERSE_LABEL,
  EYE_LABEL,
  type AdverseEvent,
  type AuditEntry,
  type ConsoleData,
  type Device,
  type EyeExam,
  type EyeSide,
  type Patient,
  type TimeSlot,
  type TreatmentPlan,
  type TreatmentSession,
} from "../domain/types";
import {
  SESSIONS_PER_PLAN,
  applyFreeze,
  canBookSession,
  canSaveExam,
  evaluateExam,
  examInputValid,
  findSlotConflict,
  type ExamInput,
} from "../domain/rules";
import { Audit, type AuditSpec } from "../archive/audit";

const STORAGE_KEY = "dryeye-thermal-console:v1";

export interface ActionResult {
  data: ConsoleData;
  notice: string;
}

function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function blankSession(id: string, seq: number): TreatmentSession {
  return {
    id,
    seq,
    deviceId: null,
    slotId: null,
    exam: null,
    status: "unscheduled",
    releasedSlot: null,
    cancelReason: null,
    reviewedBy: null,
    reviewNote: null,
    completedAt: null,
  };
}

function appendAudit(data: ConsoleData, specs: AuditSpec[]): ConsoleData {
  if (specs.length === 0) {
    return data;
  }
  const at = nowIso();
  const entries: AuditEntry[] = specs.map((item) => ({ ...item, id: newId("log"), at }));
  return { ...data, audit: [...data.audit, ...entries] };
}

function replacePlan(data: ConsoleData, updated: TreatmentPlan): ConsoleData {
  return { ...data, plans: data.plans.map((plan) => (plan.id === updated.id ? updated : plan)) };
}

// ---------- 持久化 ----------

export function loadData(): ConsoleData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return seedData();
    }
    const parsed = JSON.parse(raw) as ConsoleData;
    if (!parsed || !Array.isArray(parsed.plans) || !Array.isArray(parsed.audit)) {
      return seedData();
    }
    return parsed;
  } catch {
    return seedData();
  }
}

export function saveData(data: ConsoleData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 存储不可用时静默降级为内存态
  }
}

export function resetData(): ConsoleData {
  const fresh = seedData();
  saveData(fresh);
  return fresh;
}

// ---------- 动作 ----------

export function createPlan(data: ConsoleData, patientId: string, eye: EyeSide, actor: string): ActionResult {
  const patient = data.patients.find((item) => item.id === patientId);
  if (!patient) {
    return { data, notice: "未找到患者" };
  }
  const duplicated = data.plans.some(
    (plan) => plan.patientId === patientId && plan.eye === eye && plan.status === "active"
  );
  if (duplicated) {
    return { data, notice: `${patient.name} 的${EYE_LABEL[eye]}已有进行中的疗程` };
  }

  const plan: TreatmentPlan = {
    id: newId("plan"),
    patientId,
    eye,
    status: "active",
    createdAt: nowIso(),
    frozenAt: null,
    freezeReason: null,
    adverseEvent: null,
    sessions: Array.from({ length: SESSIONS_PER_PLAN }, (_, index) =>
      blankSession(newId("ses"), index + 1)
    ),
  };

  const next = appendAudit({ ...data, plans: [...data.plans, plan] }, [
    Audit.planCreated(actor, patient.name, eye, plan.id),
  ]);
  return { data: next, notice: `已建立${EYE_LABEL[eye]}疗程，请为第 1 次排机` };
}

export function bookSlot(
  data: ConsoleData,
  planId: string,
  sessionId: string,
  deviceId: string,
  slotId: string,
  actor: string
): ActionResult {
  const plan = data.plans.find((item) => item.id === planId);
  const session = plan?.sessions.find((item) => item.id === sessionId);
  if (!plan || !session) {
    return { data, notice: "未找到疗程或预约" };
  }
  if (plan.status !== "active") {
    return { data, notice: "计划已冻结或结束，无法排机" };
  }
  if (!canBookSession(session)) {
    return { data, notice: "当前状态不可排机" };
  }
  const device = data.devices.find((item) => item.id === deviceId);
  const slot = data.slots.find((item) => item.id === slotId);
  if (!device || !slot) {
    return { data, notice: "请选择仪器和时段" };
  }

  const conflict = findSlotConflict(data, deviceId, slotId, sessionId);
  if (conflict) {
    const who = data.patients.find((item) => item.id === conflict.plan.patientId)?.name ?? "其他患者";
    return { data, notice: `${device.name} ${slot.label} 已被 ${who} 占用，同一时段仅可安排一人` };
  }

  const updatedSession: TreatmentSession = {
    ...session,
    deviceId,
    slotId,
    status: "scheduled",
    releasedSlot: null,
  };
  const updatedPlan: TreatmentPlan = {
    ...plan,
    sessions: plan.sessions.map((item) => (item.id === sessionId ? updatedSession : item)),
  };
  const next = appendAudit(replacePlan(data, updatedPlan), [
    Audit.slotBooked(actor, session.seq, device.name, slot.label, planId, sessionId),
  ]);
  return { data: next, notice: `第 ${session.seq} 次已排机：${device.name} · ${slot.label}` };
}

export function saveExam(
  data: ConsoleData,
  planId: string,
  sessionId: string,
  input: ExamInput,
  actor: string
): ActionResult {
  const plan = data.plans.find((item) => item.id === planId);
  const session = plan?.sessions.find((item) => item.id === sessionId);
  if (!plan || !session) {
    return { data, notice: "未找到疗程或预约" };
  }
  if (plan.status !== "active") {
    return { data, notice: "计划已冻结或结束，无法录入检查" };
  }
  if (!canSaveExam(session)) {
    return { data, notice: "当前状态不可录入检查" };
  }
  if (!examInputValid(input)) {
    return { data, notice: "请完整填写两次破裂时间（0–60s）与染色评分（0–5 级）" };
  }

  const exam: EyeExam = { ...input, recordedBy: actor, recordedAt: nowIso() };
  const verdict = evaluateExam(exam);
  const specs: AuditSpec[] = [
    Audit.examSaved(actor, session.seq, exam, planId, sessionId),
    Audit.examVerdict(session.seq, verdict, planId, sessionId),
  ];

  let updatedSession: TreatmentSession;
  let notice: string;

  if (verdict.kind === "review") {
    // 指标异常：转待复核并释放已占时段
    const heldDevice = session.deviceId
      ? data.devices.find((item) => item.id === session.deviceId)
      : undefined;
    const heldSlot = session.slotId
      ? data.slots.find((item) => item.id === session.slotId)
      : undefined;
    if (heldDevice && heldSlot) {
      specs.push(Audit.slotReleased(session.seq, heldDevice.name, heldSlot.label, planId, sessionId));
    }
    updatedSession = {
      ...session,
      exam,
      status: "pending_review",
      deviceId: null,
      slotId: null,
      releasedSlot:
        heldDevice && heldSlot
          ? { deviceId: heldDevice.id, slotId: heldSlot.id, releasedAt: nowIso() }
          : session.releasedSlot,
    };
    notice = `第 ${session.seq} 次指标异常，已转待复核并释放时段`;
  } else {
    updatedSession = { ...session, exam, status: "ready" };
    notice = `第 ${session.seq} 次检查通过，可按预约上机`;
  }

  const updatedPlan: TreatmentPlan = {
    ...plan,
    sessions: plan.sessions.map((item) => (item.id === sessionId ? updatedSession : item)),
  };
  const next = appendAudit(replacePlan(data, updatedPlan), specs);
  return { data: next, notice };
}

export function confirmReview(
  data: ConsoleData,
  planId: string,
  sessionId: string,
  deviceId: string,
  slotId: string,
  doctor: string,
  note: string
): ActionResult {
  const plan = data.plans.find((item) => item.id === planId);
  const session = plan?.sessions.find((item) => item.id === sessionId);
  if (!plan || !session) {
    return { data, notice: "未找到疗程或预约" };
  }
  if (plan.status !== "active") {
    return { data, notice: "计划已冻结或结束，无法复核" };
  }
  if (session.status !== "pending_review") {
    return { data, notice: "仅待复核的预约可由医生确认继续" };
  }
  const device = data.devices.find((item) => item.id === deviceId);
  const slot = data.slots.find((item) => item.id === slotId);
  if (!device || !slot) {
    return { data, notice: "请为复查后的疗程重新选择仪器和时段" };
  }

  const conflict = findSlotConflict(data, deviceId, slotId, sessionId);
  if (conflict) {
    const who = data.patients.find((item) => item.id === conflict.plan.patientId)?.name ?? "其他患者";
    return { data, notice: `${device.name} ${slot.label} 已被 ${who} 占用，同一时段仅可安排一人` };
  }

  const updatedSession: TreatmentSession = {
    ...session,
    status: "scheduled",
    deviceId,
    slotId,
    reviewedBy: doctor,
    reviewNote: note || null,
  };
  const updatedPlan: TreatmentPlan = {
    ...plan,
    sessions: plan.sessions.map((item) => (item.id === sessionId ? updatedSession : item)),
  };
  const next = appendAudit(replacePlan(data, updatedPlan), [
    Audit.reviewConfirmed(doctor, session.seq, device.name, slot.label, note, planId, sessionId),
  ]);
  return { data: next, notice: `第 ${session.seq} 次复核通过，已重新排机` };
}

export function completeSession(
  data: ConsoleData,
  planId: string,
  sessionId: string,
  actor: string
): ActionResult {
  const plan = data.plans.find((item) => item.id === planId);
  const session = plan?.sessions.find((item) => item.id === sessionId);
  if (!plan || !session) {
    return { data, notice: "未找到疗程或预约" };
  }
  if (plan.status !== "active") {
    return { data, notice: "计划已冻结或结束，无法完成治疗" };
  }
  if (session.status !== "ready") {
    return { data, notice: "仅「待上机」状态可完成治疗，请先录入并通过检查" };
  }

  const updatedSession: TreatmentSession = {
    ...session,
    status: "completed",
    completedAt: nowIso(),
  };
  const sessions = plan.sessions.map((item) => (item.id === sessionId ? updatedSession : item));
  const allDone = sessions.every((item) => item.status === "completed");
  const updatedPlan: TreatmentPlan = {
    ...plan,
    sessions,
    status: allDone ? "completed" : plan.status,
  };
  const next = appendAudit(replacePlan(data, updatedPlan), [
    Audit.sessionCompleted(actor, session.seq, planId, sessionId),
  ]);
  return {
    data: next,
    notice: allDone ? "本疗程全部完成" : `第 ${session.seq} 次治疗完成`,
  };
}

export function reportAdverseEvent(
  data: ConsoleData,
  planId: string,
  event: AdverseEvent,
  reason: string,
  actor: string
): ActionResult {
  const plan = data.plans.find((item) => item.id === planId);
  if (!plan) {
    return { data, notice: "未找到疗程计划" };
  }
  if (plan.status !== "active") {
    return { data, notice: "仅进行中的计划可冻结" };
  }
  if (!reason.trim()) {
    return { data, notice: "请填写冻结原因" };
  }

  const { plan: frozen, cancelled } = applyFreeze(plan, event, reason.trim(), nowIso());
  const specs: AuditSpec[] = [
    Audit.planFrozen(actor, event, reason.trim(), planId),
    ...cancelled.map((item) =>
      Audit.sessionCancelled(item.seq, item.cancelReason ?? "计划冻结", planId, item.id)
    ),
  ];
  const next = appendAudit(replacePlan(data, frozen), specs);
  return {
    data: next,
    notice: `计划已冻结：${ADVERSE_LABEL[event]}，后续 ${cancelled.length} 次预约已停止`,
  };
}

// ---------- 演示数据 ----------

export function seedData(): ConsoleData {
  const patients: Patient[] = [
    { id: "P-1001", name: "陈静", age: 34 },
    { id: "P-1002", name: "林国栋", age: 52 },
    { id: "P-1003", name: "黄雅雯", age: 41 },
    { id: "P-1004", name: "吴海涛", age: 47 },
  ];
  const devices: Device[] = [
    { id: "dev-1", name: "热脉动仪 1 号" },
    { id: "dev-2", name: "热脉动仪 2 号" },
  ];
  const slots: TimeSlot[] = [
    { id: "slot-0900", label: "09:00–09:40" },
    { id: "slot-1000", label: "10:00–10:40" },
    { id: "slot-1100", label: "11:00–11:40" },
    { id: "slot-1400", label: "14:00–14:40" },
    { id: "slot-1500", label: "15:00–15:40" },
    { id: "slot-1600", label: "16:00–16:40" },
  ];

  const examA1: EyeExam = { tbutFirst: 6.8, tbutSecond: 7.2, staining: 1, recordedBy: "护士小李", recordedAt: "2026-09-24T09:05:00" };
  const examC1: EyeExam = { tbutFirst: 5.4, tbutSecond: 5.9, staining: 1, recordedBy: "护士小李", recordedAt: "2026-09-25T14:02:00" };
  const examB1: EyeExam = { tbutFirst: 3.2, tbutSecond: 3.8, staining: 3, recordedBy: "护士小李", recordedAt: "2026-09-26T08:55:00" };
  const examD1: EyeExam = { tbutFirst: 5.6, tbutSecond: 6.1, staining: 2, recordedBy: "护士小李", recordedAt: "2026-09-26T09:10:00" };

  const plans: TreatmentPlan[] = [
    {
      id: "plan-a",
      patientId: "P-1001",
      eye: "OD",
      status: "active",
      createdAt: "2026-09-24T08:58:00",
      frozenAt: null,
      freezeReason: null,
      adverseEvent: null,
      sessions: [
        { ...blankSession("s-a1", 1), status: "completed", deviceId: "dev-1", slotId: "slot-0900", exam: examA1, completedAt: "2026-09-24T10:05:00" },
        { ...blankSession("s-a2", 2), status: "scheduled", deviceId: "dev-1", slotId: "slot-1000" },
        blankSession("s-a3", 3),
      ],
    },
    {
      id: "plan-b",
      patientId: "P-1002",
      eye: "OS",
      status: "active",
      createdAt: "2026-09-26T08:30:00",
      frozenAt: null,
      freezeReason: null,
      adverseEvent: null,
      sessions: [
        { ...blankSession("s-b1", 1), status: "pending_review", exam: examB1, releasedSlot: { deviceId: "dev-2", slotId: "slot-0900", releasedAt: "2026-09-26T08:55:00" } },
        blankSession("s-b2", 2),
        blankSession("s-b3", 3),
      ],
    },
    {
      id: "plan-c",
      patientId: "P-1003",
      eye: "OD",
      status: "frozen",
      createdAt: "2026-09-25T08:50:00",
      frozenAt: "2026-09-25T15:20:00",
      freezeReason: "治疗后角膜缘灼伤，角膜上皮缺损",
      adverseEvent: "burn",
      sessions: [
        { ...blankSession("s-c1", 1), status: "completed", deviceId: "dev-1", slotId: "slot-1400", exam: examC1, completedAt: "2026-09-25T15:00:00" },
        { ...blankSession("s-c2", 2), status: "cancelled", deviceId: "dev-1", slotId: "slot-1500", cancelReason: "计划冻结：灼伤" },
        { ...blankSession("s-c3", 3), status: "cancelled", cancelReason: "计划冻结：灼伤" },
      ],
    },
    {
      id: "plan-d",
      patientId: "P-1004",
      eye: "OS",
      status: "active",
      createdAt: "2026-09-26T08:40:00",
      frozenAt: null,
      freezeReason: null,
      adverseEvent: null,
      sessions: [
        { ...blankSession("s-d1", 1), status: "ready", deviceId: "dev-2", slotId: "slot-1400", exam: examD1 },
        blankSession("s-d2", 2),
        blankSession("s-d3", 3),
      ],
    },
  ];

  const audit: AuditEntry[] = [
    { id: "log-01", at: "2026-09-24T08:58:00", ...Audit.planCreated("前台小周", "陈静", "OD", "plan-a") },
    { id: "log-02", at: "2026-09-24T09:00:00", ...Audit.slotBooked("前台小周", 1, "热脉动仪 1 号", "09:00–09:40", "plan-a", "s-a1") },
    { id: "log-03", at: "2026-09-24T09:05:00", ...Audit.examSaved("护士小李", 1, examA1, "plan-a", "s-a1") },
    { id: "log-04", at: "2026-09-24T09:05:00", ...Audit.examVerdict(1, evaluateExam(examA1), "plan-a", "s-a1") },
    { id: "log-05", at: "2026-09-24T10:05:00", ...Audit.sessionCompleted("治疗师王芳", 1, "plan-a", "s-a1") },
    { id: "log-06", at: "2026-09-25T08:50:00", ...Audit.planCreated("前台小周", "黄雅雯", "OD", "plan-c") },
    { id: "log-07", at: "2026-09-25T08:52:00", ...Audit.slotBooked("前台小周", 1, "热脉动仪 1 号", "14:00–14:40", "plan-c", "s-c1") },
    { id: "log-08", at: "2026-09-25T14:02:00", ...Audit.examSaved("护士小李", 1, examC1, "plan-c", "s-c1") },
    { id: "log-09", at: "2026-09-25T14:02:00", ...Audit.examVerdict(1, evaluateExam(examC1), "plan-c", "s-c1") },
    { id: "log-10", at: "2026-09-25T15:00:00", ...Audit.sessionCompleted("治疗师王芳", 1, "plan-c", "s-c1") },
    { id: "log-11", at: "2026-09-25T15:20:00", ...Audit.planFrozen("王医生", "burn", "治疗后角膜缘灼伤，角膜上皮缺损", "plan-c") },
    { id: "log-12", at: "2026-09-25T15:20:00", ...Audit.sessionCancelled(2, "计划冻结：灼伤", "plan-c", "s-c2") },
    { id: "log-13", at: "2026-09-25T15:20:00", ...Audit.sessionCancelled(3, "计划冻结：灼伤", "plan-c", "s-c3") },
    { id: "log-14", at: "2026-09-26T08:10:00", ...Audit.slotBooked("前台小周", 2, "热脉动仪 1 号", "10:00–10:40", "plan-a", "s-a2") },
    { id: "log-15", at: "2026-09-26T08:30:00", ...Audit.planCreated("前台小周", "林国栋", "OS", "plan-b") },
    { id: "log-16", at: "2026-09-26T08:32:00", ...Audit.slotBooked("前台小周", 1, "热脉动仪 2 号", "09:00–09:40", "plan-b", "s-b1") },
    { id: "log-17", at: "2026-09-26T08:40:00", ...Audit.planCreated("前台小周", "吴海涛", "OS", "plan-d") },
    { id: "log-18", at: "2026-09-26T08:42:00", ...Audit.slotBooked("前台小周", 1, "热脉动仪 2 号", "14:00–14:40", "plan-d", "s-d1") },
    { id: "log-19", at: "2026-09-26T08:55:00", ...Audit.examSaved("护士小李", 1, examB1, "plan-b", "s-b1") },
    { id: "log-20", at: "2026-09-26T08:55:00", ...Audit.examVerdict(1, evaluateExam(examB1), "plan-b", "s-b1") },
    { id: "log-21", at: "2026-09-26T08:55:00", ...Audit.slotReleased(1, "热脉动仪 2 号", "09:00–09:40", "plan-b", "s-b1") },
    { id: "log-22", at: "2026-09-26T09:10:00", ...Audit.examSaved("护士小李", 1, examD1, "plan-d", "s-d1") },
    { id: "log-23", at: "2026-09-26T09:10:00", ...Audit.examVerdict(1, evaluateExam(examD1), "plan-d", "s-d1") },
  ];

  return { patients, devices, slots, plans, audit };
}
