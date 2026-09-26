import StatusBadge from "./StatusBadge";
import type { TreatmentPlan } from "../types";

interface Props {
  plans: TreatmentPlan[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export default function PatientList({ plans, selectedId, onSelect }: Props) {
  return (
    <div className="patient-list">
      {plans.map((plan) => (
        <button
          key={plan.id}
          className={`patient-item ${plan.id === selectedId ? "active" : ""}`}
          onClick={() => onSelect(plan.id)}
        >
          <div className="patient-item-top">
            <strong>{plan.patientName}</strong>
            <StatusBadge status={plan.status} />
          </div>
          <span className="patient-item-id">{plan.patientId}</span>
        </button>
      ))}
    </div>
  );
}
