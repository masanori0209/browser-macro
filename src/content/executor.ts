import type { SelectorInfo, Step } from "../shared/models";
import { MessageType, type ExecuteStepMessage, type StepResultMessage } from "../shared/messageTypes";

function findByCss(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch (error) {
    console.warn("Invalid CSS selector", selector, error);
    return null;
  }
}

function findByXPath(xpath?: string): Element | null {
  if (!xpath) return null;
  try {
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    return result.singleNodeValue as Element | null;
  } catch (error) {
    console.warn("Invalid XPath", xpath, error);
    return null;
  }
}

function resolveElement(selector?: SelectorInfo): Element | null {
  if (!selector) return null;
  return selector.css ? findByCss(selector.css) : findByXPath(selector.xpath);
}

async function waitForElement(selector?: SelectorInfo, attempts = 5, intervalMs = 500): Promise<Element | null> {
  if (!selector) return null;
  for (let i = 0; i < attempts; i++) {
    const el = resolveElement(selector);
    if (el) return el;
    if (i < attempts - 1) {
      await waitMs(intervalMs);
    }
  }
  return null;
}

async function waitMs(ms = 500): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runStep(step: Step): Promise<void> {
  // 任意のステップ実行前に待機を挟めるようにする
  if (step.waitMs && step.waitMs > 0) {
    await waitMs(step.waitMs);
  }
  switch (step.type) {
    case "wait":
      await waitMs(step.waitMs ?? 500);
      return;
    case "click": {
      const el = await waitForElement(step.selector);
      if (!el) {
        const selectorStr = step.selector?.css || step.selector?.xpath || "unknown";
        throw new Error(`Element not found for click. Selector: ${selectorStr}`);
      }
      (el as HTMLElement).click();
      return;
    }
    case "input": {
      const el = (await waitForElement(step.selector)) as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el) {
        const selectorStr = step.selector?.css || step.selector?.xpath || "unknown";
        throw new Error(`Element not found for input. Selector: ${selectorStr}`);
      }
      el.focus();
      el.value = step.value ?? "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    case "submit": {
      const el = (await waitForElement(step.selector)) as HTMLFormElement | HTMLElement | null;
      if (!el) throw new Error("Element not found for submit");
      if (el instanceof HTMLFormElement) {
        el.requestSubmit();
      } else {
        el.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
      return;
    }
    case "custom-js": {
      const script = step.meta?.script as string | undefined;
      if (!script) throw new Error("No custom script provided");
      // eslint-disable-next-line no-new-func
      const fn = new Function(script);
      fn();
      return;
    }
    default:
      throw new Error(`Unsupported step type: ${step.type}`);
  }
}

chrome.runtime.onMessage.addListener((message: ExecuteStepMessage, _sender, sendResponse) => {
  if (message.type !== MessageType.ExecuteStep) return;
  (async () => {
    const response: StepResultMessage = {
      type: MessageType.StepResult,
      stepId: message.step.id,
      success: true
    };
    try {
      await runStep(message.step);
    } catch (error) {
      response.success = false;
      response.errorMessage = (error as Error).message;
    }
    sendResponse(response);
  })();
  return true;
});


