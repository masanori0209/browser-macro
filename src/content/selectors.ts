import type { SelectorInfo } from "../shared/models";

function hasUniqueId(el: Element): string | null {
  const id = el.getAttribute("id");
  if (id && document.querySelectorAll(`#${CSS.escape(id)}`).length === 1) {
    return `#${CSS.escape(id)}`;
  }
  return null;
}

function dataTestId(el: Element): string | null {
  const testId = el.getAttribute("data-testid") || el.getAttribute("data-test");
  if (testId) {
    return `[data-testid="${testId}"]`;
  }
  return null;
}

function fallbackCss(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body && parts.length < 5) {
    const tag = current.tagName.toLowerCase();
    const className = (current.getAttribute("class") || "")
      .split(" ")
      .filter(Boolean)
      .map((c) => `.${CSS.escape(c)}`)
      .join("");
    const siblings = current.parentElement?.children || [];
    const index = Array.from(siblings).indexOf(current) + 1;
    const nth = siblings.length > 1 ? `:nth-child(${index})` : "";
    parts.unshift(`${tag}${className}${nth}`);
    current = current.parentElement;
  }
  return parts.join(" > ");
}

function buildXPath(el: Element): string {
  if (el === document.body) return "/html/body";
  const segments: string[] = [];
  let current: Element | null = el;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const index =
      current.parentElement != null
        ? Array.from(current.parentElement.children).filter((child) => child.tagName === current!.tagName).indexOf(current) + 1
        : 1;
    segments.unshift(`${current.tagName.toLowerCase()}[${index}]`);
    current = current.parentElement;
  }
  return `/${segments.join("/")}`;
}

export function buildSelectorInfo(el: Element): SelectorInfo {
  const css = hasUniqueId(el) || dataTestId(el) || fallbackCss(el);
  const xpath = buildXPath(el);
  const textSnapshot = (el.textContent || "").trim().slice(0, 200);
  const attributes: Record<string, string> = {};
  Array.from(el.attributes).forEach((attr) => {
    if (attr.name.startsWith("data-")) {
      attributes[attr.name] = attr.value;
    }
  });
  return { css, xpath, textSnapshot, attributes };
}


