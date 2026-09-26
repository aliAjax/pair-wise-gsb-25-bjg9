import { EYE_LABEL, SESSION_STATUS_LABEL, type ConsoleData } from "../domain/types";
import { occupancyBySlot, slotKey } from "../domain/rules";

export function SlotGrid({ data }: { data: ConsoleData }) {
  const occupancy = occupancyBySlot(data);
  const patientName = (patientId: string) =>
    data.patients.find((item) => item.id === patientId)?.name ?? patientId;

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>仪器时段</p>
          <h2>当日排机一览</h2>
        </div>
        <span className="legend">同一仪器同一时段仅安排一人；待复核释放后立即变为可约</span>
      </div>
      <div className="slot-grid-wrap">
        <table className="slot-grid">
          <thead>
            <tr>
              <th>仪器</th>
              {data.slots.map((slot) => (
                <th key={slot.id}>{slot.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.devices.map((device) => (
              <tr key={device.id}>
                <th className="device-cell">{device.name}</th>
                {data.slots.map((slot) => {
                  const hit = occupancy.get(slotKey(device.id, slot.id));
                  if (!hit) {
                    return (
                      <td key={slot.id} className="slot-free">
                        可约
                      </td>
                    );
                  }
                  return (
                    <td key={slot.id} className={`slot-busy st-${hit.session.status}`}>
                      <strong>{patientName(hit.plan.patientId)}</strong>
                      <span>
                        {EYE_LABEL[hit.plan.eye]} · 第{hit.session.seq}次 ·{" "}
                        {SESSION_STATUS_LABEL[hit.session.status]}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
