import { EYE_META, deviceName, slotLabel } from "../domain/catalog";
import { formatTime } from "../domain/audit";
import { useStore } from "../data/store";
import type { TreatmentPlan } from "../types";

const SLOT_RESULT_META: Record<string, { label: string; cls: string }> = {
  arranged: { label: "已安排", cls: "slot-ok" },
  blocked_conflict: { label: "冲突未占用", cls: "slot-warn" },
  blocked_status: { label: "状态拦截", cls: "slot-warn" },
  skipped: { label: "未申请占用", cls: "slot-muted" },
};

export default function AssessmentArchive({ plan }: { plan: TreatmentPlan }) {
  const { state } = useStore();
  const records = state.assessments
    .filter((a) => a.patientId === plan.patientId)
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));

  return (
    <section className="panel archive-panel">
      <div className="section-heading">
        <div>
          <p>患者档案 · {plan.patientName}</p>
          <h2>按眼别存档的评估记录</h2>
        </div>
      </div>
      <div className="archive-list">
        {records.length === 0 && <p className="prior-note">暂无评估记录。</p>}
        {records.map((a) => {
          const result = SLOT_RESULT_META[a.slotResult];
          return (
            <article key={a.id} className="archive-card">
              <div className="archive-head">
                <strong>
                  {EYE_META[a.eye].label}
                  {a.asRecheck && <em className="recheck-tag">护理后复查</em>}
                </strong>
                <span className={`slot-tag ${result.cls}`}>{result.label}</span>
                <span className="archive-time">{formatTime(a.savedAt)}</span>
              </div>
              <div className="archive-grid">
                <span>
                  BUT 第1次 <strong>{a.butFirst}s</strong>
                </span>
                <span>
                  BUT 第2次 <strong>{a.butSecond}s</strong>
                </span>
                <span>
                  染色 <strong>{a.stainGrade} 级</strong>
                </span>
                <span>
                  仪器时段{" "}
                  <strong>
                    {deviceName(a.deviceId)} · {slotLabel(a.slotId)}（{a.date}）
                  </strong>
                </span>
              </div>
              {a.reasons.length > 0 && (
                <p className="archive-reasons">待复核：{a.reasons.join("；")}</p>
              )}
              {a.slotMessage && <p className="prior-note">{a.slotMessage}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
