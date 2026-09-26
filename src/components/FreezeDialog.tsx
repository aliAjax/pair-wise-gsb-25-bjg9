import { useState } from "react";
import { FREEZE_META, deviceName, slotLabel } from "../domain/catalog";
import { useStore } from "../data/store";
import type { FreezeType, TreatmentPlan } from "../types";

interface Props {
  plan: TreatmentPlan;
}

export default function FreezeDialog({ plan }: Props) {
  const { dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [freezeType, setFreezeType] = useState<FreezeType>("epithelial_defect");
  const [detail, setDetail] = useState("");

  if (!open) {
    return (
      <button className="danger-action" onClick={() => setOpen(true)}>
        冻结计划（上皮脱落 / 灼伤）
      </button>
    );
  }

  function confirm() {
    if (!detail.trim()) return;
    dispatch({
      type: "freeze",
      role: "doctor",
      planId: plan.id,
      freezeType,
      detail: detail.trim(),
    });
    setOpen(false);
    setDetail("");
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h3>冻结疗程计划 · {plan.patientName}</h3>
        <p className="dialog-warn">
          冻结后将记录原因、释放当前仪器时段并停止一切后续预约，不可在本机恢复。
        </p>
        <label>
          <span>安全事件类型</span>
          <select
            value={freezeType}
            onChange={(e) => setFreezeType(e.target.value as FreezeType)}
          >
            {(
              Object.keys(FREEZE_META) as FreezeType[]
            ).map((key) => (
              <option key={key} value={key}>
                {FREEZE_META[key].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>情况与原因（必填，留档）</span>
          <textarea
            rows={3}
            value={detail}
            placeholder="如：右眼鼻上方点片状上皮脱落，患者诉畏光、刺痛……"
            onChange={(e) => setDetail(e.target.value)}
          />
        </label>
        <div className="form-actions">
          <button onClick={() => setOpen(false)}>取消</button>
          <button className="danger-action" disabled={!detail.trim()} onClick={confirm}>
            确认冻结并停止预约
          </button>
        </div>
        {plan.booking && (
          <p className="prior-note">
            将同时释放：{deviceName(plan.booking.deviceId)}{" "}
            {slotLabel(plan.booking.slotId)}
          </p>
        )}
      </div>
    </div>
  );
}
