import { describe, expect, it } from "vitest";
import { exportData, getTasks, importData, saveTask } from "../src/background/storage";
import type { Task } from "../src/shared/models";

const sampleTask = (id: string): Task => ({
  id,
  name: `task-${id}`,
  description: "",
  steps: [],
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z"
});

describe("storage import/export", () => {
  it("エクスポートが現在のタスクを含む", async () => {
    await saveTask(sampleTask("a"));
    const exp = await exportData();
    expect(exp.tasks.map((t) => t.id)).toContain("a");
  });

  it("インポート merge は既存と統合する", async () => {
    await saveTask(sampleTask("base"));
    await importData({ version: 1, tasks: [sampleTask("merge")], flows: [], triggers: [] }, "merge");
    const tasks = await getTasks();
    expect(tasks.some((t) => t.id === "base")).toBe(true);
    expect(tasks.some((t) => t.id === "merge")).toBe(true);
  });

  it("インポート replace は置き換える", async () => {
    await saveTask(sampleTask("old"));
    await importData({ version: 1, tasks: [sampleTask("new")], flows: [], triggers: [] }, "replace");
    const tasks = await getTasks();
    expect(tasks.some((t) => t.id === "old")).toBe(false);
    expect(tasks.some((t) => t.id === "new")).toBe(true);
  });
});

