import { useMemo, useState } from "react";
import "./styles.css";
import { StoreProvider, useStore } from "./data/store";
import type { ActorRole } from "./types";
import PatientList from "./components/PatientList";
import AssessmentForm from "./components/AssessmentForm";
import WorkflowPanel from "./components/WorkflowPanel";
import ScheduleBoard from "./components/ScheduleBoard";
import AssessmentArchive from "./components/AssessmentArchive";
import AuditTrail from "./components/AuditTrail";

const ROLES: { id: ActorRole; label: string; desc: string }[] = [
  { id: "nurse", label: "护理师", desc: "录入评估 / 排机 / 提交复查" },
  { id: "doctor", label: "复查医生", desc: "确认继续 / 安全冻结" },
];

function Console() {
  const { state } = useStore();
  const [role, setRole] = useState<ActorRole>("nurse");
  const [selectedId, setSelectedId] = useState(state.plans[0].id);

  const plan = state.plans.find((p) => p.id === selectedId) ?? state.plans[0];

  const metrics = useMemo(() => {
    const review = state.plans.filter((p) => p.status === "pending_review").length;
    const waiting = state.plans.filter((p) => p.status === "awaiting_doctor").length;
    const frozen = state.plans.filter((p) => p.status === "frozen").length;
    const booked = state.plans.filter((p) => p.booking).length;
    return [
      { label: "已占仪器时段", value: booked, cls: "badge-ok" },
      { label: "待复核", value: review, cls: "badge-warn" },
      { label: "待医生确认", value: waiting, cls: "badge-info" },
      { label: "已冻结", value: frozen, cls: "badge-danger" },
    ];
  }, [state.plans]);

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">干眼热脉动疗程台 · DTP-Console</p>
          <h1>干眼热脉动疗程台</h1>
          <p className="subtitle">
            按患者与眼别存档两次泪膜破裂时间、角膜染色分级与仪器时段；同一仪器同一时段仅一人。
            破裂时间不足 5 秒或染色达 3 级自动待复核并释放时段，护理后复查经医生确认继续；
            上皮脱落或灼伤立即冻结并停止后续预约。
          </p>
        </div>
        <div className="stack-card">
          <span>当前角色（数据、判定、留档、界面分层）</span>
          <div className="role-switch">
            {ROLES.map((r) => (
              <button
                key={r.id}
                className={role === r.id ? "role active" : "role"}
                onClick={() => setRole(r.id)}
              >
                <strong>{r.label}</strong>
                <em>{r.desc}</em>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        {metrics.map((m) => (
          <article key={m.label} className="metric-card">
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <i className={m.cls} />
          </article>
        ))}
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <h2>疗程患者</h2>
          <PatientList
            plans={state.plans}
            selectedId={plan.id}
            onSelect={setSelectedId}
          />
        </aside>

        <div className="main-col">
          <WorkflowPanel plan={plan} role={role} />
          <AssessmentForm plan={plan} role={role} />
        </div>
      </section>

      <ScheduleBoard selectedPlan={plan} role={role} />
      <AssessmentArchive plan={plan} />
      <AuditTrail />
    </main>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Console />
    </StoreProvider>
  );
}
