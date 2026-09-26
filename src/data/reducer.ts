import { FREEZE_META, deviceName, slotLabel } from "../domain/catalog";
import { canSubmitRecheck, evaluateEye, slotDecision } from "../domain/rules";
import { createEvent } from "../domain/audit";
import { seedState, type AppState } from "./seed";
import type {
  ActorRole,
  EyeAssessment,
  EyeSide,
  FreezeType,
  PlanStatus,
  StainGrade,
  TreatmentPlan,
} from "../types";

/** 数据层：reducer 纯逻辑（不依赖 React），由 store 装配 */

export type Action =
  | {
      type: "save_assessment";
      role: ActorRole;
      planId: string;
      eye: EyeSide;
      butFirst: number;
      butSecond: number;
      stainGrade: StainGrade;
      date: string;
      deviceId: string;
      slotId: string;
      asRecheck: boolean;
    }
  | {
      type: "book_slot";
      role: ActorRole;
      planId: string;
      date: string;
      deviceId: string;
      slotId: string;
    }
  | { type: "release_slot"; role: ActorRole; planId: string }
  | { type: "doctor_decide"; role: ActorRole; planId: string; proceed: boolean }
  | {
      type: "freeze";
      role: ActorRole;
      planId: string;
      freezeType: FreezeType;
      detail: string;
    };

export { seedState };

function appendAudit(list: AppState["audits"], event: AppState["audits"][number]) {
  return [event, ...list];
}

function patchPlan(
  plans: TreatmentPlan[],
  planId: string,
  patch: Partial<TreatmentPlan>,
): TreatmentPlan[] {
  return plans.map((p) =>
    p.id === planId ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
  );
}

function otherPlanOccupies(
  plans: TreatmentPlan[],
  selfId: string,
  deviceId: string,
  date: string,
  slotId: string,
): TreatmentPlan | undefined {
  const key = `${date}|${deviceId}|${slotId}`;
  return plans.find(
    (p) =>
      p.id !== selfId &&
      p.booking &&
      `${p.booking.date}|${p.booking.deviceId}|${p.booking.slotId}` === key,
  );
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "save_assessment": {
      const plan = state.plans.find((p) => p.id === action.planId);
      if (!plan || plan.status === "frozen") return state;
      if (action.role !== "nurse") return state;

      const verdict = evaluateEye(action.eye, {
        butFirst: action.butFirst,
        butSecond: action.butSecond,
        stainGrade: action.stainGrade,
      });

      const now = new Date().toISOString();
      const assessment: EyeAssessment = {
        id: `ASS-${Date.now()}-${action.eye}`,
        patientId: plan.patientId,
        eye: action.eye,
        butFirst: action.butFirst,
        butSecond: action.butSecond,
        stainGrade: action.stainGrade,
        date: action.date,
        deviceId: action.deviceId,
        slotId: action.slotId,
        asRecheck: action.asRecheck,
        needsReview: verdict.needsReview,
        reasons: verdict.reasons,
        slotResult: "skipped",
        slotMessage: "",
        savedAt: now,
        savedBy: action.role,
      };

      let audits = appendAudit(
        state.audits,
        createEvent(
          "nurse",
          "评估存档",
          `${plan.patientName} ${action.eye === "OD" ? "右眼" : "左眼"}${
            action.asRecheck ? "护理后复查" : "评估"
          }存档：BUT ${action.butFirst}s/${action.butSecond}s，染色 ${action.stainGrade} 级。`,
          plan.id,
        ),
      );

      let nextStatus: PlanStatus = plan.status;
      let booking = plan.booking;

      if (action.asRecheck) {
        // 护理后复查：只有待复核计划可提交，提交后等待医生确认，期间不排机
        if (!canSubmitRecheck(plan.status)) return state;
        nextStatus = "awaiting_doctor";
        assessment.slotResult = "blocked_status";
        assessment.slotMessage = "护理后复查须医生确认，暂不排机";
        if (booking) booking = null;
        audits = appendAudit(
          audits,
          createEvent(
            "nurse",
            "复查提交",
            `${plan.patientName} 护理后复查已提交，等待医生确认继续。`,
            plan.id,
          ),
        );
      } else {
        // 计划级判定：任一眼（含另一只眼最近一次初评）异常 → 待复核
        const otherEye: EyeSide = action.eye === "OD" ? "OS" : "OD";
        const otherLatest = state.assessments
          .filter(
            (a) =>
              a.patientId === plan.patientId &&
              a.eye === otherEye &&
              !a.asRecheck,
          )
          .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))[0];
        const overallNeedsReview =
          verdict.needsReview || (otherLatest?.needsReview ?? false);

        if (overallNeedsReview) {
          nextStatus = "pending_review";
          assessment.slotResult = "skipped";
          assessment.slotMessage = verdict.needsReview
            ? "触发待复核规则，时段未占用"
            : "对侧眼未复核，时段未占用";
          if (booking) {
            audits = appendAudit(
              audits,
              createEvent(
                "system",
                "释放时段",
                `${plan.patientName} 进入待复核，自动释放 ${deviceName(
                  booking.deviceId,
                )} ${slotLabel(booking.slotId)}。`,
                plan.id,
              ),
            );
            booking = null;
          }
          audits = appendAudit(
            audits,
            createEvent(
              "system",
              "待复核",
              `${plan.patientName} 判定待复核：${[
                ...verdict.reasons,
                ...(otherLatest?.reasons ?? []),
              ].join("；")}。时段已释放，护理后复查须医生确认。`,
              plan.id,
            ),
          );
        } else {
          nextStatus = "ready";
          const issue = slotDecision(
            "ready",
            Boolean(
              otherPlanOccupies(
                state.plans,
                plan.id,
                action.deviceId,
                action.date,
                action.slotId,
              ),
            ),
          );
          if (issue === "ok") {
            booking = {
              deviceId: action.deviceId,
              date: action.date,
              slotId: action.slotId,
              bookedAt: now,
            };
            assessment.slotResult = "arranged";
            assessment.slotMessage = `已安排 ${deviceName(action.deviceId)} ${slotLabel(
              action.slotId,
            )}`;
            audits = appendAudit(
              audits,
              createEvent(
                "system",
                "时段安排",
                `${plan.patientName} 占用 ${deviceName(action.deviceId)} ${slotLabel(
                  action.slotId,
                )}（${action.date}）。`,
                plan.id,
              ),
            );
          } else {
            assessment.slotResult = "blocked_conflict";
            assessment.slotMessage = `同一仪器同一时段已安排他人，未占用：${deviceName(
              action.deviceId,
            )} ${slotLabel(action.slotId)}`;
            audits = appendAudit(
              audits,
              createEvent(
                "system",
                "排机拦截",
                `${plan.patientName} 申请 ${deviceName(
                  action.deviceId,
                )} ${slotLabel(action.slotId)} 失败：该时段已有他人。`,
                plan.id,
              ),
            );
          }
        }
      }

      return {
        ...state,
        assessments: [assessment, ...state.assessments],
        plans: patchPlan(state.plans, plan.id, {
          status: nextStatus,
          booking,
        }),
        audits,
      };
    }

    case "book_slot": {
      const plan = state.plans.find((p) => p.id === action.planId);
      if (!plan || plan.status !== "ready" || action.role !== "nurse")
        return state;
      if (
        otherPlanOccupies(
          state.plans,
          plan.id,
          action.deviceId,
          action.date,
          action.slotId,
        )
      )
        return state;
      const audits = appendAudit(
        state.audits,
        createEvent(
          "nurse",
          "预约排机",
          `${plan.patientName} 安排 ${deviceName(action.deviceId)} ${slotLabel(
            action.slotId,
          )}（${action.date}）。`,
          plan.id,
        ),
      );
      return {
        ...state,
        plans: patchPlan(state.plans, plan.id, {
          booking: {
            deviceId: action.deviceId,
            date: action.date,
            slotId: action.slotId,
            bookedAt: new Date().toISOString(),
          },
        }),
        audits,
      };
    }

    case "release_slot": {
      const plan = state.plans.find((p) => p.id === action.planId);
      if (!plan || !plan.booking || action.role !== "nurse") return state;
      const old = plan.booking;
      const audits = appendAudit(
        state.audits,
        createEvent(
          "nurse",
          "释放时段",
          `${plan.patientName} 释放 ${deviceName(old.deviceId)} ${slotLabel(
            old.slotId,
          )}（${old.date}）。`,
          plan.id,
        ),
      );
      return {
        ...state,
        plans: patchPlan(state.plans, plan.id, { booking: null }),
        audits,
      };
    }

    case "doctor_decide": {
      const plan = state.plans.find((p) => p.id === action.planId);
      if (!plan || plan.status !== "awaiting_doctor" || action.role !== "doctor")
        return state;
      const nextStatus: PlanStatus = action.proceed ? "ready" : "pending_review";
      const audits = appendAudit(
        state.audits,
        createEvent(
          "doctor",
          action.proceed ? "确认继续" : "退回复核",
          action.proceed
            ? `${plan.patientName} 护理后复查经医生确认，恢复疗程，可重新排机。`
            : `${plan.patientName} 复查未达标，医生退回继续护理与复核。`,
          plan.id,
        ),
      );
      return {
        ...state,
        plans: patchPlan(state.plans, plan.id, { status: nextStatus }),
        audits,
      };
    }

    case "freeze": {
      const plan = state.plans.find((p) => p.id === action.planId);
      if (!plan || plan.status === "frozen" || action.role !== "doctor")
        return state;
      const reasonLabel = FREEZE_META[action.freezeType].label;
      let audits = appendAudit(
        state.audits,
        createEvent(
          "doctor",
          "冻结计划",
          `${plan.patientName} 发生${reasonLabel}：${action.detail}。计划冻结。`,
          plan.id,
        ),
      );
      if (plan.booking) {
        audits = appendAudit(
          audits,
          createEvent(
            "system",
            "释放时段",
            `${plan.patientName} 冻结，自动释放 ${deviceName(
              plan.booking.deviceId,
            )} ${slotLabel(plan.booking.slotId)}。`,
            plan.id,
          ),
        );
      }
      audits = appendAudit(
        audits,
        createEvent(
          "system",
          "停止预约",
          `${plan.patientName} 已停止一切后续预约。`,
          plan.id,
        ),
      );
      return {
        ...state,
        plans: patchPlan(state.plans, plan.id, {
          status: "frozen",
          booking: null,
          freeze: {
            type: action.freezeType,
            detail: action.detail,
            at: new Date().toISOString(),
            by: action.role,
          },
        }),
        audits,
      };
    }

    default:
      return state;
  }
}
