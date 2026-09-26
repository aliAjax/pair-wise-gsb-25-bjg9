import { deviceName, slotLabel } from "../domain/catalog";
import { useStore } from "../data/store";
import type { ActorRole, TreatmentPlan } from "../types";
import FreezeDialog from "./FreezeDialog";

interface Props {
  plan: TreatmentPlan;
  role: ActorRole;
}

const STEPS: { key: string; label: string }[] = [
  { key: "new", label: "待评估" },
  { key: "ready", label: "可排程" },
  { key: "pending_review", label: "待复核" },
  { key: "awaiting_doctor", label: "医生确认" },
  { key: "frozen", label: "已冻结" },
];

const ORDER: Record<string, number> = {
  new: 0,
  ready: 1,
  pending_review: 2,
  awaiting_doctor: 3,
  frozen: 4,
};

export default function WorkflowPanel({ plan, role }: Props) {
  const { dispatch } = useStore();
  const current = ORDER[plan.status];

  return (
    <section className="panel workflow-panel">
      <div className="section-heading">
        <div>
          <p>疗程流转</p>
          <h2>当前计划</h2>
        </div>
      </div>

      <ol className={`steps ${plan.status}`}>
        {STEPS.map((step, i) => (
          <li
            key={step.key}
            className={
              i === current ? "current" : i < current ? "done" : "todo"
            }
          >
            <i>{i + 1}</i>
            <span>{step.label}</span>
          </li>
        ))}
      </ol>

      {plan.booking && (
        <div className="booking-card">
          <div>
            <span className="booking-label">已占仪器时段</span>
            <strong>
              {deviceName(plan.booking.deviceId)} · {slotLabel(plan.booking.slotId)}
            </strong>
            <span className="booking-date">{plan.booking.date}</span>
          </div>
          {role === "nurse" && plan.status !== "frozen" && (
            <button
              onClick={() =>
                dispatch({ type: "release_slot", role: "nurse", planId: plan.id })
              }
            >
              释放时段
            </button>
          )}
        </div>
      )}

      {plan.status === "pending_review" && (
        <div className="workflow-note warn">
          {role === "nurse"
            ? "护理后请在左侧勾选「护理后复查」录入复查数据，提交后由医生确认。"
            : "等待护理师提交护理后复查数据。"}
        </div>
      )}

      {plan.status === "awaiting_doctor" &&
        (role === "doctor" ? (
          <div className="doctor-actions">
            <p className="workflow-note info">
              请核对护理后复查数据：确认继续则恢复疗程并可重新排机；数据仍不达标则退回继续护理。
            </p>
            <div className="form-actions">
              <button
                className="primary-action"
                onClick={() =>
                  dispatch({
                    type: "doctor_decide",
                    role: "doctor",
                    planId: plan.id,
                    proceed: true,
                  })
                }
              >
                医生确认继续
              </button>
              <button
                onClick={() =>
                  dispatch({
                    type: "doctor_decide",
                    role: "doctor",
                    planId: plan.id,
                    proceed: false,
                  })
                }
              >
                退回继续护理
              </button>
            </div>
          </div>
        ) : (
          <div className="workflow-note info">
            复查已提交，等待医生确认是否继续。
          </div>
        ))}

      {plan.status === "frozen" && plan.freeze && (
        <div className="frozen-card">
          <strong>已冻结：{plan.freeze.type === "burn" ? "眼部灼伤" : "角膜上皮脱落"}</strong>
          <p>{plan.freeze.detail}</p>
        </div>
      )}

      {plan.status !== "frozen" && role === "doctor" && (
        <div className="form-actions freeze-action">
          <FreezeDialog plan={plan} />
        </div>
      )}
    </section>
  );
}
