import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import { slotKey } from "../domain/catalog";
import { reducer, seedState, type Action } from "./reducer";
import type { AppState } from "./seed";
import type { TreatmentPlan } from "../types";

/** 数据层装配：Context + localStorage 持久化 + 只读选择器 */

const STORAGE_KEY = "dry-eye-console:v1";

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed.plans && parsed.assessments && parsed.audits) return parsed;
    }
  } catch {
    // 存档损坏时回退演示数据
  }
  return seedState;
}

interface StoreValue {
  state: AppState;
  dispatch: Dispatch<Action>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 存储不可用时仅影响持久化
    }
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore 必须在 StoreProvider 内使用");
  return ctx;
}

/** 某日的「时段键 → 占用计划」映射（同一仪器同一时段只有一人） */
export function occupancyForDate(
  state: AppState,
  date: string,
): Map<string, TreatmentPlan> {
  const map = new Map<string, TreatmentPlan>();
  for (const plan of state.plans) {
    if (plan.booking && plan.booking.date === date) {
      map.set(
        slotKey(plan.booking.deviceId, date, plan.booking.slotId),
        plan,
      );
    }
  }
  return map;
}
