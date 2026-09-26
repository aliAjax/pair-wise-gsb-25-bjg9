// 界面层：检查录入、排机、医生复核、冻结等表单。
import { useState } from "react";
import {
  ADVERSE_LABEL,
  type AdverseEvent,
  type ConsoleData,
  type EyeExam,
  type TreatmentSession,
} from "../domain/types";
import {
  evaluateExam,
  examInputValid,
  occupancyBySlot,
  slotKey,
  type ExamInput,
} from "../domain/rules";

// ---------- 仪器 + 时段选择（占用时段自动禁用） ----------

interface SlotSelection {
  deviceId: string;
  slotId: string;
}

interface SlotSelectsProps {
  data: ConsoleData;
  ignoreSessionId?: string;
  deviceId: string;
  slotId: string;
  onChange: (selection: SlotSelection) => void;
}

export function SlotSelects({ data, ignoreSessionId, deviceId, slotId, onChange }: SlotSelectsProps) {
  const occupancy = occupancyBySlot(data);

  return (
    <>
      <select
        value={deviceId}
        aria-label="选择仪器"
        onChange={(event) => onChange({ deviceId: event.target.value, slotId: "" })}
      >
        {data.devices.map((device) => (
          <option key={device.id} value={device.id}>
            {device.name}
          </option>
        ))}
      </select>
      <select
        value={slotId}
        aria-label="选择时段"
        onChange={(event) => onChange({ deviceId, slotId: event.target.value })}
      >
        <option value="">选择时段</option>
        {data.slots.map((slot) => {
          const hit = occupancy.get(slotKey(deviceId, slot.id));
          const blocked = !!hit && hit.session.id !== ignoreSessionId;
          const occupant =
            blocked && hit ? data.patients.find((item) => item.id === hit.plan.patientId) : undefined;
          return (
            <option key={slot.id} value={slot.id} disabled={blocked}>
              {slot.label}
              {blocked && occupant ? ` · 已被${occupant.name}占用` : blocked ? " · 已占用" : ""}
            </option>
          );
        })}
      </select>
    </>
  );
}

// ---------- 排机 ----------

export function BookingControls({
  data,
  sessionId,
  submitLabel,
  onBook,
}: {
  data: ConsoleData;
  sessionId: string;
  submitLabel: string;
  onBook: (deviceId: string, slotId: string) => void;
}) {
  const [selection, setSelection] = useState<SlotSelection>({
    deviceId: data.devices[0]?.id ?? "",
    slotId: "",
  });

  return (
    <div className="booking-controls">
      <SlotSelects
        data={data}
        ignoreSessionId={sessionId}
        deviceId={selection.deviceId}
        slotId={selection.slotId}
        onChange={setSelection}
      />
      <button
        disabled={!selection.deviceId || !selection.slotId}
        onClick={() => onBook(selection.deviceId, selection.slotId)}
      >
        {submitLabel}
      </button>
    </div>
  );
}

// ---------- 检查录入：两次破裂时间 + 染色评分，保存前预览判定 ----------

export function ExamForm({
  initial,
  onSave,
}: {
  initial: EyeExam | null;
  onSave: (input: ExamInput) => void;
}) {
  const [tbutFirst, setTbutFirst] = useState(initial ? String(initial.tbutFirst) : "");
  const [tbutSecond, setTbutSecond] = useState(initial ? String(initial.tbutSecond) : "");
  const [staining, setStaining] = useState(initial ? String(initial.staining) : "");

  const input: ExamInput = {
    tbutFirst: Number(tbutFirst),
    tbutSecond: Number(tbutSecond),
    staining: Number(staining),
  };
  const filled = tbutFirst !== "" && tbutSecond !== "" && staining !== "";
  const valid = filled && examInputValid(input);
  const verdict = valid ? evaluateExam(input) : null;

  return (
    <div className="exam-form">
      <div className="exam-inputs">
        <label>
          <span>破裂时间 ①（秒）</span>
          <input
            type="number"
            min={0}
            max={60}
            step="0.1"
            placeholder="如 6.5"
            value={tbutFirst}
            onChange={(event) => setTbutFirst(event.target.value)}
          />
        </label>
        <label>
          <span>破裂时间 ②（秒）</span>
          <input
            type="number"
            min={0}
            max={60}
            step="0.1"
            placeholder="如 7.0"
            value={tbutSecond}
            onChange={(event) => setTbutSecond(event.target.value)}
          />
        </label>
        <label>
          <span>角膜染色（0–5 级）</span>
          <input
            type="number"
            min={0}
            max={5}
            step="1"
            placeholder="0–5"
            value={staining}
            onChange={(event) => setStaining(event.target.value)}
          />
        </label>
      </div>
      {verdict && (
        <p className={`verdict ${verdict.kind === "pass" ? "pass" : "review"}`}>
          {verdict.kind === "pass"
            ? `判定预览：通过（均值 ${verdict.avgTbut.toFixed(1)}s），保存后可上机`
            : `判定预览：待复核 —— ${verdict.reasons.join("；")}`}
        </p>
      )}
      <button className="primary-action" disabled={!valid} onClick={() => onSave(input)}>
        保存检查并判定
      </button>
    </div>
  );
}

// ---------- 护理后复查：医生确认继续并重新排机 ----------

export function ReviewForm({
  data,
  session,
  onConfirm,
}: {
  data: ConsoleData;
  session: TreatmentSession;
  onConfirm: (deviceId: string, slotId: string, doctor: string, note: string) => void;
}) {
  const [selection, setSelection] = useState<SlotSelection>({
    deviceId: data.devices[0]?.id ?? "",
    slotId: "",
  });
  const [doctor, setDoctor] = useState("王医生");
  const [note, setNote] = useState("");

  const verdict = session.exam ? evaluateExam(session.exam) : null;

  return (
    <div className="review-form">
      {verdict?.kind === "review" && (
        <p className="review-reasons">
          待复核原因：{verdict.reasons.join("；")}。护理后复查，由医生确认是否继续。
        </p>
      )}
      <div className="review-row">
        <input
          value={doctor}
          placeholder="复核医生"
          onChange={(event) => setDoctor(event.target.value)}
        />
        <input
          value={note}
          placeholder="复查意见（如：护理后泪膜恢复，可继续）"
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <div className="review-row">
        <SlotSelects
          data={data}
          ignoreSessionId={session.id}
          deviceId={selection.deviceId}
          slotId={selection.slotId}
          onChange={setSelection}
        />
        <button
          className="primary-action"
          disabled={!doctor.trim() || !selection.slotId}
          onClick={() =>
            onConfirm(selection.deviceId, selection.slotId, doctor.trim(), note.trim())
          }
        >
          医生确认继续并重新排机
        </button>
      </div>
    </div>
  );
}

// ---------- 不良事件：冻结计划 ----------

export function FreezePanel({
  onSubmit,
  onCancel,
}: {
  onSubmit: (event: AdverseEvent, reason: string) => void;
  onCancel: () => void;
}) {
  const [event, setEvent] = useState<AdverseEvent>("epithelial_detachment");
  const [reason, setReason] = useState("");

  return (
    <div className="freeze-panel">
      <p className="freeze-title">上报不良事件并冻结计划</p>
      <div className="freeze-row">
        <select value={event} onChange={(e) => setEvent(e.target.value as AdverseEvent)}>
          <option value="epithelial_detachment">{ADVERSE_LABEL.epithelial_detachment}</option>
          <option value="burn">{ADVERSE_LABEL.burn}</option>
        </select>
        <input
          placeholder="记录原因（必填，如：治疗后角膜缘灼伤）"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div className="freeze-actions">
        <button
          className="danger-action"
          disabled={!reason.trim()}
          onClick={() => onSubmit(event, reason.trim())}
        >
          冻结并停止后续预约
        </button>
        <button onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}
