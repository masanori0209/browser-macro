import { runFlow } from "./runner";
import { generateTaskFromText, runConversation } from "./llmClient";
import {
  deleteTrigger,
  deleteFlow,
  deleteTask,
  exportData,
  getFlows,
  getLogs,
  getLlmSettings,
  importData,
  getRecordingBuffer,
  getRecordingBuffers,
  getTasks,
  getTriggers,
  removeRecordingBuffer,
  saveFlow,
  saveLlmSettings,
  saveTask,
  saveTrigger,
  upsertRecordingBuffer,
  getConversationStates,
  saveConversationState,
  deleteConversationState,
  type RecordingBuffer,
  type ConversationState
} from "./storage";
import type { Flow, Step, Task, Trigger } from "../shared/models";
import {
  MessageType,
  type BackgroundRequestMessage,
  type BackgroundResponse,
  type DeleteTriggerMessage,
  type DeleteFlowMessage,
  type DeleteTaskMessage,
  type ImportDataMessage,
  type RecordStepMessage,
  type RunFlowMessage,
  type SaveFlowMessage,
  type RunLlmPromptMessage,
  type RunLlmConversationMessage,
  type GetConversationStatesMessage,
  type DeleteConversationStateMessage,
  type SaveLlmSettingsMessage,
  type SaveTaskMessage,
  type SaveTriggerMessage,
  type StartRecordingMessage,
  type StopRecordingMessage
} from "../shared/messageTypes";
import { nowIso, randomId } from "../shared/utils";

const recordingBuffers = new Map<number, RecordingBuffer>();
const conversationStates = new Map<string, ConversationState>();
const KEEP_ALIVE_ALARM = "flowmacro-keepalive";

// 会話状態を復元
getConversationStates()
  .then((states: ConversationState[]) => {
    states.forEach((state: ConversationState) => {
      if (state.isActive) {
        conversationStates.set(state.conversationId, state);
      }
    });
  })
  .catch((err: unknown) => console.warn("failed to hydrate conversation states", err));

function initKeepAlive() {
  chrome.alarms.create(KEEP_ALIVE_ALARM, { periodInMinutes: 4.9 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === KEEP_ALIVE_ALARM) {
      // no-op ping to keep service worker warm
    }
  });
}

initKeepAlive();

// 復元: スリープ後でも録画バッファを再ロード
getRecordingBuffers()
  .then((buffers) => buffers.forEach((b) => recordingBuffers.set(b.tabId, b)))
  .catch((err) => console.warn("failed to hydrate recording buffers", err));

async function getActiveTabId(): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(lastError);
        return;
      }
      const tabId = tabs[0]?.id;
      if (!tabId) {
        reject(new Error("No active tab found"));
        return;
      }
      resolve(tabId);
    });
  });
}

async function ensureRecordingBuffer(tabId: number): Promise<RecordingBuffer> {
  const cached = recordingBuffers.get(tabId);
  if (cached) return cached;
  const stored = await getRecordingBuffer(tabId);
  if (stored) {
    recordingBuffers.set(tabId, stored);
    return stored;
  }
  throw new Error("Recording is not active");
}

async function handleStartRecording(message: StartRecordingMessage): Promise<BackgroundResponse> {
  const tabId = await getActiveTabId();
  const buffer: RecordingBuffer = {
    tabId,
    sessionId: randomId("rec"),
    steps: [],
    startedAt: nowIso()
  };
  recordingBuffers.set(tabId, buffer);
  await upsertRecordingBuffer(buffer);
  chrome.tabs.sendMessage(tabId, message);
  return { type: "state", recording: true };
}

async function handleStopRecording(message: StopRecordingMessage): Promise<BackgroundResponse> {
  const tabId = await getActiveTabId();
  chrome.tabs.sendMessage(tabId, message);
  const buffer = await getRecordingBuffer(tabId);
  const steps = buffer?.steps ?? [];
  if (!steps.length) {
    recordingBuffers.delete(tabId);
    await removeRecordingBuffer(tabId);
    return { type: "ok", data: { saved: false, reason: "no steps" } };
  }

  const newTask: Task = {
    id: randomId("task"),
    name: message.taskName || "Recorded Task",
    description: message.description,
    steps: steps,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  await saveTask(newTask);
  recordingBuffers.delete(tabId);
  await removeRecordingBuffer(tabId);
  return { type: "ok", data: { saved: true, task: newTask } };
}

async function handleRecordStep(message: RecordStepMessage, sender: chrome.runtime.MessageSender): Promise<BackgroundResponse> {
  const tabId = sender.tab?.id;
  if (tabId == null) {
    return { type: "error", message: "Tab not found for recording" };
  }
  const buffer = recordingBuffers.get(tabId);
  const resolvedBuffer = buffer ?? (await ensureRecordingBuffer(tabId));
  resolvedBuffer.steps.push(message.step);
  recordingBuffers.set(tabId, resolvedBuffer);
  await upsertRecordingBuffer(resolvedBuffer);
  return { type: "ok" };
}

async function handleSaveTask(message: SaveTaskMessage): Promise<BackgroundResponse> {
  await saveTask(message.task);
  return { type: "ok" };
}

async function handleSaveFlow(message: SaveFlowMessage): Promise<BackgroundResponse> {
  await saveFlow(message.flow);
  return { type: "ok" };
}

async function handleDeleteTask(message: DeleteTaskMessage): Promise<BackgroundResponse> {
  await deleteTask(message.taskId);
  return { type: "ok" };
}

async function handleDeleteFlow(message: DeleteFlowMessage): Promise<BackgroundResponse> {
  await deleteFlow(message.flowId);
  const triggers = await getTriggers();
  const orphanTriggerIds = triggers.filter((t) => t.flowId === message.flowId).map((t) => t.id);
  await Promise.all(orphanTriggerIds.map((id) => deleteTrigger(id)));
  return { type: "ok" };
}

async function handleRunFlow(message: RunFlowMessage): Promise<BackgroundResponse> {
  await runFlow(message.flowId, message.tabId, "direct");
  return { type: "ok" };
}

async function handleSaveTrigger(message: SaveTriggerMessage): Promise<BackgroundResponse> {
  const trigger: Trigger = message.trigger.id ? message.trigger : { ...message.trigger, id: randomId("trigger") };
  await saveTrigger(trigger);
  return { type: "ok" };
}

async function handleDeleteTrigger(message: DeleteTriggerMessage): Promise<BackgroundResponse> {
  await deleteTrigger(message.triggerId);
  return { type: "ok" };
}

async function handleImportData(message: ImportDataMessage): Promise<BackgroundResponse> {
  await importData(message.payload, message.mode ?? "merge");
  return { type: "ok" };
}

async function handleSaveLlmSettings(message: SaveLlmSettingsMessage): Promise<BackgroundResponse> {
  await saveLlmSettings(message.settings);
  return { type: "ok" };
}

async function sendStepToTab(tabId: number, step: Step): Promise<{ success: boolean; errorMessage?: string }> {
  const payload = { type: MessageType.ExecuteStep, step };
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(lastError);
        return;
      }
      const result = response as { success: boolean; errorMessage?: string };
      resolve(result);
    });
  });
}

async function handleRunLlmPrompt(message: RunLlmPromptMessage): Promise<BackgroundResponse> {
  try {
    const tabId = await getActiveTabId();
    const tab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
      chrome.tabs.get(tabId, (tab) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) reject(lastError);
        else resolve(tab);
      });
    });
    const currentUrl = tab.url || "";

    // 現在のページのDOM情報を取得
    let domInfo: { url: string; title: string; clickableElements: unknown[]; inputElements: unknown[] } | null = null;
    try {
      const domResponse = await new Promise<{ type: string; data?: unknown; message?: string }>((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { type: MessageType.GetPageDomInfo }, (response) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            reject(lastError);
            return;
          }
          resolve(response as { type: string; data?: unknown; message?: string });
        });
      });
      if (domResponse.type === "pageDomInfo" && domResponse.data) {
        domInfo = domResponse.data as { url: string; title: string; clickableElements: unknown[]; inputElements: unknown[] };
      }
    } catch (error) {
      console.warn("[FlowMacro] Failed to get DOM info:", error);
    }

    // LLMにプロンプトを送信してステップ配列を生成（DOM情報を含める）
    const llmResponse = await generateTaskFromText(message.prompt, currentUrl, domInfo);
    let parsedSteps: Step[];
    try {
      // LLMの応答からJSONを抽出（コードブロックや余分なテキストを除去）
      const jsonMatch = llmResponse.match(/\{[\s\S]*"steps"[\s\S]*\}/) || llmResponse.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? jsonMatch[0] : llmResponse;
      const parsed = JSON.parse(jsonStr);
      parsedSteps = parsed.steps || parsed;
      if (!Array.isArray(parsedSteps)) {
        throw new Error("LLM response is not an array of steps");
      }
    } catch (parseError) {
      throw new Error(`LLM response parse error: ${parseError}. Response: ${llmResponse}`);
    }

    // ステップにIDを付与
    const stepsWithIds: Step[] = parsedSteps.map((s) => ({
      ...s,
      id: s.id || randomId("step"),
      urlPattern: s.urlPattern || currentUrl
    }));

    // 録画を開始
    const buffer: RecordingBuffer = {
      tabId,
      sessionId: randomId("rec"),
      steps: [],
      startedAt: nowIso()
    };
    recordingBuffers.set(tabId, buffer);
    await upsertRecordingBuffer(buffer);
    await chrome.tabs.sendMessage(tabId, { type: MessageType.StartRecording });

    // 生成されたステップを順次実行しながら記録
    for (let i = 0; i < stepsWithIds.length; i++) {
      const step = stepsWithIds[i];
      try {
        // ステップを実行
        const result = await sendStepToTab(tabId, step);
        if (!result.success) {
          throw new Error(result.errorMessage || "Step execution failed");
        }
        // 実行したステップを記録
        buffer.steps.push(step);
        recordingBuffers.set(tabId, buffer);
        await upsertRecordingBuffer(buffer);

        // ステップ間の待機時間
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        // エラーが発生しても記録は続行
        buffer.steps.push({
          ...step,
          meta: { ...step.meta, error: (error as Error).message }
        });
        recordingBuffers.set(tabId, buffer);
        await upsertRecordingBuffer(buffer);
      }
    }

    // 録画を停止してタスクを保存
    await chrome.tabs.sendMessage(tabId, { type: MessageType.StopRecording });
    const finalSteps = buffer.steps;
    if (!finalSteps.length) {
      recordingBuffers.delete(tabId);
      await removeRecordingBuffer(tabId);
      return { type: "error", message: "No steps were executed" };
    }

    const newTask: Task = {
      id: randomId("task"),
      name: message.taskName || `LLM: ${message.prompt.slice(0, 50)}`,
      description: message.description || `LLM生成タスク: ${message.prompt}`,
      steps: finalSteps,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await saveTask(newTask);
    recordingBuffers.delete(tabId);
    await removeRecordingBuffer(tabId);

    return { type: "llmTask", task: newTask };
  } catch (error) {
    return { type: "error", message: (error as Error).message };
  }
}

async function handleRunLlmConversation(message: RunLlmConversationMessage): Promise<BackgroundResponse> {
  try {
    const tabId = await getActiveTabId();
    const tab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
      chrome.tabs.get(tabId, (tab) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) reject(lastError);
        else resolve(tab);
      });
    });
    let currentUrl = tab.url || "";

    // 現在のページのDOM情報を取得
    let domInfo: { url: string; title: string; clickableElements: unknown[]; inputElements: unknown[] } | null = null;
    try {
      const domResponse = await new Promise<{ type: string; data?: unknown; message?: string }>((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { type: MessageType.GetPageDomInfo }, (response) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            reject(lastError);
            return;
          }
          resolve(response as { type: string; data?: unknown; message?: string });
        });
      });
      if (domResponse.type === "pageDomInfo" && domResponse.data) {
        domInfo = domResponse.data as { url: string; title: string; clickableElements: unknown[]; inputElements: unknown[] };
      }
    } catch (error) {
      console.warn("[FlowMacro] Failed to get DOM info:", error);
    }

    // 会話を実行
    const conversationId = message.conversationId || randomId("conv");
    const history = message.history || [];
    
    // 会話状態を保存（メモリとストレージの両方）
    const state: ConversationState = {
      conversationId,
      history: [...history, { role: "user", content: message.message }],
      tabId,
      isActive: true
    };
    conversationStates.set(conversationId, state);
    await saveConversationState(state);
    
    const result = await runConversation(message.message, history, currentUrl, domInfo);

    let executedSteps: Step[] = [];
    let reportContent: string | undefined;

    // アクションタイプに応じて処理
    if (result.action?.type === "execute" && result.action.steps) {
      // ステップを実行
      const stepsWithIds: Step[] = result.action.steps.map((s) => ({
        ...s,
        id: s.id || randomId("step"),
        urlPattern: s.urlPattern || currentUrl
      }));

      // 録画を開始
      const buffer: RecordingBuffer = {
        tabId,
        sessionId: randomId("rec"),
        steps: [],
        startedAt: nowIso()
      };
      recordingBuffers.set(tabId, buffer);
      await upsertRecordingBuffer(buffer);
      await chrome.tabs.sendMessage(tabId, { type: MessageType.StartRecording });

      // 実行中の状態を保存（ページ遷移後も継続できるように）
      const convState = conversationStates.get(conversationId);
      if (convState) {
        convState.history.push({ role: "assistant", content: result.response });
        convState.isActive = true; // 実行中であることを示す
        conversationStates.set(conversationId, convState);
        await saveConversationState(convState);
      }
      
      // ステップを実行（ページ遷移を考慮）
      for (let i = 0; i < stepsWithIds.length; i++) {
        const step = stepsWithIds[i];
        try {
          // ページ遷移を待つ（必要に応じて）
          if (step.type === "click" || step.type === "wait") {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
          
          // 実行前に会話状態を保存（ページ遷移で中断されても復元できるように）
          const currentConvState = conversationStates.get(conversationId);
          if (currentConvState) {
            currentConvState.isActive = true;
            conversationStates.set(conversationId, currentConvState);
            await saveConversationState(currentConvState);
          }
          
          const execResult = await sendStepToTab(tabId, step);
          if (execResult.success) {
            buffer.steps.push(step);
            executedSteps.push(step);
            recordingBuffers.set(tabId, buffer);
            await upsertRecordingBuffer(buffer);
            
            // 実行中の状態を更新
            const updatedConvState = conversationStates.get(conversationId);
            if (updatedConvState) {
              updatedConvState.isActive = true;
              conversationStates.set(conversationId, updatedConvState);
              await saveConversationState(updatedConvState);
            }
            
            // ページ遷移を検知して待機
            if (step.type === "click") {
              let previousUrl = currentUrl;
              for (let waitCount = 0; waitCount < 20; waitCount++) {
                await new Promise((resolve) => setTimeout(resolve, 500));
                try {
                  const updatedTab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
                    chrome.tabs.get(tabId, (tab) => {
                      const lastError = chrome.runtime.lastError;
                      if (lastError) reject(lastError);
                      else resolve(tab);
                    });
                  });
                  if (updatedTab.url && updatedTab.url !== previousUrl && updatedTab.status === "complete") {
                    previousUrl = updatedTab.url;
                    // ページ遷移が完了するまで待機
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                    // 次のステップのためにURLを更新
                    currentUrl = updatedTab.url;
                    break;
                  }
                } catch (e) {
                  // ignore
                }
              }
            } else {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          } else {
          }
        } catch (error) {
          // ignore
        }
      }
      
      // すべてのステップ実行後、ページ内容を取得してレポート生成が必要かチェック
      const lastStep = stepsWithIds[stepsWithIds.length - 1];
      if (lastStep && (lastStep.type === "click" || lastStep.type === "wait")) {
        // ページ内容を取得
        try {
          const pageContentResponse = await new Promise<{ type: string; data?: { url: string; title: string; content: string }; message?: string }>((resolve, reject) => {
            chrome.tabs.sendMessage(tabId, { type: MessageType.GetPageContent }, (response) => {
              const lastError = chrome.runtime.lastError;
              if (lastError) {
                reject(lastError);
                return;
              }
              resolve(response as { type: string; data?: { url: string; title: string; content: string }; message?: string });
            });
          });
          
          if (pageContentResponse.type === "pageContent" && pageContentResponse.data) {
            // ユーザーの依頼に「レポート」が含まれている場合、レポート生成を促す
            const userMessage = message.message.toLowerCase();
            if (userMessage.includes("レポート") || userMessage.includes("まとめて") || userMessage.includes("報告")) {
              // ページ内容を基にレポート生成をLLMに依頼
              const reportPrompt = `以下のページ内容を基に、ユーザーの依頼「${message.message}」に対するレポートを生成してください。

ページ情報:
- URL: ${pageContentResponse.data.url}
- タイトル: ${pageContentResponse.data.title}

ページ内容:
${pageContentResponse.data.content.slice(0, 5000)}

レポート形式:
{"action": "report", "content": "レポート内容..."}`;
              
              const reportResult = await runConversation(
                reportPrompt,
                [...history, { role: "user", content: message.message }, { role: "assistant", content: result.response }],
                pageContentResponse.data.url,
                null
              );
              
              if (reportResult.action?.type === "report" && reportResult.action.reportContent) {
                reportContent = reportResult.action.reportContent;
              }
            }
          }
        } catch (error) {
          console.warn("[FlowMacro] Failed to get page content:", error);
        }
      }

      await chrome.tabs.sendMessage(tabId, { type: MessageType.StopRecording });
      recordingBuffers.delete(tabId);
      await removeRecordingBuffer(tabId);
    } else if (result.action?.type === "report" && result.action.reportContent) {
      reportContent = result.action.reportContent;
    }

    // 会話履歴を更新（メモリとストレージの両方）
    const convState = conversationStates.get(conversationId);
    if (convState) {
      convState.history.push({ role: "assistant", content: result.response });
      conversationStates.set(conversationId, convState);
      await saveConversationState(convState);
    }

    return {
      type: "llmConversation",
      conversationId,
      response: result.response,
      executedSteps: executedSteps.length > 0 ? executedSteps : undefined,
      report: reportContent
    };
  } catch (error) {
    return { type: "error", message: (error as Error).message };
  }
}

async function dispatch(message: BackgroundRequestMessage, sender: chrome.runtime.MessageSender): Promise<BackgroundResponse> {
  switch (message.type) {
    case MessageType.StartRecording:
      return handleStartRecording(message);
    case MessageType.StopRecording:
      return handleStopRecording(message);
    case MessageType.RecordStep:
      return handleRecordStep(message, sender);
    case MessageType.GetTasks:
      return { type: "tasks", tasks: await getTasks() };
    case MessageType.GetFlows:
      return { type: "flows", flows: await getFlows() };
    case MessageType.SaveTask:
      return handleSaveTask(message);
    case MessageType.DeleteTask:
      return handleDeleteTask(message);
    case MessageType.SaveFlow:
      return handleSaveFlow(message);
    case MessageType.DeleteFlow:
      return handleDeleteFlow(message);
    case MessageType.RunFlow:
      return handleRunFlow(message);
    case MessageType.GetLogs:
      return { type: "logs", logs: await getLogs() };
    case MessageType.GetState:
      return { type: "state", recording: (await getRecordingBuffers()).length > 0 };
    case MessageType.GetTriggers:
      return { type: "triggers", triggers: await getTriggers() };
    case MessageType.SaveTrigger:
      return handleSaveTrigger(message);
    case MessageType.DeleteTrigger:
      return handleDeleteTrigger(message);
    case MessageType.ExportData:
      return { type: "export", data: await exportData() };
    case MessageType.ImportData:
      return handleImportData(message);
    case MessageType.GetLlmSettings:
      return { type: "llmSettings", settings: await getLlmSettings() };
    case MessageType.SaveLlmSettings:
      return handleSaveLlmSettings(message);
    case MessageType.RunLlmPrompt:
      return handleRunLlmPrompt(message);
    case MessageType.RunLlmConversation:
      return handleRunLlmConversation(message);
    default:
      return { type: "error", message: "Unknown message type" };
  }
}

chrome.runtime.onMessage.addListener((message: BackgroundRequestMessage, sender, sendResponse) => {
  (async () => {
    try {
      const response = await dispatch(message, sender);
      sendResponse(response);
    } catch (error) {
      sendResponse({ type: "error", message: (error as Error).message });
    }
  })();
  return true;
});

function matchUrlPattern(pattern: string | undefined, url: string): boolean {
  if (!pattern) return false;
  try {
    const regex = new RegExp(pattern);
    return regex.test(url);
  } catch {
    return url.includes(pattern);
  }
}

async function runUrlTriggers(tabId: number, url: string) {
  const [triggers, flows] = await Promise.all([getTriggers(), getFlows()]);
  const active = triggers.filter((t) => t.enabled && t.type === "url" && matchUrlPattern(t.urlPattern, url));
  for (const trigger of active) {
    const flow = flows.find((f) => f.id === trigger.flowId && f.enabled);
    if (!flow) continue;
    runFlow(flow.id, tabId, "url").catch((err) => console.warn("auto url run failed", err));
  }
  const autoFlows = flows.filter((f) => f.enabled && (f.autoRunUrlPatterns ?? []).some((p) => matchUrlPattern(p, url)));
  for (const flow of autoFlows) {
    runFlow(flow.id, tabId, "url").catch((err) => console.warn("auto flow run failed", err));
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    runUrlTriggers(tabId, tab.url).catch((err) => console.warn("runUrlTriggers error", err));
    
    // アクティブな会話がある場合は、ダイアログを再表示
    // content scriptの読み込みを待つ（複数回試行）
    let retryCount = 0;
    const maxRetries = 5;
    const retryInterval = 500;
    
    const tryRestoreDialog = () => {
      for (const [convId, state] of conversationStates.entries()) {
        if (state.tabId === tabId && state.isActive) {
          chrome.tabs.sendMessage(tabId, { type: MessageType.RestoreChatDialog, conversationId: convId, history: state.history }, (response) => {
            const lastError = chrome.runtime.lastError;
            if (lastError && retryCount < maxRetries) {
              // content scriptが読み込まれていない場合は再試行
              retryCount++;
              setTimeout(tryRestoreDialog, retryInterval);
            }
          });
          break;
        }
      }
    };
    
    setTimeout(tryRestoreDialog, retryInterval);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [triggers, flows] = await Promise.all([getTriggers(), getFlows()]);
  const active = triggers.filter((t) => t.enabled && t.type === "shortcut" && t.shortcutName === command);
  for (const trigger of active) {
    const flow = flows.find((f) => f.id === trigger.flowId && f.enabled);
    if (!flow) continue;
    runFlow(flow.id, undefined, "shortcut").catch((err) => console.warn("shortcut run failed", err));
  }
});


