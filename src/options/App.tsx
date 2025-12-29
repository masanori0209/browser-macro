import React, { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Flow, FlowRunLog, LlmSettings, Step, Task, Trigger } from "../shared/models";
import { MessageType, type BackgroundRequestMessage, type BackgroundResponse, type ImportExportPayload } from "../shared/messageTypes";
import { randomId } from "../shared/utils";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
type TabKey = "flows" | "triggers" | "settings";
type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

async function sendMessage<T extends BackgroundResponse>(message: BackgroundRequestMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(lastError);
        return;
      }
      resolve(response);
    });
  });
}

function safeParseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

const SHORTCUT_COMMANDS = ["flowmacro-run-1", "flowmacro-run-2"];

const palette = {
  bg: "#f5f7fb",
  card: "#ffffff",
  border: "#e5e7eb",
  text: "#111827",
  subtext: "#6b7280",
  primary: "#2563eb",
  primarySoft: "#eff4ff",
  accent: "#10b981",
  danger: "#ef4444"
};

const shadowCard = "0 10px 30px rgba(15, 23, 42, 0.08)";

const sectionStyle: CSSProperties = {
  marginBottom: 18,
  padding: 14,
  borderRadius: 14,
  border: `1px solid ${palette.border}`,
  background: palette.card,
  boxShadow: shadowCard
};

const labelStyle: CSSProperties = { fontSize: 12, color: palette.subtext, display: "flex", flexDirection: "column", gap: 4 };
const inputStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${palette.border}`,
  background: "#fff",
  fontSize: 13,
  outline: "none",
  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.03)"
};

const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 96, resize: "vertical" };

const buttonBase: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid transparent",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  transition: "all 0.15s ease",
  boxShadow: "0 2px 10px rgba(0,0,0,0.05)"
};

const buttonKinds: Record<ButtonKind, CSSProperties> = {
  primary: { background: palette.primary, color: "#fff", borderColor: palette.primary },
  secondary: { background: palette.primarySoft, color: palette.text, borderColor: palette.primary },
  ghost: { background: "#fff", color: palette.text, borderColor: palette.border },
  danger: { background: palette.danger, color: "#fff", borderColor: palette.danger }
};

const buttonStyle = (kind: ButtonKind = "primary"): CSSProperties => ({ ...buttonBase, ...buttonKinds[kind] });

const pillStyle = (enabled: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 10px",
  borderRadius: 999,
  background: enabled ? "#ecfdf3" : "#f3f4f6",
  color: enabled ? "#166534" : palette.subtext,
  border: `1px solid ${enabled ? "#bbf7d0" : palette.border}`,
  fontSize: 12,
  fontWeight: 600
});

const layoutStyle: CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "24px 20px",
  display: "flex",
  flexDirection: "column",
  gap: 16
};

const heroStyle: CSSProperties = {
  padding: "18px 20px",
  borderRadius: 16,
  background: "linear-gradient(135deg, #eef2ff 0%, #e0f2fe 50%, #f7fee7 100%)",
  border: `1px solid ${palette.border}`,
  boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12
};

const navCardStyle: CSSProperties = {
  ...sectionStyle,
  padding: 12,
  position: "sticky",
  top: 12,
  display: "flex",
  flexDirection: "column",
  gap: 8
};

const navButtonStyle = (active: boolean): CSSProperties => ({
  ...buttonStyle(active ? "primary" : "ghost"),
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 10,
  justifyContent: "flex-start",
  textAlign: "left",
  boxShadow: active ? shadowCard : "0 1px 3px rgba(0,0,0,0.06)",
  background: active ? palette.primary : "#fff",
  color: active ? "#fff" : palette.text
});

const stack: CSSProperties = { display: "flex", flexDirection: "column", gap: 14 };
const modalOverlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.25)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 10000,
  padding: 12
};

const modalCard: CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  width: "min(720px, 95vw)",
  maxHeight: "85vh",
  overflow: "auto",
  boxShadow: "0 18px 36px rgba(15,23,42,0.18)",
  border: `1px solid ${palette.border}`,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 10
};

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [logs, setLogs] = useState<FlowRunLog[]>([]);
  const [llmSettings, setLlmSettings] = useState<LlmSettings>({
    enabled: false,
    provider: "openai",
    apiKey: "",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini"
  });
  const [conversationStates, setConversationStates] = useState<Array<{ conversationId: string; history: Array<{ role: "user" | "assistant"; content: string }>; tabId: number; isActive: boolean }>>([]);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newTask, setNewTask] = useState({ name: "", description: "", stepsJson: "[]" });
  const [newFlow, setNewFlow] = useState({ name: "", description: "", taskIds: [] as string[], autoRunUrlPatterns: "", enabled: true });
  const [newTrigger, setNewTrigger] = useState<Trigger>({
    id: "",
    type: "url",
    flowId: "",
    urlPattern: "",
    shortcutName: "",
    enabled: true
  });
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [activeTab, setActiveTab] = useState<TabKey>("flows");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingTaskFields, setEditingTaskFields] = useState<{ name: string; description: string; stepsJson: string }>({
    name: "",
    description: "",
    stepsJson: "[]"
  });

  const tabs: { key: TabKey; label: string; helper: string }[] = [
    { key: "flows", label: "フロー・タスク", helper: "フローとタスク、インポート / エクスポート" },
    { key: "triggers", label: "トリガー", helper: "トリガー設定と一覧" },
    { key: "settings", label: "設定", helper: "LLM / 実行ログ" }
  ];
  const tabIcons: Record<TabKey, string> = {
    flows: "account_tree",
    triggers: "bolt",
    settings: "tune"
  };

  const load = async () => {
    try {
      const [taskRes, flowRes, logRes, triggerRes, llmRes, convRes] = await Promise.all([
        sendMessage<{ type: "tasks"; tasks: Task[] }>({ type: MessageType.GetTasks }),
        sendMessage<{ type: "flows"; flows: Flow[] }>({ type: MessageType.GetFlows }),
        sendMessage<{ type: "logs"; logs: FlowRunLog[] }>({ type: MessageType.GetLogs }),
        sendMessage<{ type: "triggers"; triggers: Trigger[] }>({ type: MessageType.GetTriggers }),
        sendMessage<{ type: "llmSettings"; settings: LlmSettings | null }>({ type: MessageType.GetLlmSettings }),
        sendMessage<{ type: "conversationStates"; states: Array<{ conversationId: string; history: Array<{ role: "user" | "assistant"; content: string }>; tabId: number; isActive: boolean }> }>({ type: MessageType.GetConversationStates })
      ]);
      setTasks(taskRes.tasks);
      setFlows(flowRes.flows);
      setLogs(logRes.logs);
      setTriggers(triggerRes.triggers);
      setLlmSettings(
        llmRes.settings ?? {
          enabled: false,
          provider: "openai",
          apiKey: "",
          endpoint: "https://api.openai.com/v1/chat/completions",
          model: "gpt-4o-mini"
        }
      );
      setConversationStates(convRes.states);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const withFeedback = async <T,>(fn: () => Promise<T>): Promise<Result<T>> => {
    try {
      const data = await fn();
      await load();
      setInfo("保存しました");
      setError(null);
      return { ok: true, data };
    } catch (err) {
      setError((err as Error).message);
      return { ok: false, message: (err as Error).message };
    }
  };

  const handleAddTask = async () => {
    const steps = safeParseJson(newTask.stepsJson, []);
    const task: Task = {
      id: randomId("task"),
      name: newTask.name || "新規タスク",
      description: newTask.description,
      steps,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await withFeedback(() => sendMessage({ type: MessageType.SaveTask, task }));
    setNewTask({ name: "", description: "", stepsJson: "[]" });
  };

  const handleDeleteTask = async (taskId: string) => {
    await withFeedback(() => sendMessage({ type: MessageType.DeleteTask, taskId }));
  };

  const openEditTask = (task: Task) => {
    setEditingTask(task);
    setEditingTaskFields({
      name: task.name,
      description: task.description ?? "",
      stepsJson: JSON.stringify(task.steps, null, 2)
    });
  };

  const handleUpdateTask = async () => {
    if (!editingTask) return;
    const parsed = safeParseJson<Step[] | null>(editingTaskFields.stepsJson, null);
    if (!parsed || !Array.isArray(parsed)) {
      setError("ステップJSONが不正です");
      return;
    }
    const updated: Task = {
      ...editingTask,
      name: editingTaskFields.name.trim() || "無題タスク",
      description: editingTaskFields.description.trim() || undefined,
      steps: parsed,
      updatedAt: new Date().toISOString()
    };
    await withFeedback(() => sendMessage({ type: MessageType.SaveTask, task: updated }));
    setEditingTask(null);
  };

  const handleSaveFlow = async (flow: Flow) => {
    await withFeedback(() => sendMessage({ type: MessageType.SaveFlow, flow }));
  };

  const handleAddFlow = async () => {
    const autoRunUrlPatterns = newFlow.autoRunUrlPatterns
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const flow: Flow = {
      id: randomId("flow"),
      name: newFlow.name || "新規フロー",
      description: newFlow.description,
      taskIds: newFlow.taskIds,
      autoRunUrlPatterns,
      enabled: newFlow.enabled,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await handleSaveFlow(flow);
    setNewFlow({ name: "", description: "", taskIds: [], autoRunUrlPatterns: "", enabled: true });
  };

  const handleDeleteFlow = async (flowId: string) => {
    await withFeedback(() => sendMessage({ type: MessageType.DeleteFlow, flowId }));
  };

  const moveTaskInFlow = async (flow: Flow, taskId: string, direction: -1 | 1) => {
    const idx = flow.taskIds.indexOf(taskId);
    if (idx === -1) return;
    const nextIndex = idx + direction;
    if (nextIndex < 0 || nextIndex >= flow.taskIds.length) return;
    const nextTaskIds = [...flow.taskIds];
    const [removed] = nextTaskIds.splice(idx, 1);
    nextTaskIds.splice(nextIndex, 0, removed);
    await handleSaveFlow({ ...flow, taskIds: nextTaskIds, updatedAt: new Date().toISOString() });
  };

  const handleToggleFlow = async (flow: Flow) => {
    await handleSaveFlow({ ...flow, enabled: !flow.enabled, updatedAt: new Date().toISOString() });
  };

  const handleAddTrigger = async () => {
    const trigger: Trigger = {
      ...newTrigger,
      id: newTrigger.id || randomId("trigger")
    };
    await withFeedback(() => sendMessage({ type: MessageType.SaveTrigger, trigger }));
    setNewTrigger({ id: "", type: "url", flowId: "", urlPattern: "", shortcutName: "", enabled: true });
  };

  const handleDeleteTrigger = async (triggerId: string) => {
    await withFeedback(() => sendMessage({ type: MessageType.DeleteTrigger, triggerId }));
  };

  const handleExport = async () => {
    const res = await sendMessage<{ type: "export"; data: ImportExportPayload }>({ type: MessageType.ExportData });
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flowmacro-export.json";
    a.click();
    URL.revokeObjectURL(url);
    setInfo("エクスポート完了");
  };

  const handleImport = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    const payload = safeParseJson<ImportExportPayload>(text, { version: 1, tasks: [], flows: [], triggers: [] });
    await withFeedback(() => sendMessage({ type: MessageType.ImportData, payload, mode: importMode }));
  };

  const handleSaveLlm = async () => {
    await withFeedback(() => sendMessage({ type: MessageType.SaveLlmSettings, settings: llmSettings }));
  };

  return (
    <div
      style={{
        background: palette.bg,
        minHeight: "100vh",
        fontFamily: "'M PLUS Rounded 1c', Inter, 'Noto Sans JP', system-ui, -apple-system, sans-serif",
        color: palette.text
      }}
    >
      <div style={layoutStyle}>
        <header style={heroStyle}>
          <div>
            <h1 style={{ fontSize: 20, margin: 0 }}>FlowMacro 管理</h1>
            <div style={{ fontSize: 13, color: palette.subtext }}>左のメニューからフロー/タスク、トリガー、設定を選んで操作してください。</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={buttonStyle("ghost")} onClick={handleExport}>
              <span className="material-icons-outlined" style={{ fontSize: 18 }}>
                cloud_download
              </span>
              バックアップ（エクスポート）
            </button>
            <label>
              <span style={{ ...buttonStyle("secondary"), display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <span className="material-icons-outlined" style={{ fontSize: 18 }}>
                  upload_file
                </span>
                インポート
              </span>
              <input style={{ display: "none" }} type="file" accept="application/json" onChange={(e) => handleImport(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, alignItems: "start" }}>
          <aside style={navCardStyle}>
            {tabs.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={navButtonStyle(active)}>
                  <span className="material-icons-outlined" style={{ fontSize: 18 }}>
                    {tabIcons[tab.key]}
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
                    <div style={{ fontWeight: 700 }}>{tab.label}</div>
                    <div style={{ fontSize: 12, opacity: 0.9 }}>{tab.helper}</div>
                  </div>
                </button>
              );
            })}
            <div style={{ fontSize: 11, color: palette.subtext, marginTop: 4 }}>設定は即時反映されます。</div>
          </aside>

          <main style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {info && <div style={{ color: "#0f5132", background: "#d1e7dd", border: "1px solid #badbcc", padding: "8px 10px", borderRadius: 10 }}>{info}</div>}
            {error && <div style={{ color: "#842029", background: "#f8d7da", border: "1px solid #f5c2c7", padding: "8px 10px", borderRadius: 10 }}>{error}</div>}

            {activeTab === "flows" && (
              <div style={stack}>
                <section style={sectionStyle}>
                  <h2 style={{ fontSize: 16, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="material-icons-outlined" style={{ fontSize: 18 }}>
                      checklist
                    </span>
                    タスク一覧・作成
                  </h2>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "flex-start" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <input style={inputStyle} placeholder="タスク名" value={newTask.name} onChange={(e) => setNewTask((v) => ({ ...v, name: e.target.value }))} />
                      <input style={inputStyle} placeholder="説明" value={newTask.description} onChange={(e) => setNewTask((v) => ({ ...v, description: e.target.value }))} />
          <textarea
                          style={textareaStyle}
                          placeholder='steps JSON (例 [{"id":"s1","type":"click","selector":{"css":"button"},"waitMs":800}])'
            value={newTask.stepsJson}
            onChange={(e) => setNewTask((v) => ({ ...v, stepsJson: e.target.value }))}
          />
                      <button style={buttonStyle("primary")} onClick={handleAddTask}>
                        タスク追加
                      </button>
        </div>
                    <div>
                      {tasks.length === 0 && <div style={{ color: palette.subtext }}>タスクがありません</div>}
                      <ul style={{ paddingLeft: 0, marginTop: 4, display: "flex", flexDirection: "column", gap: 8, listStyle: "none" }}>
          {tasks.map((t) => (
                          <li
                            key={t.id}
                            style={{
                              padding: "10px 12px",
                              border: `1px solid ${palette.border}`,
                              borderRadius: 12,
                              background: "#fff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600 }}>{t.name}</div>
                              <div style={{ fontSize: 12, color: palette.subtext }}>ステップ {t.steps.length} 件</div>
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button style={buttonStyle("secondary")} onClick={() => openEditTask(t)}>
                                編集
                              </button>
                              <button style={buttonStyle("ghost")} onClick={() => handleDeleteTask(t.id)}>
                                削除
                              </button>
                            </div>
            </li>
          ))}
        </ul>
                    </div>
                  </div>
      </section>

                <section style={sectionStyle}>
                  <h2 style={{ fontSize: 16, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="material-icons-outlined" style={{ fontSize: 18 }}>
                      route
                    </span>
                    フロー設定・並べ替え
                  </h2>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "flex-start" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <input style={inputStyle} placeholder="フロー名" value={newFlow.name} onChange={(e) => setNewFlow((v) => ({ ...v, name: e.target.value }))} />
                      <input style={inputStyle} placeholder="説明" value={newFlow.description} onChange={(e) => setNewFlow((v) => ({ ...v, description: e.target.value }))} />
                      <label style={labelStyle}>
            タスク選択（Ctrl/Cmdで複数）
            <select
              multiple
              value={newFlow.taskIds}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                setNewFlow((v) => ({ ...v, taskIds: selected }));
              }}
                          style={{ ...inputStyle, minHeight: 100 }}
            >
              {tasks.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <input
                        style={inputStyle}
            placeholder="URL自動実行パターン（カンマ区切り、正規表現可）"
            value={newFlow.autoRunUrlPatterns}
            onChange={(e) => setNewFlow((v) => ({ ...v, autoRunUrlPatterns: e.target.value }))}
          />
                      <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={newFlow.enabled} onChange={(e) => setNewFlow((v) => ({ ...v, enabled: e.target.checked }))} /> 有効化
          </label>
                      <button style={buttonStyle("primary")} onClick={handleAddFlow}>
                        フロー追加
                      </button>
        </div>
                    <div>
                      {flows.length === 0 && <div style={{ color: palette.subtext }}>フローがありません</div>}
                      <ul style={{ paddingLeft: 0, marginTop: 4, display: "flex", flexDirection: "column", gap: 10, listStyle: "none" }}>
          {flows.map((f) => (
                          <li
                            key={f.id}
                            style={{
                              padding: "12px 14px",
                              border: `1px solid ${palette.border}`,
                              borderRadius: 12,
                              background: "#fff",
                              boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
                              display: "flex",
                              flexDirection: "column",
                              gap: 6
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <strong style={{ fontSize: 14 }}>{f.name}</strong>
                              <span style={pillStyle(f.enabled)}>{f.enabled ? "有効" : "無効"}</span>
                              <button style={buttonStyle("secondary")} onClick={() => handleToggleFlow(f)}>
                                有効/無効切替
                              </button>
                              <button style={buttonStyle("ghost")} onClick={() => handleDeleteFlow(f.id)}>
                                削除
                              </button>
              </div>
                            <div style={{ fontSize: 12, color: palette.subtext }}>
                タスク順:
                {f.taskIds.map((tid) => (
                                <span key={tid} style={{ marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {tasks.find((t) => t.id === tid)?.name ?? tid}
                                  <button style={buttonStyle("ghost")} onClick={() => moveTaskInFlow(f, tid, -1)}>
                      ↑
                    </button>
                                  <button style={buttonStyle("ghost")} onClick={() => moveTaskInFlow(f, tid, 1)}>
                      ↓
                    </button>
                  </span>
                ))}
              </div>
                            {f.autoRunUrlPatterns && <div style={{ fontSize: 12, color: palette.subtext }}>URL自動実行: {f.autoRunUrlPatterns.join(", ")}</div>}
            </li>
          ))}
        </ul>
                    </div>
                  </div>
      </section>

                <section style={sectionStyle}>
                  <h2 style={{ fontSize: 16, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="material-icons-outlined" style={{ fontSize: 18 }}>
                      sync_alt
                    </span>
                    インポート / エクスポート
                  </h2>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                    <button style={buttonStyle("secondary")} onClick={handleExport}>
                      エクスポート
                    </button>
                    <input style={inputStyle} type="file" accept="application/json" onChange={(e) => handleImport(e.target.files?.[0] ?? null)} />
                    <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <input type="radio" name="importMode" value="merge" checked={importMode === "merge"} onChange={() => setImportMode("merge")} /> マージ
                    </label>
                    <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <input type="radio" name="importMode" value="replace" checked={importMode === "replace"} onChange={() => setImportMode("replace")} /> 置き換え
                    </label>
                  </div>
                </section>
              </div>
            )}

            {activeTab === "triggers" && (
              <div style={stack}>
                <section style={sectionStyle}>
              <h2 style={{ fontSize: 16, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <span className="material-icons-outlined" style={{ fontSize: 18 }}>
                  flash_on
                </span>
                トリガー設定
              </h2>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "flex-start" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <label style={labelStyle}>
                        種別
                        <select style={inputStyle} value={newTrigger.type} onChange={(e) => setNewTrigger((v) => ({ ...v, type: e.target.value as Trigger["type"] }))}>
              <option value="url">URLマッチ</option>
              <option value="shortcut">ショートカット</option>
            </select>
          </label>
                      <label style={labelStyle}>
            対象フロー
                        <select style={inputStyle} value={newTrigger.flowId} onChange={(e) => setNewTrigger((v) => ({ ...v, flowId: e.target.value }))}>
              <option value="">選択してください</option>
              {flows.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          {newTrigger.type === "url" && (
            <input
                          style={inputStyle}
              placeholder="URLパターン（正規表現可）"
              value={newTrigger.urlPattern}
              onChange={(e) => setNewTrigger((v) => ({ ...v, urlPattern: e.target.value }))}
            />
          )}
          {newTrigger.type === "shortcut" && (
            <select
                          style={inputStyle}
              value={newTrigger.shortcutName}
              onChange={(e) => setNewTrigger((v) => ({ ...v, shortcutName: e.target.value }))}
            >
              <option value="">ショートカットを選択</option>
              {SHORTCUT_COMMANDS.map((c) => (
                <option value={c} key={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
                      <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={newTrigger.enabled} onChange={(e) => setNewTrigger((v) => ({ ...v, enabled: e.target.checked }))} /> 有効化
          </label>
                      <button style={buttonStyle("primary")} onClick={handleAddTrigger}>
                        トリガー追加
                      </button>
        </div>
                    <div>
                      {triggers.length === 0 && <div style={{ color: palette.subtext }}>トリガーがありません</div>}
                      <ul style={{ paddingLeft: 0, marginTop: 4, display: "flex", flexDirection: "column", gap: 8, listStyle: "none" }}>
          {triggers.map((t) => (
                          <li
                            key={t.id}
                            style={{
                              padding: "10px 12px",
                              border: `1px solid ${palette.border}`,
                              borderRadius: 12,
                              background: "#fff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8
                            }}
                          >
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <div style={{ fontWeight: 600 }}>
                                [{t.type}] {flows.find((f) => f.id === t.flowId)?.name ?? t.flowId}
                              </div>
                              <div style={{ fontSize: 12, color: palette.subtext }}>{t.type === "url" ? t.urlPattern : t.shortcutName}</div>
                              <span style={pillStyle(t.enabled)}>{t.enabled ? "有効" : "無効"}</span>
                            </div>
                            <button style={buttonStyle("ghost")} onClick={() => handleDeleteTrigger(t.id)}>
                削除
              </button>
            </li>
          ))}
        </ul>
                      <div style={{ fontSize: 12, marginTop: 6, color: palette.subtext }}>
          ※ ショートカットは manifest の command 名（flowmacro-run-1 / flowmacro-run-2）に一致させてください。ブラウザ側ショートカット設定も必要です。
        </div>
                    </div>
        </div>
      </section>
              </div>
            )}

            {activeTab === "settings" && (
              <div style={stack}>
                <section style={sectionStyle}>
                  <h2 style={{ fontSize: 16, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="material-icons-outlined" style={{ fontSize: 18 }}>
                      psychology
                    </span>
                    LLM 設定
                  </h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 520 }}>
                    <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={llmSettings.enabled} onChange={(e) => setLlmSettings((v) => ({ ...v, enabled: e.target.checked }))} /> 有効化
          </label>
                    <label style={labelStyle}>
            プロバイダ
                      <select style={inputStyle} value={llmSettings.provider} onChange={(e) => setLlmSettings((v) => ({ ...v, provider: e.target.value as LlmSettings["provider"] }))}>
              <option value="openai">OpenAI 互換</option>
              <option value="custom">カスタム</option>
            </select>
          </label>
                    <input style={inputStyle} placeholder="API Key" value={llmSettings.apiKey || ""} onChange={(e) => setLlmSettings((v) => ({ ...v, apiKey: e.target.value }))} />
                    <input style={inputStyle} placeholder="エンドポイント" value={llmSettings.endpoint || ""} onChange={(e) => setLlmSettings((v) => ({ ...v, endpoint: e.target.value }))} />
                    <input style={inputStyle} placeholder="モデル" value={llmSettings.model || ""} onChange={(e) => setLlmSettings((v) => ({ ...v, model: e.target.value }))} />
                    <button style={buttonStyle("primary")} onClick={handleSaveLlm}>
                      LLM設定を保存
                    </button>
                    <div style={{ fontSize: 12, color: palette.subtext }}>
            ※ APIキーは chrome.storage.local に平文保存されます。ブラウザ拡張の仕様上、完全な秘匿はできません。
          </div>
        </div>
      </section>

                <section style={{ ...sectionStyle, marginBottom: 12 }}>
                  <h2 style={{ fontSize: 16, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="material-icons-outlined" style={{ fontSize: 18 }}>
                      article
                    </span>
                    実行ログ（最新20件）
                  </h2>
                  {logs.length === 0 && <div style={{ color: palette.subtext }}>ログがありません</div>}
                  <ul style={{ paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {logs.slice(-20).map((log) => (
                      <li
                        key={log.id}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: `1px solid ${palette.border}`,
                          background: "#fff",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          fontSize: 13
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>{log.flowName ?? log.flowId}</div>
                          <div style={{ fontSize: 12, color: palette.subtext }}>{log.startedAt}</div>
                        </div>
                        <span style={pillStyle(log.status === "success")}>{log.status}</span>
            </li>
          ))}
        </ul>
      </section>
              </div>
            )}
          </main>
        </div>
      </div>
      {editingTask && (
        <div style={modalOverlay} onClick={() => setEditingTask(null)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="material-icons-outlined" style={{ fontSize: 20 }}>
                  edit_note
                </span>
                <div>
                  <div style={{ fontWeight: 700 }}>タスクを編集</div>
                  <div style={{ fontSize: 12, color: palette.subtext }}>ステップJSONを直接編集できます</div>
                </div>
              </div>
              <button style={buttonStyle("ghost")} onClick={() => setEditingTask(null)}>
                閉じる
              </button>
            </div>

            <label style={labelStyle}>
              タスク名
              <input style={inputStyle} value={editingTaskFields.name} onChange={(e) => setEditingTaskFields((v) => ({ ...v, name: e.target.value }))} />
            </label>
            <label style={labelStyle}>
              説明
              <input style={inputStyle} value={editingTaskFields.description} onChange={(e) => setEditingTaskFields((v) => ({ ...v, description: e.target.value }))} />
            </label>
            <label style={labelStyle}>
              ステップ（JSON）
              <textarea
                style={{ ...textareaStyle, minHeight: 260 }}
                value={editingTaskFields.stepsJson}
                onChange={(e) => setEditingTaskFields((v) => ({ ...v, stepsJson: e.target.value }))}
              />
            </label>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={buttonStyle("ghost")} onClick={() => setEditingTask(null)}>
                キャンセル
              </button>
              <button style={buttonStyle("primary")} onClick={handleUpdateTask}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
