import { describe, expect, it, beforeEach, vi } from "vitest";
import type { ConversationState } from "../src/background/storage";
import { getConversationStates, saveConversationState, deleteConversationState } from "../src/background/storage";

// chrome.storage.localをモック
const mockStorage: Record<string, unknown> = {};

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: vi.fn((keys: string | string[], callback: (result: Record<string, unknown>) => void) => {
        if (typeof keys === "string") {
          callback({ [keys]: mockStorage[keys] || null });
        } else {
          const result: Record<string, unknown> = {};
          keys.forEach((key) => {
            result[key] = mockStorage[key] || null;
          });
          callback(result);
        }
      }),
      set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
        Object.assign(mockStorage, items);
        if (callback) callback();
      }),
      remove: vi.fn((keys: string | string[], callback?: () => void) => {
        if (typeof keys === "string") {
          delete mockStorage[keys];
        } else {
          keys.forEach((key) => delete mockStorage[key]);
        }
        if (callback) callback();
      })
    }
  }
});

describe("会話状態の永続化", () => {
  beforeEach(() => {
    // 各テスト前にストレージをクリア
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  });

  it("会話状態が保存・取得できる", async () => {
    const testState: ConversationState = {
      conversationId: "test-conv-123",
      history: [
        { role: "user", content: "テストメッセージ" },
        { role: "assistant", content: "テスト応答" }
      ],
      tabId: 1,
      isActive: true
    };

    // 保存
    await saveConversationState(testState);

    // 取得
    const states = await getConversationStates();
    expect(states).toHaveLength(1);
    expect(states[0].conversationId).toBe("test-conv-123");
    expect(states[0].history).toHaveLength(2);
    expect(states[0].isActive).toBe(true);
  });

  it("複数の会話状態を保存・取得できる", async () => {
    const state1: ConversationState = {
      conversationId: "conv-1",
      history: [{ role: "user", content: "メッセージ1" }],
      tabId: 1,
      isActive: true
    };

    const state2: ConversationState = {
      conversationId: "conv-2",
      history: [{ role: "user", content: "メッセージ2" }],
      tabId: 2,
      isActive: false
    };

    await saveConversationState(state1);
    await saveConversationState(state2);

    const states = await getConversationStates();
    expect(states).toHaveLength(2);
    expect(states.find((s) => s.conversationId === "conv-1")).toBeDefined();
    expect(states.find((s) => s.conversationId === "conv-2")).toBeDefined();
  });

  it("会話状態の更新が正しく動作する", async () => {
    const initialState: ConversationState = {
      conversationId: "conv-update",
      history: [{ role: "user", content: "初期メッセージ" }],
      tabId: 1,
      isActive: true
    };

    await saveConversationState(initialState);

    // 履歴を更新
    const updatedState: ConversationState = {
      ...initialState,
      history: [
        ...initialState.history,
        { role: "assistant", content: "更新された応答" }
      ]
    };

    await saveConversationState(updatedState);

    const states = await getConversationStates();
    expect(states).toHaveLength(1);
    expect(states[0].history).toHaveLength(2);
    expect(states[0].history[1].content).toBe("更新された応答");
  });

  it("会話状態の削除が正しく動作する", async () => {
    const state1: ConversationState = {
      conversationId: "conv-delete-1",
      history: [{ role: "user", content: "メッセージ1" }],
      tabId: 1,
      isActive: true
    };

    const state2: ConversationState = {
      conversationId: "conv-delete-2",
      history: [{ role: "user", content: "メッセージ2" }],
      tabId: 2,
      isActive: true
    };

    await saveConversationState(state1);
    await saveConversationState(state2);

    // 1つ削除
    await deleteConversationState("conv-delete-1");

    const states = await getConversationStates();
    expect(states).toHaveLength(1);
    expect(states[0].conversationId).toBe("conv-delete-2");
  });

  it("存在しない会話状態の削除はエラーにならない", async () => {
    await expect(deleteConversationState("non-existent")).resolves.not.toThrow();
  });

  it("空のストレージから取得すると空配列が返る", async () => {
    const states = await getConversationStates();
    expect(states).toEqual([]);
  });
});



