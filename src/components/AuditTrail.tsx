import { formatTime, ROLE_META } from "../domain/audit";
import { useStore } from "../data/store";

export default function AuditTrail() {
  const { state } = useStore();

  return (
    <section className="panel audit-panel">
      <div className="section-heading">
        <div>
          <p>留档（只追加）</p>
          <h2>操作与判定记录</h2>
        </div>
      </div>
      <ul className="audit-list">
        {state.audits.map((event) => (
          <li key={event.id} className="audit-item">
            <span className="audit-time">{formatTime(event.at)}</span>
            <span className={`audit-role role-${event.role}`}>
              {ROLE_META[event.role]}
            </span>
            <span className="audit-action">{event.action}</span>
            <span className="audit-message">{event.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
