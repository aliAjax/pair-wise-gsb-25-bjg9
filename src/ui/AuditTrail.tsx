import { AUDIT_ACTION_LABEL, type AuditEntry } from "../domain/types";
import { formatDateTime } from "./format";

export function AuditTrail({ audit }: { audit: AuditEntry[] }) {
  const entries = [...audit].reverse();

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>留档</p>
          <h2>操作与判定记录</h2>
        </div>
        <span className="legend">共 {audit.length} 条 · 最新在前</span>
      </div>
      <div className="audit-list">
        {entries.map((entry) => (
          <article key={entry.id} className="audit-row">
            <span className="audit-time">{formatDateTime(entry.at)}</span>
            <span className={`audit-action act-${entry.action}`}>
              {AUDIT_ACTION_LABEL[entry.action]}
            </span>
            <span className="audit-summary">{entry.summary}</span>
            <span className="audit-actor">{entry.actor}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
