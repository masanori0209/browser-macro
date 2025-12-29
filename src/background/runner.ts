import type { Flow, Step, TriggerType } from "../shared/models";
import { MessageType, type ExecuteStepMessage, type StepResultMessage } from "../shared/messageTypes";
import { createFlowLog, addStepLog, finalizeFlowLog } from "./logger";
import { getFlows, getTasks } from "./storage";

async function sendStepToTab(tabId: number, step: Step): Promise<StepResultMessage> {
  const payload: ExecuteStepMessage = { type: MessageType.ExecuteStep, step };
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(lastError);
        return;
      }
      resolve(response as StepResultMessage);
    });
  });
}

function flattenSteps(flow: Flow, tasksMap: Map<string, Step[]>): Step[] {
  const steps: Step[] = [];
  for (const taskId of flow.taskIds) {
    const taskSteps = tasksMap.get(taskId) ?? [];
    steps.push(...taskSteps);
  }
  return steps;
}

export async function runFlow(flowId: string, explicitTabId?: number, triggeredBy: TriggerType | "direct" = "direct"): Promise<void> {
  const [flows, tasks] = await Promise.all([getFlows(), getTasks()]);
  const flow = flows.find((f) => f.id === flowId);
  if (!flow) {
    throw new Error("Flow not found");
  }

  const tasksMap = new Map(tasks.map((t) => [t.id, t.steps]));
  const steps = flattenSteps(flow, tasksMap);

  const tabId =
    explicitTabId ??
    (await new Promise<number>((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(lastError);
          return;
        }
        if (!tabs[0]?.id) {
          reject(new Error("No active tab found"));
          return;
        }
        resolve(tabs[0].id);
      });
    }));

  const flowLog = createFlowLog(flow, triggeredBy);

  for (const step of steps) {
    try {
      const result = await sendStepToTab(tabId, step);
      if (result.success) {
        await addStepLog(flowLog, step, "success");
      } else {
        await addStepLog(flowLog, step, "failed", result.errorMessage);
        await finalizeFlowLog(flowLog, "failed");
        return;
      }
    } catch (error) {
      await addStepLog(flowLog, step, "failed", (error as Error).message);
      await finalizeFlowLog(flowLog, "failed");
      return;
    }
  }

  await finalizeFlowLog(flowLog, "success");
}


