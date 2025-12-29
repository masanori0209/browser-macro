import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveFlow, saveTask, saveTrigger, getLogs } from "../src/background/storage";
import type { Flow, Step, Task, Trigger } from "../src/shared/models";

const step: Step = { id: "s", type: "click", selector: { css: "#btn" } };
const task: Task = {
  id: "t",
  name: "task",
  description: "",
  steps: [step],
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z"
};
const flow: Flow = {
  id: "f",
  name: "flow",
  description: "",
  taskIds: [task.id],
  autoRunUrlPatterns: [],
  enabled: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z"
};

async function prepare(trigger: Trigger) {
  await saveTask(task);
  await saveFlow(flow);
  await saveTrigger(trigger);
  await vi.importActual("../src/background/index"); // register listeners
}

beforeEach(() => {
  vi.resetModules();
});

describe("URL trigger auto-run", () => {
  it("URL パターン一致でフローが走りログが success になる", async () => {
    await prepare({
      id: "trg-url",
      type: "url",
      flowId: flow.id,
      urlPattern: "example.com",
      enabled: true
    });
    const chromeMock = (globalThis as any).chrome;
    chromeMock.__emitTabUpdated(1, { status: "complete" }, { url: "https://example.com/" });
    await new Promise((r) => setTimeout(r, 0));
    const logs = await getLogs();
    expect(logs.at(-1)?.status).toBe("success");
    expect(logs.at(-1)?.triggeredBy).toBe("url");
  });
});

describe("shortcut trigger", () => {
  it("コマンド一致でフローが走る", async () => {
    await prepare({
      id: "trg-shortcut",
      type: "shortcut",
      flowId: flow.id,
      shortcutName: "flowmacro-run-1",
      enabled: true
    });
    const chromeMock = (globalThis as any).chrome;
    chromeMock.__emitCommand("flowmacro-run-1");
    await new Promise((r) => setTimeout(r, 0));
    const logs = await getLogs();
    expect(logs.at(-1)?.triggeredBy).toBe("shortcut");
  });
});

