import { describe, expect, it, vi } from "vitest";
import { runFlow } from "../src/background/runner";
import { getLogs, saveFlow, saveTask } from "../src/background/storage";
import type { Flow, Step, Task } from "../src/shared/models";

const clickStep: Step = {
  id: "s1",
  type: "click",
  selector: { css: "#btn" }
};

const task: Task = {
  id: "t1",
  name: "task1",
  description: "",
  steps: [clickStep],
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z"
};

const flow: Flow = {
  id: "f1",
  name: "flow1",
  description: "",
  taskIds: [task.id],
  autoRunUrlPatterns: [],
  enabled: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z"
};

describe("runFlow", () => {
  it("ステップが成功するとログが success になる", async () => {
    await saveTask(task);
    await saveFlow(flow);
    await runFlow(flow.id);
    const logs = await getLogs();
    expect(logs.at(-1)?.status).toBe("success");
    expect(logs.at(-1)?.stepLogs[0].status).toBe("success");
  });

  it("ステップ失敗時に failed で終了する", async () => {
    await saveTask(task);
    await saveFlow(flow);
    const chromeMock = (globalThis as any).chrome;
    chromeMock.tabs.sendMessage.mockImplementation((_tabId: number, payload: any, cb: (resp: any) => void) => {
      cb({ type: "STEP_RESULT", stepId: payload.step.id, success: false, errorMessage: "ng" });
    });
    await runFlow(flow.id);
    const logs = await getLogs();
    expect(logs.at(-1)?.status).toBe("failed");
    expect(logs.at(-1)?.stepLogs[0].status).toBe("failed");
  });
});

