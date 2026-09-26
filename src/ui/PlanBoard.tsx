import { useState } from "react";
import {
  ADVERSE_LABEL,
  EYE_LABEL,
  PLAN_STATUS_LABEL,
  SESSION_STATUS_LABEL,
  type ConsoleData,
  type EyeExam,
  type EyeSide,
  type Patient,
  type TreatmentPlan,
  type TreatmentSession,
} from "../domain/types";
import { averageTbut, evaluateExam, sessionHoldsSlot } from "../domain/rules";
import {
  bookSlot,
  completeSession,
  confirmReview,
  createPlan,
  reportAdverseEvent,
  saveExam,
} from "../data/store";
import { BookingControls, ExamForm, FreezePanel, ReviewForm } from "./forms";
import { formatDateTime } from "./format";
import type { Run } from "./useConsole";

export function PlanBoard({
  patient,
  data,
  run,
}: {
  patient: Patient;
  data: ConsoleData;
  run: Run;
}) {
  const [eye, setEye] = useState<EyeSide>("OD");
  const plans = data.plans.filter((plan) => plan.patientId === patient.id);

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>疗程计划</p>
          <h2>
            {patient.name} · {patient.id}
          </h2>
        </div>
        <div className="new-plan">
          <select value={eye} onChange={(event) => setEye(event.target.value as EyeSide)}>
            <option value="OD">右眼</option>
            <option value="OS">左眼</option>
          </select>
          <button
            className="primary-action"
            onClick={() => run((current) => createPlan(current, patient.id, eye, "前台小周"))}
          >
            新建疗程
          </button>
        </div>
      </div>

      {plans.length === 0 && <p className="empty-hint">尚无疗程计划，请选择眼别后新建。</p>}

      <div className="plan-list">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} data={data} run={run} />
        ))}
      </div>
    </section>
  );
}

function PlanCard({ plan, data, run }: { plan: TreatmentPlan; data: ConsoleData; run: Run }) {
  const [freezing, setFreezing] = useState(false);
  const doneCount = plan.sessions.filter((session) => session.status === "completed").length;

  return (
    <article className={`plan-card st-${plan.status}`}>
      <div className="plan-head">
        <div className="plan-title">
          <h3>{EYE_LABEL[plan.eye]}热脉动疗程</h3>
          <span className={`plan-chip st-${plan.status}`}>{PLAN_STATUS_LABEL[plan.status]}</span>
          {plan.adverseEvent && (
            <span className="plan-chip st-frozen">{ADVERSE_LABEL[plan.adverseEvent]}</span>
          )}
          <span className="legend">
            已完成 {doneCount}/{plan.sessions.length} 次
          </span>
        </div>
        {plan.status === "active" && !freezing && (
          <button className="danger-outline" onClick={() => setFreezing(true)}>
            上报不良事件
          </button>
        )}
      </div>

      {plan.status === "frozen" && (
        <p className="freeze-banner">
          已冻结 · {formatDateTime(plan.frozenAt)}
          {plan.adverseEvent ? ` · ${ADVERSE_LABEL[plan.adverseEvent]}` : ""} · 原因：
          {plan.freezeReason}。后续预约已停止。
        </p>
      )}

      {freezing && plan.status === "active" && (
        <FreezePanel
          onSubmit={(event, reason) => {
            run((current) => reportAdverseEvent(current, plan.id, event, reason, "王医生"));
            setFreezing(false);
          }}
          onCancel={() => setFreezing(false)}
        />
      )}

      <div className="session-list">
        {plan.sessions.map((session) => (
          <SessionRow key={session.id} plan={plan} session={session} data={data} run={run} />
        ))}
      </div>
    </article>
  );
}

function ExamSummary({ exam }: { exam: EyeExam }) {
  const avg = averageTbut(exam);
  const verdict = evaluateExam(exam);
  return (
    <p className={`exam-summary${verdict.kind === "review" ? " warn" : ""}`}>
      破裂时间 ①{exam.tbutFirst}s ②{exam.tbutSecond}s · 均值 {avg.toFixed(1)}s · 染色{" "}
      {exam.staining} 级
      <span className="exam-meta">
        {exam.recordedBy} 录 · {formatDateTime(exam.recordedAt)}
      </span>
    </p>
  );
}

function SessionRow({
  plan,
  session,
  data,
  run,
}: {
  plan: TreatmentPlan;
  session: TreatmentSession;
  data: ConsoleData;
  run: Run;
}) {
  const device = data.devices.find((item) => item.id === session.deviceId);
  const slot = data.slots.find((item) => item.id === session.slotId);
  const releasedDevice = data.devices.find(
    (item) => item.id === session.releasedSlot?.deviceId
  );
  const releasedSlot = data.slots.find((item) => item.id === session.releasedSlot?.slotId);

  let slotText = "未排机";
  if (sessionHoldsSlot(session) && device && slot) {
    slotText = `${device.name} · ${slot.label}`;
  } else if (session.status === "pending_review" && session.releasedSlot) {
    slotText = `已释放：${releasedDevice?.name ?? "—"} · ${releasedSlot?.label ?? "—"}`;
  } else if (session.status === "completed" && device && slot) {
    slotText = `完成于 ${device.name} · ${slot.label}`;
  } else if (session.status === "cancelled") {
    slotText = "时段已停止";
  }

  return (
    <article className={`session-row st-${session.status}`}>
      <div className="session-head">
        <span className="session-seq">第 {session.seq} 次</span>
        <span className={`pill st-${session.status}`}>{SESSION_STATUS_LABEL[session.status]}</span>
        <span className="session-slot">{slotText}</span>
      </div>

      {session.exam && <ExamSummary exam={session.exam} />}

      {session.reviewedBy && (
        <p className="session-note">
          医生复核：{session.reviewedBy}
          {session.reviewNote ? ` · ${session.reviewNote}` : ""}
        </p>
      )}

      {session.status === "unscheduled" && (
        <BookingControls
          data={data}
          sessionId={session.id}
          submitLabel="排机"
          onBook={(deviceId, slotId) =>
            run((current) => bookSlot(current, plan.id, session.id, deviceId, slotId, "前台小周"))
          }
        />
      )}

      {session.status === "scheduled" && (
        <>
          <ExamForm
            initial={session.exam}
            onSave={(input) =>
              run((current) => saveExam(current, plan.id, session.id, input, "护士小李"))
            }
          />
          <details className="rebook">
            <summary>调整时段</summary>
            <BookingControls
              data={data}
              sessionId={session.id}
              submitLabel="确认改期"
              onBook={(deviceId, slotId) =>
                run((current) => bookSlot(current, plan.id, session.id, deviceId, slotId, "前台小周"))
              }
            />
          </details>
        </>
      )}

      {session.status === "ready" && (
        <div className="ready-actions">
          <ExamForm
            initial={session.exam}
            onSave={(input) =>
              run((current) => saveExam(current, plan.id, session.id, input, "护士小李"))
            }
          />
          <button
            className="primary-action"
            onClick={() =>
              run((current) => completeSession(current, plan.id, session.id, "治疗师王芳"))
            }
          >
            完成本次治疗
          </button>
        </div>
      )}

      {session.status === "pending_review" && (
        <ReviewForm
          data={data}
          session={session}
          onConfirm={(deviceId, slotId, doctor, note) =>
            run((current) =>
              confirmReview(current, plan.id, session.id, deviceId, slotId, doctor, note)
            )
          }
        />
      )}

      {session.status === "completed" && (
        <p className="session-note">完成时间：{formatDateTime(session.completedAt)}</p>
      )}
      {session.status === "cancelled" && (
        <p className="session-note">取消原因：{session.cancelReason ?? "—"}</p>
      )}
    </article>
  );
}
