import type { Flow, FlowRunLog, LlmSettings, Step, Task, Trigger } from "../shared/models";
import type { ImportExportPayload } from "../shared/messageTypes";

export interface RecordingBuffer {
  tabId: number;
  sessionId: string;
  steps: Step[];
  startedAt: string;
}

export interface ConversationState {
  conversationId: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  tabId: number;
  isActive: boolean;
}

type StoragePayload = {
  tasks: Task[];
  flows: Flow[];
  logs: FlowRunLog[];
  triggers: Trigger[];
  llmSettings: LlmSettings | null;
  recordingBuffers: RecordingBuffer[];
  conversationStates: ConversationState[];
};

const STORAGE_KEYS = {
  tasks: "tasks",
  flows: "flows",
  logs: "logs",
  triggers: "triggers",
  llmSettings: "llmSettings",
  recordingBuffers: "recordingBuffers",
  conversationStates: "conversationStates"
} as const;

function getFromStorage<T extends keyof StoragePayload>(key: T, fallback: StoragePayload[T]): Promise<StoragePayload[T]> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], (result) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(lastError);
        return;
      }
      const value = (result[key] as StoragePayload[T]) ?? fallback;
      resolve(value);
    });
  });
}

function setToStorage<T extends keyof StoragePayload>(key: T, value: StoragePayload[T]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(lastError);
        return;
      }
      resolve();
    });
  });
}

export async function getTasks(): Promise<Task[]> {
  return getFromStorage("tasks", []);
}

export async function saveTask(task: Task): Promise<void> {
  const tasks = await getTasks();
  const idx = tasks.findIndex((t) => t.id === task.id);
  if (idx >= 0) {
    tasks[idx] = task;
  } else {
    tasks.push(task);
  }
  await setToStorage("tasks", tasks);
}

export async function deleteTask(taskId: string): Promise<void> {
  const tasks = await getTasks();
  await setToStorage(
    "tasks",
    tasks.filter((t) => t.id !== taskId)
  );
}

export async function getFlows(): Promise<Flow[]> {
  return getFromStorage("flows", []);
}

export async function saveFlow(flow: Flow): Promise<void> {
  const flows = await getFlows();
  const idx = flows.findIndex((f) => f.id === flow.id);
  if (idx >= 0) {
    flows[idx] = flow;
  } else {
    flows.push(flow);
  }
  await setToStorage("flows", flows);
}

export async function deleteFlow(flowId: string): Promise<void> {
  const flows = await getFlows();
  await setToStorage(
    "flows",
    flows.filter((f) => f.id !== flowId)
  );
}

export async function getLogs(): Promise<FlowRunLog[]> {
  return getFromStorage("logs", []);
}

export async function upsertLog(log: FlowRunLog): Promise<void> {
  const logs = await getLogs();
  const idx = logs.findIndex((l) => l.id === log.id);
  if (idx >= 0) {
    logs[idx] = log;
  } else {
    logs.push(log);
  }
  await setToStorage("logs", logs);
}

export async function getTriggers(): Promise<Trigger[]> {
  return getFromStorage("triggers", []);
}

export async function saveTrigger(trigger: Trigger): Promise<void> {
  const triggers = await getTriggers();
  const idx = triggers.findIndex((t) => t.id === trigger.id);
  if (idx >= 0) {
    triggers[idx] = trigger;
  } else {
    triggers.push(trigger);
  }
  await setToStorage("triggers", triggers);
}

export async function deleteTrigger(triggerId: string): Promise<void> {
  const triggers = await getTriggers();
  const next = triggers.filter((t) => t.id !== triggerId);
  await setToStorage("triggers", next);
}

export async function getLlmSettings(): Promise<LlmSettings | null> {
  const value = await getFromStorage("llmSettings", null);
  return value;
}

export async function saveLlmSettings(settings: LlmSettings): Promise<void> {
  await setToStorage("llmSettings", settings);
}

export async function getRecordingBuffer(tabId: number): Promise<RecordingBuffer | undefined> {
  const buffers = await getFromStorage("recordingBuffers", []);
  return buffers.find((b) => b.tabId === tabId);
}

export async function getRecordingBuffers(): Promise<RecordingBuffer[]> {
  return getFromStorage("recordingBuffers", []);
}

export async function getConversationStates(): Promise<ConversationState[]> {
  return getFromStorage("conversationStates", []);
}

export async function saveConversationState(state: ConversationState): Promise<void> {
  const states = await getConversationStates();
  const index = states.findIndex((s) => s.conversationId === state.conversationId);
  if (index >= 0) {
    states[index] = state;
  } else {
    states.push(state);
  }
  await setToStorage("conversationStates", states);
}

export async function deleteConversationState(conversationId: string): Promise<void> {
  const states = await getConversationStates();
  const filtered = states.filter((s) => s.conversationId !== conversationId);
  await setToStorage("conversationStates", filtered);
}

export async function upsertRecordingBuffer(buffer: RecordingBuffer): Promise<void> {
  const buffers = await getFromStorage("recordingBuffers", []);
  const idx = buffers.findIndex((b) => b.tabId === buffer.tabId);
  if (idx >= 0) {
    buffers[idx] = buffer;
  } else {
    buffers.push(buffer);
  }
  await setToStorage("recordingBuffers", buffers);
}

export async function removeRecordingBuffer(tabId: number): Promise<void> {
  const buffers = await getFromStorage("recordingBuffers", []);
  const next = buffers.filter((b) => b.tabId !== tabId);
  await setToStorage("recordingBuffers", next);
}

function mergeById<T extends { id: string }>(base: T[], incoming: T[]): T[] {
  const map = new Map(base.map((item) => [item.id, item]));
  for (const item of incoming) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
}

export async function exportData(): Promise<ImportExportPayload> {
  const [tasks, flows, triggers] = await Promise.all([getTasks(), getFlows(), getTriggers()]);
  return { version: 1, tasks, flows, triggers };
}

export async function importData(payload: ImportExportPayload, mode: "merge" | "replace" = "merge"): Promise<void> {
  if (mode === "replace") {
    await Promise.all([
      setToStorage("tasks", payload.tasks ?? []),
      setToStorage("flows", payload.flows ?? []),
      setToStorage("triggers", payload.triggers ?? [])
    ]);
    return;
  }
  const [tasks, flows, triggers] = await Promise.all([getTasks(), getFlows(), getTriggers()]);
  await Promise.all([
    setToStorage("tasks", mergeById(tasks, payload.tasks ?? [])),
    setToStorage("flows", mergeById(flows, payload.flows ?? [])),
    setToStorage("triggers", mergeById(triggers, payload.triggers ?? []))
  ]);
}


