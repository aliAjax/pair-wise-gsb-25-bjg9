import type { ConsoleData } from "../domain/types";
import { sessionHoldsSlot } from "../domain/rules";

export function MetricsBar({ data }: { data: ConsoleData }) {
  const sessions = data.plans.flatMap((plan) => plan.sessions);
  const holding = sessions.filter(sessionHoldsSlot).length;
  const totalSlots = data.devices.length * data.slots.length;
  const review = sessions.filter((session) => session.status === "pending_review").length;
  const ready = sessions.filter((session) => session.status === "ready").length;
  const frozen = data.plans.filter((plan) => plan.status === "frozen").length;

  const metrics = [
    { label: "仪器时段占用", value: `${holding}/${totalSlots}`, tone: "status-ok" },
    { label: "待复核", value: String(review), tone: review > 0 ? "status-watch" : "status-ok" },
    { label: "待上机", value: String(ready), tone: "status-ok" },
    { label: "冻结计划", value: String(frozen), tone: frozen > 0 ? "status-danger" : "status-ok" },
  ];

  return (
    <section className="metrics-grid">
      {metrics.map((metric) => (
        <article key={metric.label} className="metric-card">
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          <i className={metric.tone} />
        </article>
      ))}
    </section>
  );
}
