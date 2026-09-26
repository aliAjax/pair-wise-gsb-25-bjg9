import { useState } from "react";
import "./styles.css";
import { useConsole } from "./ui/useConsole";
import { MetricsBar } from "./ui/MetricsBar";
import { PatientSidebar } from "./ui/PatientSidebar";
import { PlanBoard } from "./ui/PlanBoard";
import { SlotGrid } from "./ui/SlotGrid";
import { AuditTrail } from "./ui/AuditTrail";

function App() {
  const { data, notice, run, reset } = useConsole();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const patient = data.patients.find((item) => item.id === selectedId) ?? data.patients[0];
  const today = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  });

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-11 · 干眼门诊 · {today}</p>
          <h1>干眼热脉动疗程台</h1>
          <p className="subtitle">
            按患者与眼别记录两次泪膜破裂时间、角膜染色评分与仪器时段；指标异常自动转待复核并释放时段，出现角膜上皮脱落或灼伤即冻结疗程、停止后续预约。
          </p>
        </div>
        <div className="stack-card">
          <span>判定规则</span>
          <strong>破裂时间均值 &lt; 5s 或染色 ≥ 3 级 → 待复核</strong>
          <span>同一仪器同一时段仅安排一人 · 数据 / 判定 / 留档 / 界面分层</span>
          <button onClick={reset}>重置演示数据</button>
        </div>
      </section>

      <MetricsBar data={data} />

      {notice && <div className="notice">{notice}</div>}

      <section className="workspace">
        <PatientSidebar
          patients={data.patients}
          plans={data.plans}
          selectedId={patient?.id ?? ""}
          onSelect={setSelectedId}
        />
        {patient ? <PlanBoard patient={patient} data={data} run={run} /> : null}
      </section>

      <SlotGrid data={data} />
      <AuditTrail audit={data.audit} />
    </main>
  );
}

export default App;
