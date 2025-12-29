export type StepType = "click" | "input" | "wait" | "submit" | "custom-js";

export type SelectorInfo = {
  css?: string;
  xpath?: string;
  textSnapshot?: string;
  attributes?: Record<string, string>;
};

export interface Step {
  id: string;
  name?: string;
  type: StepType;
  selector?: SelectorInfo;
  value?: string;
  waitMs?: number;
  urlPattern?: string;
  meta?: Record<string, unknown>;
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  steps: Step[];
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

export interface Flow {
  id: string;
  name: string;
  description?: string;
  taskIds: string[];
  autoRunUrlPatterns?: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TriggerType = "manual" | "url" | "shortcut";

export interface Trigger {
  id: string;
  type: TriggerType;
  flowId: string;
  urlPattern?: string;
  shortcutName?: string;
  enabled: boolean;
}

export type RunStatus = "success" | "failed" | "partial";

export interface StepRunLog {
  stepId: string;
  stepName?: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string;
  errorMessage?: string;
}

export interface FlowRunLog {
  id: string;
  flowId: string;
  flowName?: string;
  triggeredBy: TriggerType | "direct";
  startedAt: string;
  finishedAt: string;
  status: RunStatus;
  stepLogs: StepRunLog[];
  urlAtStart?: string;
}

export type LlmProvider = "openai" | "custom";

export interface LlmSettings {
  enabled: boolean;
  provider: LlmProvider;
  apiKey?: string;
  endpoint?: string; // custom endpointやOpenAI互換エンドポイント
  model?: string;
}


