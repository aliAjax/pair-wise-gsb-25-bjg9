import { STATUS_META } from "../domain/catalog";
import type { PlanStatus } from "../types";

export default function StatusBadge({ status }: { status: PlanStatus }) {
  const meta = STATUS_META[status];
  return <span className={`badge ${meta.badge}`}>{meta.label}</span>;
}
