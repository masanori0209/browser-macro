// エントリーポイント：録画・実行の両方を初期化
import "./recorder";
import "./executor";
import { MessageType } from "../shared/messageTypes";

// DOM情報を取得する関数
function getPageDomInfo(): {
  url: string;
  title: string;
  clickableElements: Array<{ tag: string; text: string; selector: string; attributes: Record<string, string> }>;
  inputElements: Array<{ tag: string; placeholder: string; name: string; type: string; selector: string }>;
} {
  const clickableElements: Array<{ tag: string; text: string; selector: string; attributes: Record<string, string> }> = [];
  const inputElements: Array<{ tag: string; placeholder: string; name: string; type: string; selector: string }> = [];

  // クリック可能な要素を収集
  const clickableSelectors = ["button", "a", "[role='button']", "[onclick]", "[tabindex='0']"];
  clickableSelectors.forEach((sel) => {
    try {
      document.querySelectorAll(sel).forEach((el) => {
        if (el instanceof HTMLElement) {
          const text = (el.textContent || "").trim().slice(0, 100);
          const attrs: Record<string, string> = {};
          Array.from(el.attributes).forEach((attr) => {
            if (["id", "class", "name", "type", "role", "aria-label"].includes(attr.name)) {
              attrs[attr.name] = attr.value;
            }
          });
          let selector = "";
          if (el.id) selector = `#${el.id}`;
          else if (el.className && typeof el.className === "string") {
            const classes = el.className.split(" ").filter(Boolean).slice(0, 2);
            selector = `${el.tagName.toLowerCase()}${classes.map((c) => `.${c}`).join("")}`;
          } else {
            selector = el.tagName.toLowerCase();
          }
          clickableElements.push({ tag: el.tagName.toLowerCase(), text, selector, attributes: attrs });
        }
      });
    } catch (e) {
      // ignore
    }
  });

  // 入力要素を収集
  try {
    document.querySelectorAll("input, textarea, select").forEach((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        const attrs: Record<string, string> = {};
        Array.from(el.attributes).forEach((attr) => {
          if (["id", "class", "name", "type", "placeholder"].includes(attr.name)) {
            attrs[attr.name] = attr.value;
          }
        });
        let selector = "";
        if (el.id) selector = `#${el.id}`;
        else if (el.name) selector = `${el.tagName.toLowerCase()}[name='${el.name}']`;
        else if (el.className && typeof el.className === "string") {
          const classes = el.className.split(" ").filter(Boolean).slice(0, 2);
          selector = `${el.tagName.toLowerCase()}${classes.map((c) => `.${c}`).join("")}`;
        } else {
          selector = el.tagName.toLowerCase();
        }
        inputElements.push({
          tag: el.tagName.toLowerCase(),
          placeholder: el instanceof HTMLInputElement ? el.placeholder || "" : "",
          name: el.name || "",
          type: el instanceof HTMLInputElement ? el.type || "text" : "textarea",
          selector
        });
      }
    });
  } catch (e) {
    // ignore
  }

  return {
    url: window.location.href,
    title: document.title,
    clickableElements: clickableElements.slice(0, 50), // 最初の50個まで
    inputElements: inputElements.slice(0, 30) // 最初の30個まで
  };
}

// DOM情報取得メッセージを処理
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === MessageType.GetPageDomInfo) {
    try {
      const domInfo = getPageDomInfo();
      sendResponse({ type: "pageDomInfo", data: domInfo });
    } catch (error) {
      sendResponse({ type: "error", message: (error as Error).message });
    }
    return true;
  }
  
  if (message.type === MessageType.GetPageContent) {
    try {
      // ページの主要なテキストコンテンツを取得
      const mainContent = document.querySelector("main, article, [role='main'], .content, #content") || document.body;
      const textContent = mainContent.textContent || "";
      const title = document.title;
      const url = window.location.href;
      
      // テキストを整理（余分な空白を削除）
      const cleanedText = textContent
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, 500) // 最初の500行まで
        .join("\n");
      
      sendResponse({
        type: "pageContent",
        data: {
          url,
          title,
          content: cleanedText.slice(0, 10000) // 最大10000文字
        }
      });
    } catch (error) {
      sendResponse({ type: "error", message: (error as Error).message });
    }
    return true;
  }
});
import "./highlighter";


