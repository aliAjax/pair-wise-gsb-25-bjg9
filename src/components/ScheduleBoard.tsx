import { useState } from "react";
import { DEVICES, SLOTS, todayStr } from "../domain/catalog";
import { occupancyForDate, useStore } from "../data/store";
import type { ActorRole, TreatmentPlan } from "../types";

interface Props {
  selectedPlan: TreatmentPlan;
  role: ActorRole;
}

export default function ScheduleBoard({ selectedPlan, role }: Props) {
  const { state, dispatch } = useStore();
  const [date, setDate] = useState(todayStr());
  const occupancy = occupancyForDate(state, date);

  return (
    <section className="panel schedule-panel">
      <div className="section-heading">
        <div>
          <p>仪器时段表</p>
          <h2>同一仪器同一时段只安排一人</h2>
        </div>
        <label className="date-inline">
          <span>日期</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>

      <div className="schedule-scroll">
        <table className="schedule-table">
          <thead>
            <tr>
              <th className="device-col">仪器</th>
              {SLOTS.map((s) => (
                <th key={s.id}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEVICES.map((device) => (
              <tr key={device.id}>
                <th className="device-col">{device.name}</th>
                {SLOTS.map((slot) => {
                  const holder = occupancy.get(`${date}|${device.id}|${slot.id}`);
                  const isSelf = holder?.id === selectedPlan.id;
                  const canAssign =
                    role === "nurse" &&
                    selectedPlan.status === "ready" &&
                    !holder;
                  return (
                    <td key={slot.id} className={holder ? "taken" : "open"}>
                      {holder ? (
                        <span
                          className={`cell-patient ${isSelf ? "self" : ""}`}
                          title={holder.patientId}
                        >
                          {holder.patientName}
                        </span>
                      ) : canAssign ? (
                        <button
                          className="cell-book"
                          onClick={() =>
                            dispatch({
                              type: "book_slot",
                              role: "nurse",
                              planId: selectedPlan.id,
                              date,
                              deviceId: device.id,
                              slotId: slot.id,
                            })
                          }
                        >
                          安排
                        </button>
                      ) : (
                        <span className="cell-empty">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="prior-note">
        选中患者：{selectedPlan.patientName}（当前{selectedPlan.status === "ready"
          ? "可排程，可点击空格安排"
          : "状态不允许直接排机"}）。
      </p>
    </section>
  );
}
