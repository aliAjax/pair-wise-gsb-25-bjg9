import { EYE_LABEL, PLAN_STATUS_LABEL, type Patient, type TreatmentPlan } from "../domain/types";

export function PatientSidebar({
  patients,
  plans,
  selectedId,
  onSelect,
}: {
  patients: Patient[];
  plans: TreatmentPlan[];
  selectedId: string;
  onSelect: (patientId: string) => void;
}) {
  return (
    <aside className="panel narrow">
      <h2>患者</h2>
      <div className="patient-list">
        {patients.map((patient) => {
          const ownPlans = plans.filter((plan) => plan.patientId === patient.id);
          return (
            <button
              key={patient.id}
              className={`patient-item${patient.id === selectedId ? " active" : ""}`}
              onClick={() => onSelect(patient.id)}
            >
              <strong>{patient.name}</strong>
              <span>
                {patient.id} · {patient.age} 岁
              </span>
              <span className="plan-chips">
                {ownPlans.length === 0 ? (
                  <em>无疗程</em>
                ) : (
                  ownPlans.map((plan) => (
                    <i key={plan.id} className={`plan-chip st-${plan.status}`}>
                      {EYE_LABEL[plan.eye]}·{PLAN_STATUS_LABEL[plan.status]}
                    </i>
                  ))
                )}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
