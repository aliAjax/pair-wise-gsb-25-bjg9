import { useMemo, useState } from "react";
import {
  DEVICES,
  EYE_META,
  RULES,
  SLOTS,
  STAIN_GRADES,
  STATUS_META,
  deviceName,
  slotLabel,
  todayStr,
} from "../domain/catalog";
import { evaluateEye, slotDecision, summarize } from "../domain/rules";
import { occupancyForDate, useStore } from "../data/store";
import type { ActorRole, EyeSide, StainGrade, TreatmentPlan } from "../types";

interface Props {
  plan: TreatmentPlan;
  role: ActorRole;
}

const EYES: EyeSide[] = ["OD", "OS"];

export default function AssessmentForm({ plan, role }: Props) {
  const { state, dispatch } = useStore();
  const [eye, setEye] = useState<EyeSide>("OD");
  const [date, setDate] = useState(todayStr());
  const [deviceId, setDeviceId] = useState<string>(DEVICES[0].id);
  const [slotId, setSlotId] = useState<string>(SLOTS[0].id);
  const [butFirst, setButFirst] = useState("");
  const [butSecond, setButSecond] = useState("");
  const [stainGrade, setStainGrade] = useState<StainGrade>(0);
  const [asRecheck, setAsRecheck] = useState(false);

  const locked = plan.status === "frozen" || role === "doctor";

  // 当前眼最近一次评估（用于预填与对照）
  const latest = useMemo(
    () =>
      state.assessments
        .filter((a) => a.patientId === plan.patientId && a.eye === eye)
        .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))[0],
    [state.assessments, plan.patientId, eye],
  );

  const otherLatest = useMemo(
    () =>
      state.assessments
        .filter(
          (a) =>
            a.patientId === plan.patientId &&
            a.eye === (eye === "OD" ? "OS" : "OD"),
        )
        .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))[0],
    [state.assessments, plan.patientId, eye],
  );

  const n1 = Number(butFirst);
  const n2 = Number(butSecond);
  const valid =
    butFirst !== "" &&
    butSecond !== "" &&
    Number.isFinite(n1) &&
    Number.isFinite(n2) &&
    n1 >= 0 &&
    n2 >= 0;

  const eyeVerdict = valid
    ? evaluateEye(eye, { butFirst: n1, butSecond: n2, stainGrade })
    : null;

  const overall = useMemo(() => {
    if (!eyeVerdict) return null;
    const other = otherLatest
      ? {
          eye: otherLatest.eye,
          needsReview: otherLatest.needsReview,
          reasons: otherLatest.reasons,
        }
      : null;
    return summarize(other ? [eyeVerdict, other] : [eyeVerdict]);
  }, [eyeVerdict, otherLatest]);

  const occupancy = occupancyForDate(state, date);
  const occupiedPlan = occupancy.get(`${date}|${deviceId}|${slotId}`);
  const conflict = occupiedPlan && occupiedPlan.id !== plan.id;

  const prospectiveIssue = overall
    ? asRecheck
      ? "recheck"
      : overall.needsReview
        ? "review"
        : slotDecision("ready", Boolean(conflict))
    : null;

  const canSave = valid && !locked && (!asRecheck || plan.status === "pending_review");

  function handleSave() {
    if (!canSave || !eyeVerdict || !overall) return;
    dispatch({
      type: "save_assessment",
      role: "nurse",
      planId: plan.id,
      eye,
      butFirst: n1,
      butSecond: n2,
      stainGrade,
      date,
      deviceId,
      slotId,
      asRecheck,
    });
    setButFirst("");
    setButSecond("");
    setStainGrade(0);
    setAsRecheck(false);
  }

  return (
    <section className="panel form-panel">
      <div className="section-heading">
        <div>
          <p>评估录入 · {plan.patientName}</p>
          <h2>破裂时间 / 角膜染色 / 仪器时段</h2>
        </div>
        <span className={`badge ${STATUS_META[plan.status].badge}`}>
          {STATUS_META[plan.status].label}
        </span>
      </div>

      {plan.status === "frozen" && (
        <div className="banner banner-danger">
          计划已冻结（{plan.freeze && `原因：${plan.freeze.detail}`}），数据只读，不可再录入或预约。
        </div>
      )}
      {role === "doctor" && plan.status !== "frozen" && (
        <div className="banner banner-info">
          当前为医生视角：评估与排机由护理师操作，医生负责复查确认与安全冻结。
        </div>
      )}

      <div className="eye-tabs" role="tablist">
        {EYES.map((e) => (
          <button
            key={e}
            role="tab"
            aria-selected={eye === e}
            className={eye === e ? "active" : ""}
            onClick={() => setEye(e)}
          >
            {EYE_META[e].label}
          </button>
        ))}
      </div>

      {latest && (
        <div className="prior-note">
          该眼最近{latest.asRecheck ? "复查" : "评估"}：BUT {latest.butFirst}s/
          {latest.butSecond}s，染色 {latest.stainGrade} 级
          {latest.needsReview ? "（曾触发待复核）" : "（正常）"}
        </div>
      )}

      <fieldset className="field-grid" disabled={locked}>
        <label>
          <span>第 1 次泪膜破裂时间（秒）</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={butFirst}
            placeholder={`低于 ${RULES.BUT_MIN_SECONDS}s 需待复核`}
            onChange={(e) => setButFirst(e.target.value)}
          />
        </label>
        <label>
          <span>第 2 次泪膜破裂时间（秒）</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={butSecond}
            placeholder={`低于 ${RULES.BUT_MIN_SECONDS}s 需待复核`}
            onChange={(e) => setButSecond(e.target.value)}
          />
        </label>

        <label className="stain-field">
          <span>
            角膜染色分级（达到 {RULES.STAIN_REVIEW_GRADE} 级需待复核）
          </span>
          <div className="grade-picker">
            {STAIN_GRADES.map((g) => (
              <button
                key={g}
                type="button"
                className={stainGrade === g ? "grade active" : "grade"}
                onClick={() => setStainGrade(g as StainGrade)}
              >
                {g}
              </button>
            ))}
          </div>
        </label>

        <label>
          <span>仪器日期</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          <span>仪器</span>
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
          >
            {DEVICES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>拟安排时段</span>
          <select value={slotId} onChange={(e) => setSlotId(e.target.value)}>
            {SLOTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={asRecheck}
            disabled={plan.status !== "pending_review"}
            onChange={(e) => setAsRecheck(e.target.checked)}
          />
          <span>
            护理后复查（仅「待复核」计划可提交，提交后转医生确认）
          </span>
        </label>
      </fieldset>

      {/* 实时判定预览：判定层结论原样呈现 */}
      {!valid && (
        <div className="verdict verdict-muted">请填写两次破裂时间后给出判定。</div>
      )}
      {valid && prospectiveIssue === "review" && overall && (
        <div className="verdict verdict-warn">
          <strong>判定：待复核</strong>
          <ul>
            {overall.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          保存后将进入待复核并自动释放该仪器时段，护理后复查须医生确认继续。
        </div>
      )}
      {valid && prospectiveIssue === "recheck" && (
        <div className="verdict verdict-info">
          <strong>护理后复查：提交医生确认</strong>
          复查数据先存档，不直接排机；医生确认继续后才可重新预约时段。
        </div>
      )}
      {valid && prospectiveIssue === "conflict" && (
        <div className="verdict verdict-warn">
          <strong>时段冲突</strong>
          {deviceName(deviceId)} {slotLabel(slotId)} 已安排给「
          {occupiedPlan?.patientName}」，同一仪器同一时段只能一人；数据仍可存档，但不会占用时段。
        </div>
      )}
      {valid && prospectiveIssue === "ok" && (
        <div className="verdict verdict-ok">
          <strong>判定正常，可排程</strong>
          保存后占用 {deviceName(deviceId)} {slotLabel(slotId)}（{date}）。
        </div>
      )}

      <div className="form-actions">
        <button
          className="primary-action"
          disabled={!canSave}
          onClick={handleSave}
        >
          {asRecheck ? "存档复查并提交医生" : "存档评估并安排时段"}
        </button>
      </div>
    </section>
  );
}
