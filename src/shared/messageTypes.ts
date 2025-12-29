import type { Flow, FlowRunLog, LlmSettings, Step, Task, Trigger } from "./models";

export enum MessageType {
  StartRecording = "START_RECORDING",
  StopRecording = "STOP_RECORDING",
  RecordStep = "RECORD_STEP",
  GetTasks = "GET_TASKS",
  SaveTask = "SAVE_TASK",
  DeleteTask = "DELETE_TASK",
  GetFlows = "GET_FLOWS",
  SaveFlow = "SAVE_FLOW",
  DeleteFlow = "DELETE_FLOW",
  RunFlow = "RUN_FLOW",
  GetTriggers = "GET_TRIGGERS",
  SaveTrigger = "SAVE_TRIGGER",
  DeleteTrigger = "DELETE_TRIGGER",
  ExecuteStep = "EXECUTE_STEP",
  StepResult = "STEP_RESULT",
  GetState = "GET_STATE",
  GetLogs = "GET_LOGS",
  ExportData = "EXPORT_DATA",
  ImportData = "IMPORT_DATA",
  GetLlmSettings = "GET_LLM_SETTINGS",
  SaveLlmSettings = "SAVE_LLM_SETTINGS",
  RunLlmPrompt = "RUN_LLM_PROMPT",
  GetPageDomInfo = "GET_PAGE_DOM_INFO",
  RunLlmConversation = "RUN_LLM_CONVERSATION",
  RestoreChatDialog = "RESTORE_CHAT_DIALOG",
  GetConversationState = "GET_CONVERSATION_STATE",
  GetPageContent = "GET_PAGE_CONTENT",
  GetConversationStates = "GET_CONVERSATION_STATES",
  DeleteConversationState = "DELETE_CONVERSATION_STATE"
}

export interface ImportExportPayload {
  version: number;
  tasks: Task[];
  flows: Flow[];
  triggers: Trigger[];
}

export interface StartRecordingMessage {
  type: MessageType.StartRecording;
}

export interface StopRecordingMessage {
  type: MessageType.StopRecording;
  taskName?: string;
  description?: string;
}

export interface RecordStepMessage {
  type: MessageType.RecordStep;
  step: Step;
}

export interface GetTasksMessage {
  type: MessageType.GetTasks;
}

export interface SaveTaskMessage {
  type: MessageType.SaveTask;
  task: Task;
}

export interface DeleteTaskMessage {
  type: MessageType.DeleteTask;
  taskId: string;
}

export interface GetFlowsMessage {
  type: MessageType.GetFlows;
}

export interface SaveFlowMessage {
  type: MessageType.SaveFlow;
  flow: Flow;
}

export interface DeleteFlowMessage {
  type: MessageType.DeleteFlow;
  flowId: string;
}

export interface GetTriggersMessage {
  type: MessageType.GetTriggers;
}

export interface SaveTriggerMessage {
  type: MessageType.SaveTrigger;
  trigger: Trigger;
}

export interface DeleteTriggerMessage {
  type: MessageType.DeleteTrigger;
  triggerId: string;
}

export interface RunFlowMessage {
  type: MessageType.RunFlow;
  flowId: string;
  tabId?: number;
}

export interface ExecuteStepMessage {
  type: MessageType.ExecuteStep;
  step: Step;
}

export interface StepResultMessage {
  type: MessageType.StepResult;
  stepId: string;
  success: boolean;
  errorMessage?: string;
}

export interface GetStateMessage {
  type: MessageType.GetState;
}

export interface GetLogsMessage {
  type: MessageType.GetLogs;
}

export interface ExportDataMessage {
  type: MessageType.ExportData;
}

export interface ImportDataMessage {
  type: MessageType.ImportData;
  payload: ImportExportPayload;
  mode?: "merge" | "replace";
}

export interface GetLlmSettingsMessage {
  type: MessageType.GetLlmSettings;
}

export interface SaveLlmSettingsMessage {
  type: MessageType.SaveLlmSettings;
  settings: LlmSettings;
}

export interface RunLlmPromptMessage {
  type: MessageType.RunLlmPrompt;
  prompt: string;
  taskName?: string;
  description?: string;
}

export interface GetPageDomInfoMessage {
  type: MessageType.GetPageDomInfo;
}

export interface RunLlmConversationMessage {
  type: MessageType.RunLlmConversation;
  message: string;
  conversationId?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface GetConversationStatesMessage {
  type: MessageType.GetConversationStates;
}

export interface DeleteConversationStateMessage {
  type: MessageType.DeleteConversationState;
  conversationId: string;
}

export type BackgroundRequestMessage =
  | StartRecordingMessage
  | StopRecordingMessage
  | RecordStepMessage
  | GetTasksMessage
  | SaveTaskMessage
  | DeleteTaskMessage
  | GetFlowsMessage
  | SaveFlowMessage
  | DeleteFlowMessage
  | RunFlowMessage
  | GetStateMessage
  | GetLogsMessage
  | GetTriggersMessage
  | SaveTriggerMessage
  | DeleteTriggerMessage
  | ExportDataMessage
  | ImportDataMessage
  | GetLlmSettingsMessage
  | SaveLlmSettingsMessage
  | RunLlmPromptMessage
  | RunLlmConversationMessage
  | GetConversationStatesMessage
  | DeleteConversationStateMessage;

export type ContentRequestMessage = ExecuteStepMessage;

export type BackgroundResponse =
  | { type: "ok"; data?: unknown }
  | { type: "error"; message: string }
  | { type: "tasks"; tasks: Task[] }
  | { type: "flows"; flows: Flow[] }
  | { type: "logs"; logs: FlowRunLog[] }
  | { type: "triggers"; triggers: Trigger[] }
  | { type: "export"; data: ImportExportPayload }
  | { type: "llmSettings"; settings: LlmSettings | null }
  | { type: "state"; recording: boolean }
  | { type: "llmTask"; task: Task }
  | { type: "llmConversation"; conversationId: string; response: string; executedSteps?: Step[]; report?: string }
  | { type: "conversationStates"; states: Array<{ conversationId: string; history: Array<{ role: "user" | "assistant"; content: string }>; tabId: number; isActive: boolean }> };


