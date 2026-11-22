import { matchesFilters } from "../contract/filter";
import { matchesQuery } from "../contract/search";

/**
 * Full-text search over cards already in the HTML. Call this after bindFilters()
 * so a topic or priority click updates aria-pressed before this pass runs.
 * Nothing is fetched and cards are never removed; a query only toggles hidden.
 */
export function bindSearch(root: ParentNode = document): void {
  const scope = root.querySelector<HTMLElement>("[data-filter-root]");
  if (!scope) return;
  const input = scope.querySelector<HTMLInputElement>("input[data-search]");
  if (!input) return;
  const empty = scope.querySelector<HTMLElement>("[data-empty]");
  const count = scope.querySelector<HTMLElement>("[data-count]");
  const cards = [...scope.querySelectorAll<HTMLElement>("[data-card]")];
  const topicButtons = [...scope.querySelectorAll<HTMLButtonElement>("button[data-topic]")];
  const priorityButtons = [...scope.querySelectorAll<HTMLButtonElement>("button[data-priority]")];
  const resetButton = scope.querySelector<HTMLButtonElement>("[data-reset]");

  input.value = new URLSearchParams(window.location.search).get("q") ?? "";

  const render = () => {
    const query = input.value;
    const topic = pressed(topicButtons, "topic");
    const priority = pressed(priorityButtons, "priority");
    let visible = 0;
    for (const card of cards) {
      const topics = (card.dataset.topics ?? "").split(",").filter(Boolean);
      const show =
        matchesFilters({ priority: card.dataset.priority ?? "", topics }, { topic, priority }) &&
        matchesQuery(readSearchable(card), query);
      card.hidden = !show;
      if (show) visible += 1;
    }
    if (empty) empty.hidden = visible !== 0;
    if (count) count.textContent = `显示 ${visible} / ${cards.length}`;
    writeSearchQuery(query);
  };

  input.addEventListener("input", render);
  input.addEventListener("search", render);
  for (const button of topicButtons) button.addEventListener("click", render);
  for (const button of priorityButtons) button.addEventListener("click", render);
  resetButton?.addEventListener("click", () => {
    input.value = "";
    render();
  });
  render();
}

function pressed(
  buttons: readonly HTMLButtonElement[],
  key: "topic" | "priority",
): string {
  const selected = buttons.find((button) => button.getAttribute("aria-pressed") === "true");
  return selected?.dataset[key] || "all";
}

function readSearchable(card: HTMLElement): {
  title: string;
  topics: string[];
  sourceName: string;
  facts: string[];
  analysis: string;
} {
  return {
    title: card.dataset.title ?? "",
    topics: (card.dataset.topics ?? "").split(",").filter(Boolean),
    sourceName: card.dataset.sourceName ?? "",
    facts: readFacts(card.dataset.facts),
    analysis: card.dataset.analysis ?? "",
  };
}

function readFacts(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((fact) => typeof fact === "string")) return parsed;
  } catch {
    // A plain-text attribute still participates in matching.
  }
  return [value];
}

function writeSearchQuery(query: string): void {
  const params = new URLSearchParams(window.location.search);
  const trimmed = query.trim();
  if (trimmed) params.set("q", trimmed);
  else params.delete("q");
  const search = params.toString();
  const next = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", next);
}
