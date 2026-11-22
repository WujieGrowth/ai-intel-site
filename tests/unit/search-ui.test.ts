// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { bindFilters } from "../../src/scripts/filter-ui";
import { bindSearch } from "../../src/scripts/search-ui";

describe("bindSearch", () => {
  it("types a query that hides one card and then clears it", () => {
    window.history.replaceState(null, "", "/archive/");
    document.body.innerHTML = markup();
    bindFilters();
    bindSearch();

    const input = required<HTMLInputElement>("input[data-search]");
    const label = required<HTMLLabelElement>("label[for='published-search']");
    const preprint = required<HTMLElement>('[data-title="公开预印本"]');
    const forum = required<HTMLElement>('[data-title="论坛帖子"]');
    const empty = required<HTMLElement>("[data-empty]");
    const count = required<HTMLElement>("[data-count]");

    expect(label.textContent).toBe("搜索");
    expect(input.id).toBe("published-search");
    expect(preprint.hidden).toBe(false);
    expect(forum.hidden).toBe(false);

    typeQuery(input, "模型");
    expect(preprint.hidden).toBe(false);
    expect(forum.hidden).toBe(true);
    expect(count.textContent).toBe("显示 1 / 2");
    expect(empty.hidden).toBe(true);
    expect(new URLSearchParams(window.location.search).get("q")).toBe("模型");

    typeQuery(input, "");
    expect(preprint.hidden).toBe(false);
    expect(forum.hidden).toBe(false);
    expect(count.textContent).toBe("显示 2 / 2");
    expect(empty.hidden).toBe(true);
    expect(new URLSearchParams(window.location.search).get("q")).toBeNull();
  });

  it("folds case, combines with topic and priority, and shows the zero state", () => {
    window.history.replaceState(null, "", "/archive/?priority=P2");
    document.body.innerHTML = markup();
    bindFilters();
    bindSearch();

    const input = required<HTMLInputElement>("input[data-search]");
    const preprint = required<HTMLElement>('[data-title="公开预印本"]');
    const forum = required<HTMLElement>('[data-title="论坛帖子"]');
    const empty = required<HTMLElement>("[data-empty]");
    const count = required<HTMLElement>("[data-count]");
    const topic = required<HTMLButtonElement>('button[data-topic="社区讨论"]');
    const reset = required<HTMLButtonElement>("[data-reset]");

    expect(preprint.hidden).toBe(false);
    expect(forum.hidden).toBe(true);
    expect(input.value).toBe("");

    typeQuery(input, "ARXIV");
    expect(preprint.hidden).toBe(false);
    expect(forum.hidden).toBe(true);
    expect(new URLSearchParams(window.location.search).get("priority")).toBe("P2");
    expect(new URLSearchParams(window.location.search).get("q")).toBe("ARXIV");

    typeQuery(input, "交叉");
    expect(preprint.hidden).toBe(false);
    expect(forum.hidden).toBe(true);

    topic.click();
    expect(preprint.hidden).toBe(true);
    expect(forum.hidden).toBe(true);
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe("没有同时符合当前主题与优先级的示例。");
    expect(count.textContent).toBe("显示 0 / 2");
    const filtered = new URLSearchParams(window.location.search);
    expect(filtered.get("topic")).toBe("社区讨论");
    expect(filtered.get("priority")).toBe("P2");
    expect(filtered.get("q")).toBe("交叉");

    required<HTMLButtonElement>('button[data-priority="all"]').click();
    expect(forum.hidden).toBe(true);
    expect(preprint.hidden).toBe(true);
    expect(new URLSearchParams(window.location.search).get("priority")).toBeNull();

    typeQuery(input, "");
    expect(forum.hidden).toBe(false);
    expect(preprint.hidden).toBe(true);
    expect(empty.hidden).toBe(true);
    expect(count.textContent).toBe("显示 1 / 2");
    expect(new URLSearchParams(window.location.search).get("q")).toBeNull();
    expect(new URLSearchParams(window.location.search).get("topic")).toBe("社区讨论");

    reset.click();
    expect(input.value).toBe("");
    expect(preprint.hidden).toBe(false);
    expect(forum.hidden).toBe(false);
    expect(empty.hidden).toBe(true);
    const cleared = new URLSearchParams(window.location.search);
    expect(cleared.get("q")).toBeNull();
    expect(cleared.get("topic")).toBeNull();
    expect(cleared.get("priority")).toBeNull();
  });
});

function typeQuery(input: HTMLInputElement, value: string): void {
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function markup(): string {
  return `
    <div data-filter-root>
      <div class="filters">
        <label for="published-search">搜索</label>
        <input id="published-search" type="search" data-search />
        <button type="button" data-topic="all" aria-pressed="true">全部</button>
        <button type="button" data-topic="预印本" aria-pressed="false">预印本</button>
        <button type="button" data-topic="社区讨论" aria-pressed="false">社区讨论</button>
        <button type="button" data-priority="all" aria-pressed="true">全部</button>
        <button type="button" data-priority="P0" aria-pressed="false">P0</button>
        <button type="button" data-priority="P2" aria-pressed="false">P2</button>
        <button type="button" data-reset>重置</button>
      </div>
      <p data-count aria-live="polite"></p>
      <p data-empty hidden>没有同时符合当前主题与优先级的示例。</p>
      <ul>
        <li data-card data-priority="P2" data-topics="预印本" data-title="公开预印本" data-source-name="arXiv" data-facts='["标题：模型评估"]' data-analysis="规则说明：交叉核验">预印</li>
        <li data-card data-priority="P0" data-topics="社区讨论" data-title="论坛帖子" data-source-name="示例论坛" data-facts='["没有买方"]' data-analysis="另一段分析">讨论</li>
      </ul>
    </div>
  `;
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`missing ${selector}`);
  return element;
}
