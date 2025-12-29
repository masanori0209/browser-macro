import type { Step, Task } from "../shared/models";
import { MessageType } from "../shared/messageTypes";
import { buildSelectorInfo } from "./selectors";
import { nowIso, randomId } from "../shared/utils";

const BOX_ID = "flowmacro-highlight-box";
const LABEL_ID = "flowmacro-highlight-label";
const DIALOG_ID = "flowmacro-task-dialog";
const BANNER_ID = "flowmacro-highlight-banner";
const PROMPT_DIALOG_ID = "flowmacro-llm-prompt-dialog";
const CHAT_DIALOG_ID = "flowmacro-llm-chat-dialog";
const ACTIVE_COLOR = "#2563eb";

type StepType = Step["type"];

function getTheme() {
  const dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return {
    dark,
    cardBg: dark ? "#0f172a" : "#fff",
    cardText: dark ? "#e2e8f0" : "#0f172a",
    helperText: dark ? "#cbd5e1" : "#475569",
    overlayBg: dark ? "rgba(15,23,42,0.65)" : "rgba(0,0,0,0.32)",
    inputBg: dark ? "#0b1221" : "#fff",
    inputBorder: dark ? "#334155" : "#d1d5db",
    cancelBg: dark ? "#111827" : "#fff",
    cancelBorder: dark ? "#334155" : "#e2e8f0"
  };
}

let modifierActive = false;
let highlighted: HTMLElement | null = null;
let boxEl: HTMLDivElement | null = null;
let labelEl: HTMLDivElement | null = null;
let dialogEl: HTMLDivElement | null = null;
let promptDialogEl: HTMLDivElement | null = null;
let chatDialogEl: HTMLDivElement | null = null;
let lastPointer: { x: number; y: number } | null = null;
let bannerEl: HTMLDivElement | null = null;

function isEligible(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (dialogEl && dialogEl.contains(el)) return false;
  if (promptDialogEl && promptDialogEl.contains(el)) return false;
  if (chatDialogEl && chatDialogEl.contains(el)) return false;
  if (el.closest(`#${DIALOG_ID}`)) return false;
  if (el.closest(`#${PROMPT_DIALOG_ID}`)) return false;
  if (el.closest(`#${CHAT_DIALOG_ID}`)) return false;
  if (el.tabIndex >= 0) return true;
  if (el.getAttribute("role") === "button" || el.getAttribute("role") === "link") return true;
  if (el.getAttribute("onclick")) return true;
  const tag = el.tagName.toLowerCase();
  return ["button", "a", "input", "textarea"].includes(tag);
}

function findEligible(el: Element | null): HTMLElement | null {
  let current: Element | null = el;
  while (current && current !== document.body) {
    if (isEligible(current)) return current;
    current = current.parentElement;
  }
  return null;
}

function ensureBox(): HTMLDivElement {
  if (boxEl) return boxEl;
  boxEl = document.createElement("div");
  boxEl.id = BOX_ID;
  Object.assign(boxEl.style, {
    position: "fixed",
    border: `2px solid ${ACTIVE_COLOR}`,
    borderRadius: "8px",
    background: "rgba(37, 99, 235, 0.08)",
    boxShadow: "0 0 0 2px rgba(37, 99, 235, 0.18)",
    pointerEvents: "none",
    zIndex: "2147483646",
    transition: "all 80ms ease"
  });
  document.body.appendChild(boxEl);
  return boxEl;
}

function ensureLabel(): HTMLDivElement {
  if (labelEl) return labelEl;
  labelEl = document.createElement("div");
  labelEl.id = LABEL_ID;
  Object.assign(labelEl.style, {
    position: "fixed",
    padding: "4px 8px",
    background: ACTIVE_COLOR,
    color: "#fff",
    borderRadius: "6px",
    fontSize: "12px",
    fontFamily: "sans-serif",
    pointerEvents: "none",
    zIndex: "2147483647",
    boxShadow: "0 6px 20px rgba(37, 99, 235, 0.24)"
  });
  labelEl.textContent = "Cmd/Ctrl + Clickでタスク追加";
  document.body.appendChild(labelEl);
  return labelEl;
}

function ensureBanner(): HTMLDivElement {
  if (bannerEl) return bannerEl;
  bannerEl = document.createElement("div");
  bannerEl.id = BANNER_ID;
  Object.assign(bannerEl.style, {
    position: "fixed",
    top: "10px",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "8px 14px",
    background: "rgba(37, 99, 235, 0.96)",
    color: "#fff",
    borderRadius: "999px",
    fontSize: "13px",
    fontWeight: "600",
    fontFamily: "sans-serif",
    zIndex: "2147483647",
    boxShadow: "0 10px 25px rgba(37, 99, 235, 0.35)",
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity 120ms ease"
  });
  bannerEl.textContent = "要素確認モード: Cmd/Ctrl押下中にクリックでタスク追加";
  document.body.appendChild(bannerEl);
  // fade-in
  requestAnimationFrame(() => {
    if (bannerEl) bannerEl.style.opacity = "1";
  });
  return bannerEl;
}

function clearHighlight() {
  highlighted = null;
  boxEl?.remove();
  labelEl?.remove();
  bannerEl?.remove();
  boxEl = null;
  labelEl = null;
  bannerEl = null;
}

function updateHighlight(target: HTMLElement | null) {
  highlighted = target;
  if (!modifierActive || !target) {
    clearHighlight();
    return;
  }
  const rect = target.getBoundingClientRect();
  const box = ensureBox();
  const label = ensureLabel();

  box.style.left = `${rect.left - 4}px`;
  box.style.top = `${rect.top - 4}px`;
  box.style.width = `${rect.width + 8}px`;
  box.style.height = `${rect.height + 8}px`;

  label.style.left = `${rect.left}px`;
  label.style.top = `${Math.max(0, rect.top - 28)}px`;
}

function setModifierActive(active: boolean) {
  modifierActive = active;
  if (!active) {
    clearHighlight();
  } else {
    ensureBanner();
  }
}

function defaultStepType(target: HTMLElement): StepType {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return "input";
  return "click";
}

function extractLabel(target: HTMLElement): string {
  const aria = target.getAttribute("aria-label");
  if (aria) return aria;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    if (target.placeholder) return target.placeholder;
    if (target.name) return target.name;
  }
  const text = (target.textContent || "").trim().replace(/\s+/g, " ");
  if (text) return text.slice(0, 60);
  return target.tagName.toLowerCase();
}

function defaultTaskName(target: HTMLElement): string {
  const label = extractLabel(target);
  const tag = target.tagName.toLowerCase();
  return `${label || "新規タスク"} (${tag})`;
}

function sendSaveTask(task: Task): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: MessageType.SaveTask, task }, (response: { type?: string; message?: string }) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(lastError);
        return;
      }
      if (response?.type === "error") {
        reject(new Error(response.message));
        return;
      }
      resolve();
    });
  });
}

function closeDialog() {
  dialogEl?.remove();
  dialogEl = null;
}

function createInput(label: string, type: "text" | "textarea", defaultValue: string) {
  const theme = getTheme();
  const wrapper = document.createElement("label");
  Object.assign(wrapper.style, {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    fontSize: "12px",
    color: theme.cardText
  });
  const span = document.createElement("span");
  span.textContent = label;
  span.style.fontWeight = "600";
  wrapper.appendChild(span);
  if (type === "text") {
    const input = document.createElement("input");
    input.type = "text";
    input.value = defaultValue;
    Object.assign(input.style, {
      padding: "8px",
      borderRadius: "6px",
      border: `1px solid ${theme.inputBorder}`,
      fontSize: "13px",
      background: theme.inputBg,
      color: theme.cardText
    });
    wrapper.appendChild(input);
    return { wrapper, element: input };
  }
  const textarea = document.createElement("textarea");
  textarea.value = defaultValue;
  textarea.rows = 3;
  Object.assign(textarea.style, {
    padding: "8px",
    borderRadius: "6px",
    border: `1px solid ${theme.inputBorder}`,
    fontSize: "13px",
    background: theme.inputBg,
    color: theme.cardText
  });
  wrapper.appendChild(textarea);
  return { wrapper, element: textarea };
}

function openTaskDialog(target: HTMLElement) {
  const theme = getTheme();
  setModifierActive(false);
  clearHighlight();

  const stepKind = defaultStepType(target);
  const targetLabel = extractLabel(target);
  const targetTag = target.tagName.toLowerCase();

  dialogEl?.remove();
  dialogEl = document.createElement("div");
  dialogEl.id = DIALOG_ID;
  Object.assign(dialogEl.style, {
    position: "fixed",
    inset: "0",
    background: theme.overlayBg,
    zIndex: "2147483647",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px"
  });

  const card = document.createElement("div");
  Object.assign(card.style, {
    width: "min(440px, 100%)",
    background: theme.cardBg,
    borderRadius: "12px",
    boxShadow: "0 15px 45px rgba(0,0,0,0.24)",
    padding: "16px",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    color: theme.cardText,
    display: "flex",
    flexDirection: "column",
    gap: "10px"
  });

  const title = document.createElement("div");
  title.textContent = "タスクに追加";
  Object.assign(title.style, { fontSize: "16px", fontWeight: "700" });

  const helper = document.createElement("div");
  helper.textContent = `対象: ${targetLabel || targetTag} / アクション: ${stepKind === "input" ? "入力" : "クリック"}`;
  Object.assign(helper.style, { fontSize: "12px", color: theme.helperText });

  const form = document.createElement("form");
  Object.assign(form.style, { display: "flex", flexDirection: "column", gap: "10px" });

  const nameField = createInput("タスク名", "text", defaultTaskName(target));
  const descField = createInput("説明 (任意)", "textarea", "");
  const valueField =
    stepKind === "input"
      ? createInput("入力値", "textarea", target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target.value : "")
      : null;

  const buttonRow = document.createElement("div");
  Object.assign(buttonRow.style, { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" });

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "キャンセル";
  Object.assign(cancel.style, {
    padding: "8px 12px",
    borderRadius: "8px",
    border: `1px solid ${theme.cancelBorder}`,
    background: theme.cancelBg,
    color: theme.cardText,
    cursor: "pointer"
  });

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "保存";
  Object.assign(submit.style, {
    padding: "8px 12px",
    borderRadius: "8px",
    border: "1px solid #1d4ed8",
    background: ACTIVE_COLOR,
    color: "#fff",
    cursor: "pointer"
  });

  buttonRow.append(cancel, submit);

  form.append(nameField.wrapper, descField.wrapper);
  if (valueField) form.append(valueField.wrapper);
  form.append(buttonRow);

  card.append(title, helper, form);
  dialogEl.appendChild(card);
  document.body.appendChild(dialogEl);

  nameField.element.focus();

  const close = () => closeDialog();

  cancel.addEventListener("click", close);
  dialogEl.addEventListener("click", (event) => {
    if (event.target === dialogEl) close();
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        close();
      }
    },
    { once: true }
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    submit.textContent = "保存中...";
    try {
      const selector = buildSelectorInfo(target);
      const step: Step = {
        id: randomId("step"),
        type: stepKind,
        selector,
        value: stepKind === "input" ? (valueField?.element.value ?? "") : undefined,
        urlPattern: window.location.href,
        meta: { tag: targetTag, label: targetLabel }
      };
      const task: Task = {
        id: randomId("task"),
        name: nameField.element.value || defaultTaskName(target),
        description: descField.element.value || undefined,
        steps: [step],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      await sendSaveTask(task);
      close();
    } catch (error) {
      submit.disabled = false;
      submit.textContent = "保存";
      alert((error as Error).message);
    }
  });
}

function handlePointerMove(event: PointerEvent) {
  lastPointer = { x: event.clientX, y: event.clientY };
  if (!modifierActive) return;
  const target = findEligible(event.target as Element | null);
  updateHighlight(target);
}

function elementAtLastPoint(): Element | null {
  if (lastPointer) {
    return document.elementFromPoint(lastPointer.x, lastPointer.y);
  }
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  return document.elementFromPoint(cx, cy);
}

function handleClick(event: MouseEvent) {
  if (!modifierActive) return;
  const target = findEligible(event.target as Element | null);
  if (!target) return;
  event.preventDefault();
  event.stopPropagation();
  openTaskDialog(target);
}

document.addEventListener("keydown", (event) => {
  // Shiftキーが押されている場合は、他のショートカット処理に任せる
  if (event.shiftKey) return;
  if (event.metaKey || event.ctrlKey) {
    setModifierActive(true);
    const el = elementAtLastPoint();
    updateHighlight(findEligible(el));
  }
});

document.addEventListener("keyup", (event) => {
  if (!event.metaKey && !event.ctrlKey) {
    setModifierActive(false);
  }
});

window.addEventListener("blur", () => setModifierActive(false));
document.addEventListener("pointermove", handlePointerMove, true);
document.addEventListener("scroll", () => {
  if (highlighted) updateHighlight(highlighted);
}, true);
document.addEventListener("click", handleClick, true);

// LLMプロンプトダイアログ
function closePromptDialog() {
  promptDialogEl?.remove();
  promptDialogEl = null;
}

function openLlmPromptDialog() {
  if (promptDialogEl) return;
  const theme = getTheme();

  promptDialogEl = document.createElement("div");
  promptDialogEl.id = PROMPT_DIALOG_ID;
  Object.assign(promptDialogEl.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    width: "min(420px, calc(100vw - 40px))",
    background: theme.cardBg,
    borderRadius: "12px",
    boxShadow: "0 15px 45px rgba(0,0,0,0.24)",
    padding: "16px",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    color: theme.cardText,
    zIndex: "2147483647",
    border: `1px solid ${theme.inputBorder}`
  });

  const title = document.createElement("div");
  title.textContent = "🤖 LLM自動操作";
  Object.assign(title.style, { fontSize: "16px", fontWeight: "700", marginBottom: "8px" });

  const helper = document.createElement("div");
  helper.textContent = "プロンプトで操作を指示すると、自動で実行しながら記録します";
  Object.assign(helper.style, { fontSize: "12px", color: theme.helperText, marginBottom: "12px" });

  const textarea = document.createElement("textarea");
  textarea.placeholder = "例: Googleで「給与 法改正」を検索して、最初の結果をクリック";
  textarea.rows = 4;
  Object.assign(textarea.style, {
    width: "100%",
    padding: "10px",
    borderRadius: "8px",
    border: `1px solid ${theme.inputBorder}`,
    background: theme.inputBg,
    color: theme.cardText,
    fontSize: "13px",
    fontFamily: "inherit",
    resize: "vertical" as const,
    marginBottom: "12px",
    boxSizing: "border-box" as const
  });

  const buttonRow = document.createElement("div");
  Object.assign(buttonRow.style, { display: "flex", justifyContent: "flex-end", gap: "8px" });

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "キャンセル";
  Object.assign(cancel.style, {
    padding: "8px 12px",
    borderRadius: "8px",
    border: `1px solid ${theme.cancelBorder}`,
    background: theme.cancelBg,
    color: theme.cardText,
    cursor: "pointer",
    fontSize: "13px"
  });

  const submit = document.createElement("button");
  submit.type = "button";
  submit.textContent = "実行";
  Object.assign(submit.style, {
    padding: "8px 12px",
    borderRadius: "8px",
    border: "1px solid #1d4ed8",
    background: ACTIVE_COLOR,
    color: "#fff",
    cursor: "pointer",
    fontSize: "13px"
  });

  let isRunning = false;

  const execute = async () => {
    const prompt = textarea.value.trim();
    if (!prompt) {
      alert("プロンプトを入力してください");
      return;
    }
    if (isRunning) return;

    isRunning = true;
    submit.disabled = true;
    submit.textContent = "実行中...";
    cancel.disabled = true;

    try {
      const response = await new Promise<{ type: string; task?: Task; message?: string }>((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: MessageType.RunLlmPrompt,
            prompt,
            taskName: `LLM: ${prompt.slice(0, 30)}`,
            description: `LLM生成: ${prompt}`
          },
          (response) => {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
              reject(lastError);
              return;
            }
            resolve(response as { type: string; task?: Task; message?: string });
          }
        );
      });

      if (response.type === "error") {
        alert(`エラー: ${response.message || "Unknown error"}`);
      } else {
        closePromptDialog();
        // 成功メッセージを表示（オプション）
        const successMsg = document.createElement("div");
        Object.assign(successMsg.style, {
          position: "fixed",
          top: "20px",
          right: "20px",
          background: "#10b981",
          color: "#fff",
          padding: "12px 16px",
          borderRadius: "8px",
          fontSize: "13px",
          fontWeight: "600",
          zIndex: "2147483647",
          boxShadow: "0 4px 12px rgba(16,185,129,0.3)"
        });
        successMsg.textContent = "✅ LLM操作が完了し、タスクを保存しました";
        document.body.appendChild(successMsg);
        setTimeout(() => successMsg.remove(), 3000);
      }
    } catch (error) {
      alert(`エラー: ${(error as Error).message}`);
    } finally {
      isRunning = false;
      submit.disabled = false;
      submit.textContent = "実行";
      cancel.disabled = false;
    }
  };

  cancel.addEventListener("click", closePromptDialog);
  submit.addEventListener("click", execute);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      execute();
    }
    if (e.key === "Escape") {
      closePromptDialog();
    }
  });

  buttonRow.append(cancel, submit);
  promptDialogEl.append(title, helper, textarea, buttonRow);
  document.body.appendChild(promptDialogEl);

  textarea.focus();

  // ダイアログ外クリックで閉じる
  promptDialogEl.addEventListener("click", (e) => {
    if (e.target === promptDialogEl) closePromptDialog();
  });
}

// チャット形式のLLM会話UI
function closeChatDialog() {
  chatDialogEl?.remove();
  chatDialogEl = null;
}

// グローバルな会話状態
let globalConversationId: string | undefined;
let globalConversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];

function openLlmChatDialog() {
  if (chatDialogEl) return;
  const theme = getTheme();

  chatDialogEl = document.createElement("div");
  chatDialogEl.id = CHAT_DIALOG_ID;
  Object.assign(chatDialogEl.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    width: "min(500px, calc(100vw - 40px))",
    maxHeight: "min(600px, calc(100vh - 40px))",
    background: theme.cardBg,
    borderRadius: "12px",
    boxShadow: "0 15px 45px rgba(0,0,0,0.24)",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    color: theme.cardText,
    zIndex: "2147483647",
    border: `1px solid ${theme.inputBorder}`,
    display: "flex",
    flexDirection: "column"
  });

  const header = document.createElement("div");
  Object.assign(header.style, {
    padding: "16px",
    borderBottom: `1px solid ${theme.inputBorder}`,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  });

  const title = document.createElement("div");
  title.textContent = "🤖 LLMアシスタント";
  Object.assign(title.style, { fontSize: "16px", fontWeight: "700" });

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "×";
  closeBtn.type = "button";
  Object.assign(closeBtn.style, {
    background: "transparent",
    border: "none",
    color: theme.cardText,
    fontSize: "24px",
    cursor: "pointer",
    padding: "0",
    width: "32px",
    height: "32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  });
  closeBtn.addEventListener("click", closeChatDialog);

  header.append(title, closeBtn);

  const messagesContainer = document.createElement("div");
  Object.assign(messagesContainer.style, {
    flex: "1",
    overflowY: "auto" as const,
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    minHeight: "200px",
    maxHeight: "400px"
  });

  const inputArea = document.createElement("div");
  Object.assign(inputArea.style, {
    padding: "16px",
    borderTop: `1px solid ${theme.inputBorder}`,
    display: "flex",
    flexDirection: "column",
    gap: "8px"
  });

  const inputRow = document.createElement("div");
  Object.assign(inputRow.style, { display: "flex", gap: "8px" });

  const textarea = document.createElement("textarea");
  textarea.placeholder = "メッセージを入力... (例: Googleで「給与 法改正」を検索して、結果をレポートとして出力して)";
  textarea.rows = 3;
  Object.assign(textarea.style, {
    flex: "1",
    padding: "10px",
    borderRadius: "8px",
    border: `1px solid ${theme.inputBorder}`,
    background: theme.inputBg,
    color: theme.cardText,
    fontSize: "13px",
    fontFamily: "inherit",
    resize: "vertical" as const,
    boxSizing: "border-box" as const
  });

  const sendBtn = document.createElement("button");
  sendBtn.textContent = "送信";
  sendBtn.type = "button";
  Object.assign(sendBtn.style, {
    padding: "10px 16px",
    borderRadius: "8px",
    border: "1px solid #1d4ed8",
    background: ACTIVE_COLOR,
    color: "#fff",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "600",
    alignSelf: "flex-end"
  });

  const actionButtons = document.createElement("div");
  Object.assign(actionButtons.style, {
    display: "flex",
    gap: "8px",
    justifyContent: "flex-end",
    marginTop: "4px"
  });

  const exportReportBtn = document.createElement("button");
  exportReportBtn.textContent = "📄 レポート出力";
  exportReportBtn.type = "button";
  Object.assign(exportReportBtn.style, {
    padding: "6px 12px",
    borderRadius: "6px",
    border: `1px solid ${theme.inputBorder}`,
    background: theme.cancelBg,
    color: theme.cardText,
    cursor: "pointer",
    fontSize: "12px",
    display: "none"
  });

  const saveMacroBtn = document.createElement("button");
  saveMacroBtn.textContent = "💾 マクロ保存";
  saveMacroBtn.type = "button";
  Object.assign(saveMacroBtn.style, {
    padding: "6px 12px",
    borderRadius: "6px",
    border: `1px solid ${theme.inputBorder}`,
    background: theme.cancelBg,
    color: theme.cardText,
    cursor: "pointer",
    fontSize: "12px",
    display: "none"
  });

  actionButtons.append(exportReportBtn, saveMacroBtn);
  inputRow.append(textarea, sendBtn);
  inputArea.append(inputRow, actionButtons);
  chatDialogEl.append(header, messagesContainer, inputArea);
  document.body.appendChild(chatDialogEl);

  let conversationId: string | undefined;
  let conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
  let executedSteps: Step[] = [];
  let reportContent: string | undefined;

  function addMessage(role: "user" | "assistant", content: string) {
    const msgDiv = document.createElement("div");
    const isUser = role === "user";
    Object.assign(msgDiv.style, {
      padding: "10px 12px",
      borderRadius: "8px",
      background: isUser ? ACTIVE_COLOR : theme.inputBg,
      color: isUser ? "#fff" : theme.cardText,
      alignSelf: isUser ? "flex-end" : "flex-start",
      maxWidth: "80%",
      fontSize: "13px",
      lineHeight: "1.5",
      whiteSpace: "pre-wrap" as const,
      wordBreak: "break-word" as const
    });
    msgDiv.textContent = content;
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function addSystemMessage(content: string) {
    const msgDiv = document.createElement("div");
    Object.assign(msgDiv.style, {
      padding: "8px 12px",
      borderRadius: "6px",
      background: "#f3f4f6",
      color: "#6b7280",
      alignSelf: "center",
      fontSize: "11px",
      fontStyle: "italic"
    });
    msgDiv.textContent = content;
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  let isSending = false;

  const sendMessage = async () => {
    const message = textarea.value.trim();
    if (!message || isSending) return;

    isSending = true;
    sendBtn.disabled = true;
    sendBtn.textContent = "送信中...";
    addMessage("user", message);
    textarea.value = "";

    try {
      const response = await new Promise<{
        type: string;
        conversationId?: string;
        response?: string;
        executedSteps?: Step[];
        report?: string;
        message?: string;
      }>((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: MessageType.RunLlmConversation,
            message,
            conversationId,
            history: conversationHistory
          },
          (response) => {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
              reject(lastError);
              return;
            }
            resolve(
              response as {
                type: string;
                conversationId?: string;
                response?: string;
                executedSteps?: Step[];
                report?: string;
                message?: string;
              }
            );
          }
        );
      });

      if (response.type === "error") {
        addMessage("assistant", `エラー: ${response.message || "Unknown error"}`);
      } else {
        conversationId = response.conversationId || conversationId;
        globalConversationId = conversationId;
        if (response.response) {
          addMessage("assistant", response.response);
          conversationHistory.push({ role: "user", content: message });
          conversationHistory.push({ role: "assistant", content: response.response });
          globalConversationHistory = conversationHistory;
        }

        if (response.executedSteps && response.executedSteps.length > 0) {
          executedSteps = response.executedSteps;
          addSystemMessage(`✅ ${response.executedSteps.length}個のステップを実行しました`);
          saveMacroBtn.style.display = "block";
        }

        if (response.report) {
          reportContent = response.report;
          addSystemMessage("📄 レポートが生成されました");
          exportReportBtn.style.display = "block";
        }
      }
    } catch (error) {
      addMessage("assistant", `エラー: ${(error as Error).message}`);
    } finally {
      isSending = false;
      sendBtn.disabled = false;
      sendBtn.textContent = "送信";
    }
  };

  sendBtn.addEventListener("click", sendMessage);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendMessage();
    }
  });

  exportReportBtn.addEventListener("click", () => {
    if (!reportContent) return;
    const blob = new Blob([reportContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flowmacro-report-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    addSystemMessage("📄 レポートをダウンロードしました");
  });

  saveMacroBtn.addEventListener("click", async () => {
    if (executedSteps.length === 0) return;

    const taskName = prompt("マクロ名を入力してください:", `LLM会話: ${conversationHistory[0]?.content.slice(0, 30) || "新規タスク"}`);
    if (!taskName) return;

    try {
      const task: Task = {
        id: randomId("task"),
        name: taskName,
        description: `LLM会話から生成\n\n会話履歴:\n${conversationHistory.map((h) => `${h.role}: ${h.content}`).join("\n\n")}`,
        steps: executedSteps,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };

      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage({ type: MessageType.SaveTask, task }, (response) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            reject(lastError);
            return;
          }
          if (response?.type === "error") {
            reject(new Error(response.message));
            return;
          }
          resolve();
        });
      });

      addSystemMessage(`💾 マクロ「${taskName}」を保存しました`);
      saveMacroBtn.style.display = "none";
    } catch (error) {
      addMessage("assistant", `保存エラー: ${(error as Error).message}`);
    }
  });

  textarea.focus();
  addSystemMessage("会話を開始しました。操作を依頼したり、レポートを生成したりできます。");
}

// 会話状態を復元してダイアログを再表示
function restoreChatDialog(convId: string, hist: Array<{ role: "user" | "assistant"; content: string }>) {
  // グローバル変数に設定
  globalConversationId = convId;
  globalConversationHistory = hist;
  
  if (chatDialogEl) {
    // 既に開いている場合は、メッセージを更新
    const existingMessagesContainer = chatDialogEl.querySelector(`[data-messages="true"]`) as HTMLDivElement | null;
    if (existingMessagesContainer) {
      // 既存のメッセージをクリア
      existingMessagesContainer.innerHTML = "";
      
      // 履歴を再表示
      hist.forEach((msg) => {
        const msgDiv = document.createElement("div");
        const isUser = msg.role === "user";
        const theme = getTheme();
        Object.assign(msgDiv.style, {
          padding: "10px 12px",
          borderRadius: "8px",
          background: isUser ? ACTIVE_COLOR : theme.inputBg,
          color: isUser ? "#fff" : theme.cardText,
          alignSelf: isUser ? "flex-end" : "flex-start",
          maxWidth: "80%",
          fontSize: "13px",
          lineHeight: "1.5",
          whiteSpace: "pre-wrap" as const,
          wordBreak: "break-word" as const
        });
        msgDiv.textContent = msg.content;
        existingMessagesContainer.appendChild(msgDiv);
      });
      
      existingMessagesContainer.scrollTop = existingMessagesContainer.scrollHeight;
    }
    return;
  }
  
  // ダイアログを開く
  openLlmChatDialog();
  
  // メッセージを復元（少し待ってから実行）
  setTimeout(() => {
    if (chatDialogEl) {
      const messagesContainer = chatDialogEl.querySelector(`[data-messages="true"]`) as HTMLDivElement | null;
      if (messagesContainer) {
        // 既存のメッセージをクリア
        messagesContainer.innerHTML = "";
        
        // 履歴を再表示
        hist.forEach((msg) => {
          const msgDiv = document.createElement("div");
          const isUser = msg.role === "user";
          const theme = getTheme();
          Object.assign(msgDiv.style, {
            padding: "10px 12px",
            borderRadius: "8px",
            background: isUser ? ACTIVE_COLOR : theme.inputBg,
            color: isUser ? "#fff" : theme.cardText,
            alignSelf: isUser ? "flex-end" : "flex-start",
            maxWidth: "80%",
            fontSize: "13px",
            lineHeight: "1.5",
            whiteSpace: "pre-wrap" as const,
            wordBreak: "break-word" as const
          });
          msgDiv.textContent = msg.content;
          messagesContainer.appendChild(msgDiv);
        });
        
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }
  }, 200);
}

// メッセージリスナーを追加
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type === MessageType.RestoreChatDialog) {
    restoreChatDialog(message.conversationId, message.history || []);
  }
});

// キーボードショートカット: Cmd/Ctrl + Shift + P (プロンプト), Cmd/Ctrl + Shift + L (チャット)
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.shiftKey) {
    if (event.key === "P" || event.key === "p") {
      event.preventDefault();
      event.stopPropagation();
      openLlmPromptDialog();
      return;
    }
    if (event.key === "L" || event.key === "l") {
      event.preventDefault();
      event.stopPropagation();
      openLlmChatDialog();
      return;
    }
  }
}, true); // capture phaseで登録して、他のリスナーより先に処理


