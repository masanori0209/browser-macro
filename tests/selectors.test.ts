import { describe, expect, it } from "vitest";
import { buildSelectorInfo } from "../src/content/selectors";

describe("buildSelectorInfo", () => {
  it("優先して id ベースの CSS セレクタを返す", () => {
    const btn = document.createElement("button");
    btn.id = "submit-btn";
    btn.textContent = "送信";
    document.body.appendChild(btn);

    const info = buildSelectorInfo(btn);
    expect(info.css).toBe("#submit-btn");
    expect(info.xpath?.startsWith("/html")).toBe(true);
    expect(info.textSnapshot).toContain("送信");
  });

  it("data-testid を拾う", () => {
    const input = document.createElement("input");
    input.setAttribute("data-testid", "email");
    document.body.appendChild(input);

    const info = buildSelectorInfo(input);
    expect(info.css).toBe('[data-testid="email"]');
  });
});

