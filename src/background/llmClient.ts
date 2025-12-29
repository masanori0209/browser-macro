import type { FlowRunLog, LlmSettings, Step, Task } from "../shared/models";
import { getLlmSettings } from "./storage";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";

async function loadSettings(): Promise<LlmSettings> {
  const settings = (await getLlmSettings()) ?? {
    enabled: false,
    provider: "openai",
    apiKey: "",
    endpoint: DEFAULT_ENDPOINT,
    model: DEFAULT_MODEL
  };
  return {
    endpoint: DEFAULT_ENDPOINT,
    model: DEFAULT_MODEL,
    ...settings
  };
}

async function callLlm(messages: ChatMessage[], settingsOverride?: Partial<LlmSettings>): Promise<string> {
  const settings = { ...(await loadSettings()), ...settingsOverride };
  if (!settings.enabled) {
    throw new Error("LLM 機能が無効です");
  }
  if (!settings.apiKey) {
    throw new Error("LLM APIキーが設定されていません");
  }

  const endpoint = settings.endpoint || DEFAULT_ENDPOINT;
  const model = settings.model || DEFAULT_MODEL;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({ model, messages, temperature: 0.2 })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM API error: ${response.status} ${text}`);
  }

  const json = await response.json();
  return json?.choices?.[0]?.message?.content ?? "";
}

export async function suggestSelectors(step: Step, domNote?: string) {
  const prompt = `以下の要素情報から、より安定した CSS/XPath セレクタを簡潔に提案してください。
現在のセレクタ: ${JSON.stringify(step.selector)}
テキスト: ${step.selector?.textSnapshot || ""}
DOMヒント: ${domNote || ""}
JSONで { "css": "...", "xpath": "..." } の形式で返してください。`;
  const result = await callLlm([{ role: "user", content: prompt }]);
  return result;
}

export async function generateTaskFromText(
  input: string,
  url?: string,
  domInfo?: { url: string; title: string; clickableElements: unknown[]; inputElements: unknown[] } | null
) {
  let domContext = "";
  if (domInfo) {
    const clickableSummary = (domInfo.clickableElements as Array<{ tag?: string; text?: string; selector?: string; attributes?: Record<string, string> }>)
      .slice(0, 20)
      .map((el) => {
        const attrs = el.attributes || {};
        const attrsStr = Object.entries(attrs)
          .map(([k, v]) => `${k}="${v}"`)
          .join(" ");
        return `- ${el.tag || "unknown"}: セレクタ="${el.selector || "unknown"}", テキスト="${(el.text || "").slice(0, 50)}", ${attrsStr}`;
      })
      .join("\n");
    const inputSummary = (domInfo.inputElements as Array<{ tag?: string; placeholder?: string; name?: string; type?: string; selector?: string }>)
      .slice(0, 15)
      .map((el) => {
        return `- ${el.tag || "input"}: セレクタ="${el.selector || "unknown"}", name="${el.name || ""}", placeholder="${el.placeholder || ""}", type="${el.type || "text"}"`;
      })
      .join("\n");
    domContext = `
現在のページ情報:
- URL: ${domInfo.url}
- タイトル: ${domInfo.title}

クリック可能な要素（主要なもの）:
${clickableSummary}

入力要素:
${inputSummary}

重要: 上記の実際のページ要素を参照して、正確なセレクタを使用してください。`;
  }

  const prompt = `以下の自然文をもとにブラウザ操作タスクのステップ配列を生成してください。
指示: ${input}
開始URL: ${url || "未指定"}${domContext}

Step型の定義:
{
  "id": "step-xxx",
  "name": "ステップ名（任意）",
  "type": "click" | "input" | "wait" | "submit" | "custom-js",
  "selector": {
    "css": "CSSセレクタ（例: button.submit, #search-input）",
    "xpath": "XPath（任意）",
    "textSnapshot": "要素のテキスト（任意）"
  },
  "value": "入力値（type=inputの場合）",
  "waitMs": 500,
  "urlPattern": "URLパターン（任意）",
  "meta": {}
}

重要:
- 必ずJSON形式で返してください
- 配列形式で返すか、{"steps": [...]} の形式で返してください
- selector.css は具体的で安定したセレクタを使用してください（例: button[type="submit"], input[name="q"]）
- 各ステップの間に wait ステップを適切に挿入してください（ページ読み込み待ちなど）

例:
指示: "GoogleでTypeScriptを検索"
応答:
{
  "steps": [
    {"id": "s1", "type": "input", "selector": {"css": "input[name='q']"}, "value": "TypeScript"},
    {"id": "s2", "type": "wait", "waitMs": 300},
    {"id": "s3", "type": "click", "selector": {"css": "input[type='submit'][name='btnK']"}}
  ]
}`;
  const result = await callLlm([{ role: "user", content: prompt }]);
  return result;
}

export async function summarizeRunLog(log: FlowRunLog) {
  const prompt = `次の実行ログを要約し、失敗原因の候補を短く示してください。
${JSON.stringify(log, null, 2)}`;
  const result = await callLlm([{ role: "user", content: prompt }]);
  return result;
}

export async function runConversation(
  userMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  url?: string,
  domInfo?: { url: string; title: string; clickableElements: unknown[]; inputElements: unknown[] } | null
): Promise<{ response: string; action?: { type: "execute" | "report"; steps?: Step[]; reportContent?: string } }> {
  let domContext = "";
  if (domInfo) {
    const clickableSummary = (domInfo.clickableElements as Array<{ tag?: string; text?: string; selector?: string; attributes?: Record<string, string> }>)
      .slice(0, 20)
      .map((el) => {
        const attrs = el.attributes || {};
        const attrsStr = Object.entries(attrs)
          .map(([k, v]) => `${k}="${v}"`)
          .join(" ");
        return `- ${el.tag || "unknown"}: セレクタ="${el.selector || "unknown"}", テキスト="${(el.text || "").slice(0, 50)}", ${attrsStr}`;
      })
      .join("\n");
    const inputSummary = (domInfo.inputElements as Array<{ tag?: string; placeholder?: string; name?: string; type?: string; selector?: string }>)
      .slice(0, 15)
      .map((el) => {
        return `- ${el.tag || "input"}: セレクタ="${el.selector || "unknown"}", name="${el.name || ""}", placeholder="${el.placeholder || ""}", type="${el.type || "text"}"`;
      })
      .join("\n");
    domContext = `
現在のページ情報:
- URL: ${domInfo.url}
- タイトル: ${domInfo.title}

クリック可能な要素（主要なもの）:
${clickableSummary}

入力要素:
${inputSummary}`;
  }

  const currentYear = new Date().getFullYear();
  const systemPrompt = `あなたはブラウザ自動操作アシスタントです。ユーザーの指示を分析し、適切に応答してください。

【重要】判断ルール:
1. ユーザーの依頼が以下のいずれかに該当する場合は、必ずWeb操作を実行してください:
   - 最新情報や現在の情報が必要（「今年」「2025年」「最新」など）
   - 調査や検索が必要（「調べて」「調査して」「検索して」など）
   - レポートやまとめが必要（「レポート」「まとめて」など）
   - 特定のWebサイトの情報が必要
   - 知識ベースにない情報や最新の情報が必要

2. ユーザーの依頼が単純な質問や会話の場合は、直接回答しても構いません:
   - 一般的な知識の質問
   - 操作方法の説明
   - 確認や質問への回答

3. ユーザーの意図が不明確な場合は、確認の質問をしてください。

現在のページ: ${url || "未指定"}${domContext}

現在の日付: ${currentYear}年

応答形式:
1. Web操作が必要な場合:
   {"action": "execute", "steps": [{"id": "s1", "type": "click", "selector": {"css": "..."}, ...}]}
   
   例: 「給与の年度改正を調べて」と言われた場合:
   - ステップ1: Google検索ボックスに「給与 年度改正 ${currentYear}」と入力
   - ステップ2: 検索ボタンをクリック
   - ステップ3: 検索結果をクリックして情報を取得
   - ステップ4: 必要に応じて複数のページを閲覧

2. レポート生成が必要な場合（Web操作後）:
   {"action": "report", "content": "レポート内容..."}
   
   注意: レポートは必ずWeb操作で取得した実際の情報を基に生成してください。

3. 直接回答で良い場合:
   通常のテキストで返答してください（JSON形式は使わない）

4. 確認が必要な場合:
   通常のテキストで確認の質問をしてください（JSON形式は使わない）

重要:
- Web操作が必要かどうかは、ユーザーの依頼内容を分析して判断してください。
- 操作を実行する場合は、必ず実際のページ要素を参照して正確なセレクタを使用してください。
- 検索が必要な場合は、必ずGoogleなどの検索エンジンで検索を実行してください。
- 最新情報が必要な場合は、必ず現在の日付（${currentYear}年）を含む検索クエリを使用してください。
- JSON形式で返す場合は、必ず有効なJSONとして返してください。`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage }
  ];

  const response = await callLlm(messages);
  
  // JSON形式のアクションを抽出
  let hasAction = false;
  try {
    const jsonMatch = response.match(/\{[\s\S]*"action"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.action === "execute" && parsed.steps) {
        hasAction = true;
        return { response, action: { type: "execute", steps: parsed.steps } };
      } else if (parsed.action === "report" && parsed.content) {
        hasAction = true;
        return { response, action: { type: "report", reportContent: parsed.content } };
      }
    }
  } catch (e) {
    // JSON解析失敗時は通常のテキスト応答として扱う
  }

  // JSON形式のアクションがない場合、LLMに判断を促す
  if (!hasAction) {
    const judgmentPrompt = `ユーザーの依頼「${userMessage}」を分析してください。

この依頼は以下のいずれかに該当しますか？
1. 最新情報や現在の情報が必要（「今年」「2025年」「最新」など）
2. 調査や検索が必要（「調べて」「調査して」「検索して」など）
3. レポートやまとめが必要（「レポート」「まとめて」など）
4. 特定のWebサイトの情報が必要
5. 知識ベースにない情報や最新の情報が必要

該当する場合は、必ずWeb操作を実行してください。JSON形式で操作ステップを返してください:
{"action": "execute", "steps": [...]}

該当しない場合は、そのまま応答を続けてください。`;
    
    const judgmentMessages: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: response },
      { role: "user", content: judgmentPrompt }
    ];
    
    const judgmentResponse = await callLlm(judgmentMessages);
    
    // 判断応答からJSONを抽出
    try {
      const jsonMatch = judgmentResponse.match(/\{[\s\S]*"action"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.action === "execute" && parsed.steps) {
          return { response: `${response}\n\n[Web操作を実行します]`, action: { type: "execute", steps: parsed.steps } };
        }
      }
    } catch (e) {
      // JSON解析失敗時は通常のテキスト応答として扱う
    }
  }

  return { response };
}

