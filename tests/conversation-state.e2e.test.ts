import { test, expect, chromium } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

test.describe("会話状態の永続化", () => {
  test("会話状態がchrome.storageに保存・取得できる", async () => {
    const extensionPath = path.resolve(__dirname, "../dist");
    if (!fs.existsSync(extensionPath)) {
      test.skip();
      return;
    }

    const context = await chromium.launchPersistentContext("/tmp/playwright-test", {
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });

    try {
      const page = await context.newPage();
      await page.goto("about:blank");

      // 会話状態を保存
      await page.evaluate(async () => {
        const testState = {
          conversationId: "test-conv-123",
          history: [
            { role: "user" as const, content: "テストメッセージ" },
            { role: "assistant" as const, content: "テスト応答" }
          ],
          tabId: 1,
          isActive: true
        };

        return new Promise<void>((resolve) => {
          chrome.storage.local.get("conversationStates", (result) => {
            const states = result.conversationStates || [];
            const index = states.findIndex((s: any) => s.conversationId === testState.conversationId);
            if (index >= 0) {
              states[index] = testState;
            } else {
              states.push(testState);
            }
            chrome.storage.local.set({ conversationStates: states }, () => {
              resolve();
            });
          });
        });
      });

      // 会話状態を取得
      const retrievedState = await page.evaluate(async (convId) => {
        return new Promise((resolve) => {
          chrome.storage.local.get("conversationStates", (result) => {
            const states = result.conversationStates || [];
            const found = states.find((s: any) => s.conversationId === convId);
            resolve(found);
          });
        });
      }, "test-conv-123");

      expect(retrievedState).toBeDefined();
      expect((retrievedState as any)?.conversationId).toBe("test-conv-123");
      expect((retrievedState as any)?.history).toHaveLength(2);
      expect((retrievedState as any)?.isActive).toBe(true);
    } finally {
      await context.close();
    }
  });

  test("会話状態がページ遷移後も保持される", async () => {
    const extensionPath = path.resolve(__dirname, "../dist");
    if (!fs.existsSync(extensionPath)) {
      test.skip();
      return;
    }

    const context = await chromium.launchPersistentContext("/tmp/playwright-test-2", {
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });

    try {
      const page = await context.newPage();
      await page.goto("https://www.google.com");

      // 会話状態を保存
      await page.evaluate(async () => {
        const testState = {
          conversationId: "test-nav-456",
          history: [
            { role: "user" as const, content: "ページ遷移テスト" }
          ],
          tabId: 1,
          isActive: true
        };

        return new Promise<void>((resolve) => {
          chrome.storage.local.get("conversationStates", (result) => {
            const states = result.conversationStates || [];
            states.push(testState);
            chrome.storage.local.set({ conversationStates: states }, () => {
              resolve();
            });
          });
        });
      });

      // ページ遷移
      await page.goto("https://www.google.com/search?q=test");

      // 会話状態が保持されているか確認
      const statesAfterNavigation = await page.evaluate(async () => {
        return new Promise((resolve) => {
          chrome.storage.local.get("conversationStates", (result) => {
            resolve(result.conversationStates || []);
          });
        });
      });

      expect(Array.isArray(statesAfterNavigation)).toBe(true);
      const testState = (statesAfterNavigation as any[]).find(
        (s: any) => s.conversationId === "test-nav-456"
      );
      expect(testState).toBeDefined();
      expect(testState?.history).toHaveLength(1);
      expect(testState?.isActive).toBe(true);
    } finally {
      await context.close();
    }
  });

  test("会話状態の更新が正しく動作する", async () => {
    const extensionPath = path.resolve(__dirname, "../dist");
    if (!fs.existsSync(extensionPath)) {
      test.skip();
      return;
    }

    const context = await chromium.launchPersistentContext("/tmp/playwright-test-2", {
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });

    try {
      const page = await context.newPage();
      await page.goto("about:blank");

      const convId = "test-update-789";

      // 初期状態を保存
      await page.evaluate(async (id) => {
        const testState = {
          conversationId: id,
          history: [{ role: "user" as const, content: "初期メッセージ" }],
          tabId: 1,
          isActive: true
        };

        return new Promise<void>((resolve) => {
          chrome.storage.local.get("conversationStates", (result) => {
            const states = result.conversationStates || [];
            states.push(testState);
            chrome.storage.local.set({ conversationStates: states }, () => {
              resolve();
            });
          });
        });
      }, convId);

      // 会話履歴を更新
      await page.evaluate(async (id) => {
        return new Promise<void>((resolve) => {
          chrome.storage.local.get("conversationStates", (result) => {
            const states = result.conversationStates || [];
            const index = states.findIndex((s: any) => s.conversationId === id);
            if (index >= 0) {
              states[index].history.push({
                role: "assistant" as const,
                content: "更新された応答"
              });
              chrome.storage.local.set({ conversationStates: states }, () => {
                resolve();
              });
            } else {
              resolve();
            }
          });
        });
      }, convId);

      // 更新後の状態を確認
      const updatedState = await page.evaluate(async (id) => {
        return new Promise((resolve) => {
          chrome.storage.local.get("conversationStates", (result) => {
            const states = result.conversationStates || [];
            const found = states.find((s: any) => s.conversationId === id);
            resolve(found);
          });
        });
      }, convId);

      expect(updatedState).toBeDefined();
      expect((updatedState as any)?.history).toHaveLength(2);
      expect((updatedState as any)?.history[1].content).toBe("更新された応答");
    } finally {
      await context.close();
    }
  });
});


