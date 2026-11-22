// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { bindFilters } from "../../src/scripts/filter-ui";

describe("bindFilters", () => {
  it("filters by priority, shows the zero state, and resets both dimensions", () => {
    window.history.replaceState(null, "", "/archive/");
    document.body.innerHTML = `
      <div data-filter-root>
        <div class="filters">
          <button type="button" data-topic="all" aria-pressed="true">全部</button>
          <button type="button" data-topic="采购信号" aria-pressed="false">采购信号</button>
          <button type="button" data-topic="社区讨论" aria-pressed="false">社区讨论</button>
          <button type="button" data-priority="all" aria-pressed="true">全部</button>
          <button type="button" data-priority="P0" aria-pressed="false">P0</button>
          <button type="button" data-priority="P2" aria-pressed="false">P2</button>
          <button type="button" data-reset>重置</button>
        </div>
        <p data-count aria-live="polite"></p>
        <p data-empty hidden>没有同时符合当前主题与优先级的示例。</p>
        <ul>
          <li data-card data-priority="P0" data-topics="采购信号">采购</li>
          <li data-card data-priority="P2" data-topics="社区讨论">讨论</li>
        </ul>
      </div>
    `;

    bindFilters();

    const p0Card = document.querySelector<HTMLElement>('[data-card][data-priority="P0"]');
    const p2Card = document.querySelector<HTMLElement>('[data-card][data-priority="P2"]');
    const empty = document.querySelector<HTMLElement>("[data-empty]");
    const p0Button = document.querySelector<HTMLButtonElement>('button[data-priority="P0"]');
    const topicButton = document.querySelector<HTMLButtonElement>('button[data-topic="社区讨论"]');
    const reset = document.querySelector<HTMLButtonElement>("[data-reset]");
    if (!p0Card || !p2Card || !empty || !p0Button || !topicButton || !reset) {
      throw new Error("filter fixture is missing a required element");
    }

    p0Button.click();
    expect(p2Card.hidden).toBe(true);
    expect(p0Card.hidden).toBe(false);
    expect(p0Button.getAttribute("aria-pressed")).toBe("true");
    expect(new URLSearchParams(window.location.search).get("priority")).toBe("P0");

    topicButton.click();
    expect(empty.hidden).toBe(false);
    expect(p0Card.hidden).toBe(true);
    expect(p2Card.hidden).toBe(true);
    expect(topicButton.getAttribute("aria-pressed")).toBe("true");
    const filtered = new URLSearchParams(window.location.search);
    expect(filtered.get("topic")).toBe("社区讨论");
    expect(filtered.get("priority")).toBe("P0");

    reset.click();
    expect(p0Card.hidden).toBe(false);
    expect(p2Card.hidden).toBe(false);
    expect(empty.hidden).toBe(true);
    expect(document.querySelector('button[data-topic="all"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('button[data-priority="all"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(p0Button.getAttribute("aria-pressed")).toBe("false");
    expect(topicButton.getAttribute("aria-pressed")).toBe("false");
    const cleared = new URLSearchParams(window.location.search);
    expect(cleared.get("topic")).toBeNull();
    expect(cleared.get("priority")).toBeNull();
  });
});
