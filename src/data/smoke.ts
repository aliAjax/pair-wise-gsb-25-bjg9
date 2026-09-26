import assert from "node:assert";
import { reducer, seedState, type Action } from "./reducer";
import { evaluateEye, slotDecision } from "../domain/rules";
import { slotKey, todayStr } from "../domain/catalog";
import type { AppState } from "./seed";

let state: AppState = seedState;
const date = todayStr();
const dispatch = (a: Action) => {
  state = reducer(state, a);
};
const plan = (id: string) => state.plans.find((p) => p.id === id)!;

// 1. 纯规则
assert.equal(evaluateEye("OD", { butFirst: 4.9, butSecond: 6, stainGrade: 0 }).needsReview, true);
assert.equal(evaluateEye("OD", { butFirst: 5, butSecond: 6, stainGrade: 0 }).needsReview, false);
assert.equal(evaluateEye("OS", { butFirst: 9, butSecond: 9, stainGrade: 3 }).needsReview, true);
assert.equal(slotDecision("pending_review", false), "status_blocked");
assert.equal(slotDecision("ready", true), "conflict");
assert.equal(slotDecision("ready", false), "ok");

// 2. 新患者（P-005）双眼正常 → 可排程并占用时段（选一个空闲格）
dispatch({
  type: "save_assessment",
  role: "nurse",
  planId: "PL-005",
  eye: "OD",
  butFirst: 8,
  butSecond: 9,
  stainGrade: 1,
  date,
  deviceId: "DTP-01",
  slotId: "S1",
  asRecheck: false,
});
dispatch({
  type: "save_assessment",
  role: "nurse",
  planId: "PL-005",
  eye: "OS",
  butFirst: 7,
  butSecond: 8,
  stainGrade: 1,
  date,
  deviceId: "DTP-01",
  slotId: "S1",
  asRecheck: false,
});
assert.equal(plan("PL-005").status, "ready");
assert.deepEqual(plan("PL-005").booking, {
  deviceId: "DTP-01",
  date,
  slotId: "S1",
  bookedAt: plan("PL-005").booking!.bookedAt,
});

// 3. 同一仪器同一时段冲突：数据存档但不占用，状态保持 ready
dispatch({
  type: "save_assessment",
  role: "nurse",
  planId: "PL-005",
  eye: "OD",
  butFirst: 8,
  butSecond: 8,
  stainGrade: 0,
  date,
  deviceId: "DTP-01",
  slotId: "S2", // 已被 PL-001 占用
  asRecheck: false,
});
assert.equal(plan("PL-005").booking!.slotId, "S1"); // 原有时段不变
const conflictAssess = state.assessments[0];
assert.equal(conflictAssess.slotResult, "blocked_conflict");

// book_slot 也不能抢占
const beforeBooking = plan("PL-005").booking;
dispatch({
  type: "book_slot",
  role: "nurse",
  planId: "PL-005",
  date,
  deviceId: "DTP-01",
  slotId: "S2",
});
assert.deepEqual(plan("PL-005").booking, beforeBooking);

// 4. BUT 不足 → 待复核，自动释放时段
dispatch({
  type: "save_assessment",
  role: "nurse",
  planId: "PL-005",
  eye: "OS",
  butFirst: 3,
  butSecond: 4,
  stainGrade: 1,
  date,
  deviceId: "DTP-01",
  slotId: "S1",
  asRecheck: false,
});
assert.equal(plan("PL-005").status, "pending_review");
assert.equal(plan("PL-005").booking, null);

// 待复核状态不能排机
dispatch({
  type: "book_slot",
  role: "nurse",
  planId: "PL-005",
  date,
  deviceId: "DTP-02",
  slotId: "S1",
});
assert.equal(plan("PL-005").booking, null);

// 5. 护理后复查 → awaiting_doctor，期间不排机
dispatch({
  type: "save_assessment",
  role: "nurse",
  planId: "PL-005",
  eye: "OS",
  butFirst: 8,
  butSecond: 9,
  stainGrade: 1,
  date,
  deviceId: "DTP-01",
  slotId: "S6",
  asRecheck: true,
});
assert.equal(plan("PL-005").status, "awaiting_doctor");
assert.equal(plan("PL-005").booking, null);

// 非医生不能确认；护士再存常规评估也被拒（状态不是 frozen/new…，但常规异常路径仍可能改变）
dispatch({ type: "doctor_decide", role: "nurse", planId: "PL-005", proceed: true });
assert.equal(plan("PL-005").status, "awaiting_doctor");

// 医生确认继续 → ready
dispatch({ type: "doctor_decide", role: "doctor", planId: "PL-005", proceed: true });
assert.equal(plan("PL-005").status, "ready");

// 6. 冻结：PL-001 已有 S2 占用，冻结后释放并记录原因
assert.ok(plan("PL-001").booking);
dispatch({
  type: "freeze",
  role: "doctor",
  planId: "PL-001",
  freezeType: "burn",
  detail: "热脉动过程中接触区灼伤",
});
assert.equal(plan("PL-001").status, "frozen");
assert.equal(plan("PL-001").booking, null);
assert.equal(plan("PL-001").freeze!.type, "burn");
assert.equal(plan("PL-001").freeze!.detail, "热脉动过程中接触区灼伤");

// 冻结后任何评估/排机/再冻结都无效
dispatch({
  type: "save_assessment",
  role: "nurse",
  planId: "PL-001",
  eye: "OD",
  butFirst: 9,
  butSecond: 9,
  stainGrade: 0,
  date,
  deviceId: "DTP-01",
  slotId: "S1",
  asRecheck: false,
});
assert.equal(plan("PL-001").status, "frozen");
assert.equal(plan("PL-001").booking, null);

// 7. 医生退回路径：PL-004 awaiting_doctor → 退回 pending_review
dispatch({ type: "doctor_decide", role: "doctor", planId: "PL-004", proceed: false });
assert.equal(plan("PL-004").status, "pending_review");

// 8. 全局互斥不变式：占用映射中每个 key 只出现一次
const keys = state.plans
  .filter((p) => p.booking)
  .map((p) => slotKey(p.booking!.deviceId, p.booking!.date, p.booking!.slotId));
assert.equal(new Set(keys).size, keys.length);

// 9. 留档只追加且含关键事件
assert.ok(state.audits.some((a) => a.action === "冻结计划" && a.planId === "PL-001"));
assert.ok(state.audits.some((a) => a.action === "释放时段" && a.planId === "PL-005"));
assert.ok(state.audits.some((a) => a.action === "确认继续" && a.planId === "PL-005"));
assert.ok(state.audits.some((a) => a.action === "排机拦截"));

console.log("全部规则冒烟测试通过 ✓");
