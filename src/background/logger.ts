import type { Flow, FlowRunLog, RunStatus, Step, StepRunLog, TriggerType } from "../shared/models";
import { nowIso, randomId } from "../shared/utils";
import { upsertLog } from "./storage";

export function createFlowLog(flow: Flow, triggeredBy: TriggerType | "direct", urlAtStart?: string): FlowRunLog {
  return {
    id: randomId("log"),
    flowId: flow.id,
    flowName: flow.name,
    triggeredBy,
    startedAt: nowIso(),
    finishedAt: nowIso(),
    status: "partial",
    stepLogs: [],
    urlAtStart
  };
}

export async function addStepLog(flowLog: FlowRunLog, step: Step, status: RunStatus, errorMessage?: string): Promise<FlowRunLog> {
  const now = nowIso();
  const stepLog: StepRunLog = {
    stepId: step.id,
    stepName: step.name,
    status,
    startedAt: now,
    finishedAt: now,
    errorMessage
  };
  flowLog.stepLogs.push(stepLog);
  await upsertLog(flowLog);
  return flowLog;
}

export async function finalizeFlowLog(flowLog: FlowRunLog, status: RunStatus): Promise<void> {
  flowLog.status = status;
  flowLog.finishedAt = nowIso();
  await upsertLog(flowLog);
}


