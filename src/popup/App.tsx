import React, { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { Flow, LlmSettings, Step, Task } from "../shared/models";
import { MessageType, type BackgroundRequestMessage, type BackgroundResponse } from "../shared/messageTypes";

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

export default function App() {
  const [recording, setRecording] = useState(false);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const [recordedTask, setRecordedTask] = useState<Task | null>(null);
  const [showRecordedModal, setShowRecordedModal] = useState(false);
  const [editedTaskName, setEditedTaskName] = useState("");
  const [editedTaskDescription, setEditedTaskDescription] = useState("");
  const [llmSettings, setLlmSettings] = useState<LlmSettings | null>(null);
  const [llmPrompt, setLlmPrompt] = useState("");
  const [llmRunning, setLlmRunning] = useState(false);

  const palette = useMemo(
    () => ({
      bg: "#f7f9fb",
      card: "#ffffff",
      border: "#e5e7eb",
      primary: "#2563eb",
      primarySoft: "#e8f0fe",
      text: "#111827",
      subtext: "#6b7280",
      accent: "#10b981"
    }),
    []
  );

  const cardStyle: CSSProperties = {
    background: palette.card,
    border: `1px solid ${palette.border}`,
    borderRadius: 12,
    boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
    padding: 12
  };

  const buttonBase: CSSProperties = {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid transparent",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    transition: "all 0.15s ease",
    display: "inline-flex",
    alignItems: "center",
    gap: 6
  };

  const buttonPrimary: CSSProperties = { ...buttonBase, background: palette.primary, color: "#fff", borderColor: palette.primary };
  const buttonGhost: CSSProperties = { ...buttonBase, background: "#fff", color: palette.text, borderColor: palette.border };
  const pill = (enabled: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    background: enabled ? "#ecfdf3" : "#f3f4f6",
    color: enabled ? "#166534" : palette.subtext,
    border: `1px solid ${enabled ? "#bbf7d0" : palette.border}`,
    fontSize: 11,
    fontWeight: 700
  });

  const modalOverlayStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: 12
  };

  const modalStyle: CSSProperties = {
    background: "#fff",
    borderRadius: 12,
    width: "min(520px, 90vw)",
    boxShadow: "0 16px 40px rgba(0,0,0,0.15)",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    maxHeight: "80vh",
    overflow: "auto",
    fontFamily: "Inter, 'Noto Sans JP', system-ui, -apple-system, sans-serif"
  };

  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    fontSize: 13
  };

  const loadState = async () => {
    const state = await sendMessage<{ type: "state"; recording: boolean }>({ type: MessageType.GetState });
    setRecording(state.recording);
  };

  const loadFlows = async () => {
    const response = await sendMessage<{ type: "flows"; flows: Flow[] }>({ type: MessageType.GetFlows });
    setFlows(response.flows);
  };

  const loadLlmSettings = async () => {
    const response = await sendMessage<{ type: "llmSettings"; settings: LlmSettings | null }>({
      type: MessageType.GetLlmSettings
    });
    setLlmSettings(response.settings);
  };

  useEffect(() => {
    loadState().catch((err) => setInfo(err.message));
    loadFlows().catch((err) => setInfo(err.message));
    loadLlmSettings().catch((err) => setInfo(err.message));
  }, []);

  const startRecording = async () => {
    await sendMessage({ type: MessageType.StartRecording });
    setRecording(true);
    setInfo("録画を開始しました");
  };

  const stopRecording = async () => {
    const res = await sendMessage<{ type: "ok"; data?: { saved?: boolean; task?: Task; reason?: string } }>({
      type: MessageType.StopRecording
    });
    setRecording(false);
    if (res.data?.saved && res.data.task) {
      setRecordedTask(res.data.task);
      setEditedTaskName(res.data.task.name);
      setEditedTaskDescription(res.data.task.description ?? "");
      setShowRecordedModal(true);
      setInfo("録画を停止しタスクを保存しました");
    } else {
      setInfo(res.data?.reason ? `保存されませんでした: ${res.data.reason}` : "保存されませんでした（ステップなし）");
    }
  };

  const runFlow = async (flowId: string) => {
    await sendMessage({ type: MessageType.RunFlow, flowId });
    setInfo("フローを実行しました");
  };

  const saveRecordedTask = async () => {
    if (!recordedTask) return;
    const updated: Task = {
      ...recordedTask,
      name: editedTaskName.trim() || "Recorded Task",
      description: editedTaskDescription.trim() || undefined,
      updatedAt: new Date().toISOString()
    };
    await sendMessage({ type: MessageType.SaveTask, task: updated });
    setRecordedTask(updated);
    setShowRecordedModal(false);
    setInfo("タスクを更新しました。オプションからフローに追加してください。");
  };

  const stepLabel = (step: Step) => {
    const selector = step.selector?.css || step.selector?.xpath || step.selector?.textSnapshot;
    if (step.type === "input") return `${step.type}: ${selector ?? ""} -> ${step.value ?? ""}`;
    return selector ? `${step.type}: ${selector}` : step.type;
  };

  const openOptionsPage = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
      return;
    }
    const optionsUrl = chrome.runtime.getURL("options/index.html");
    chrome.tabs.create({ url: optionsUrl });
  };

  const runLlmPrompt = async () => {
    if (!llmPrompt.trim()) {
      setInfo("プロンプトを入力してください");
      return;
    }
    if (!llmSettings?.enabled || !llmSettings?.apiKey) {
      setInfo("LLM設定が無効です。オプション画面で設定してください。");
      return;
    }
    setLlmRunning(true);
    setInfo("LLMで操作を生成・実行中...");
    try {
      const response = await sendMessage<{ type: "llmTask"; task: Task } | { type: "error"; message: string }>({
        type: MessageType.RunLlmPrompt,
        prompt: llmPrompt,
        taskName: `LLM: ${llmPrompt.slice(0, 30)}`,
        description: `LLM生成: ${llmPrompt}`
      });
      if (response.type === "error") {
        setInfo(`エラー: ${response.message}`);
      } else {
        setRecordedTask(response.task);
        setEditedTaskName(response.task.name);
        setEditedTaskDescription(response.task.description ?? "");
        setShowRecordedModal(true);
        setLlmPrompt("");
        setInfo("LLM操作が完了し、タスクを保存しました");
      }
    } catch (error) {
      setInfo(`エラー: ${(error as Error).message}`);
    } finally {
      setLlmRunning(false);
    }
  };

  return (
    <div
      style={{
        padding: 12,
        minWidth: 320,
        fontFamily: "Inter, 'Noto Sans JP', system-ui, -apple-system, sans-serif",
        background: palette.bg,
        color: palette.text
      }}
    >
      <header style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div>
            <h1 style={{ fontSize: 16, margin: 0 }}>FlowMacro</h1>
            <div style={{ fontSize: 12, color: palette.subtext }}>素早く録画・実行・管理</div>
          </div>
          <button onClick={openOptionsPage} style={{ ...buttonGhost, padding: "8px 10px" }}>
            設定・管理
          </button>
        </div>
      </header>

      <div style={{ ...cardStyle, marginBottom: 10, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={startRecording} disabled={recording} style={{ ...buttonPrimary, opacity: recording ? 0.6 : 1 }}>
            ● 録画開始
          </button>
          <button onClick={stopRecording} disabled={!recording} style={{ ...buttonGhost, background: "#fff7ed", borderColor: "#fdba74", color: "#9a3412", opacity: !recording ? 0.6 : 1 }}>
            ■ 録画停止
          </button>
          <button onClick={openOptionsPage} style={{ ...buttonGhost }}>
            オプションを開く
          </button>
        </div>
        <div style={{ fontSize: 12, color: palette.subtext, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={pill(recording)}>{recording ? "録画中" : "待機中"}</span>
          <span>詳細設定やフロー管理はオプション画面から行えます。</span>
        </div>
      </div>

      {llmSettings?.enabled && llmSettings?.apiKey && (
        <div style={{ ...cardStyle, marginBottom: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: palette.text }}>🤖 LLM自動操作</div>
          <div style={{ fontSize: 11, color: palette.subtext }}>
            プロンプトで操作を指示すると、LLMが自動で実行しながら記録します
          </div>
          <textarea
            style={{
              ...inputStyle,
              minHeight: 60,
              resize: "vertical" as const,
              fontFamily: "inherit"
            }}
            placeholder="例: Googleで「TypeScript」を検索して、最初の結果をクリック"
            value={llmPrompt}
            onChange={(e) => setLlmPrompt(e.target.value)}
            disabled={llmRunning || recording}
          />
          <button
            onClick={runLlmPrompt}
            disabled={llmRunning || recording || !llmPrompt.trim()}
            style={{
              ...buttonPrimary,
              opacity: llmRunning || recording || !llmPrompt.trim() ? 0.6 : 1,
              background: "#10b981",
              borderColor: "#10b981"
            }}
          >
            {llmRunning ? "実行中..." : "🚀 LLMで実行・記録"}
          </button>
        </div>
      )}

      <section style={{ ...cardStyle, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ fontSize: 14, margin: 0 }}>フロー一覧</h2>
          <span style={{ fontSize: 12, color: palette.subtext }}>クリックで即実行</span>
        </div>
        {flows.length === 0 && <div style={{ fontSize: 12, color: palette.subtext }}>フローがありません。オプション画面から作成してください。</div>}
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {flows.map((flow) => (
            <li
              key={flow.id}
              style={{
                border: `1px solid ${palette.border}`,
                borderRadius: 10,
                padding: "10px 12px",
                background: flow.enabled ? "#fff" : palette.primarySoft,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontWeight: 700 }}>{flow.name}</span>
                <span style={{ fontSize: 11, color: palette.subtext }}>{flow.enabled ? "有効" : "無効"}</span>
              </div>
              <button
                onClick={() => runFlow(flow.id)}
                disabled={!flow.enabled}
                style={{ ...buttonPrimary, opacity: flow.enabled ? 1 : 0.5, padding: "8px 10px" }}
              >
                ▶ 実行
              </button>
            </li>
          ))}
        </ul>
      </section>
      {info && <div style={{ fontSize: 12, color: "#444" }}>{info}</div>}

      {showRecordedModal && recordedTask && (
        <div style={modalOverlayStyle} onClick={() => setShowRecordedModal(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>録画結果を保存しました</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>タスク名を編集して保存できます。オプション画面でフローに組み込んでください。</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, color: "#6b7280" }}>タスク名</label>
              <input style={inputStyle} value={editedTaskName} onChange={(e) => setEditedTaskName(e.target.value)} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, color: "#6b7280" }}>説明（任意）</label>
              <textarea
                style={{ ...inputStyle, minHeight: 60, resize: "vertical" as const }}
                value={editedTaskDescription}
                onChange={(e) => setEditedTaskDescription(e.target.value)}
              />
            </div>

            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>記録したステップ（{recordedTask.steps.length}）</div>
            <ol style={{ paddingLeft: 16, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {recordedTask.steps.map((s) => (
                <li key={s.id} style={{ fontSize: 12, color: "#374151" }}>
                  {stepLabel(s)}
                </li>
              ))}
            </ol>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
                onClick={() => setShowRecordedModal(false)}
              >
                閉じる
              </button>
              <button
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", cursor: "pointer" }}
                onClick={saveRecordedTask}
              >
                保存して閉じる
              </button>
              <button
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #10b981", background: "#10b981", color: "#fff", cursor: "pointer" }}
                onClick={openOptionsPage}
              >
                オプションを開く
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


