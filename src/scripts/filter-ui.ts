import { matchesFilters } from "../contract/filter";

/** Progressive filter. Cards stay in the HTML when script is absent. */
export function bindFilters(root: ParentNode = document): void {
  const scope = root.querySelector<HTMLElement>("[data-filter-root]");
  if (!scope) return;
  const empty = scope.querySelector<HTMLElement>("[data-empty]");
  const count = scope.querySelector<HTMLElement>("[data-count]");
  const cards = [...scope.querySelectorAll<HTMLElement>("[data-card]")];
  const topicButtons = [...scope.querySelectorAll<HTMLButtonElement>("button[data-topic]")];
  const priorityButtons = [...scope.querySelectorAll<HTMLButtonElement>("button[data-priority]")];
  const resetButton = scope.querySelector<HTMLButtonElement>("[data-reset]");
  let topic = current(topicButtons, "data-topic", "topic");
  let priority = current(priorityButtons, "data-priority", "priority");

  const render = () => {
    let visible = 0;
    for (const card of cards) {
      const topics = (card.dataset.topics ?? "").split(",").filter(Boolean);
      const show = matchesFilters(
        { priority: card.dataset.priority ?? "", topics },
        { topic, priority },
      );
      card.hidden = !show;
      if (show) visible += 1;
    }
    if (empty) empty.hidden = visible !== 0;
    press(topicButtons, "topic", topic);
    press(priorityButtons, "priority", priority);
    if (count) count.textContent = `显示 ${visible} / ${cards.length}`;
  };

  for (const button of topicButtons) {
    button.addEventListener("click", () => {
      topic = button.dataset.topic ?? "all";
      writeQuery("topic", topic);
      render();
    });
  }
  for (const button of priorityButtons) {
    button.addEventListener("click", () => {
      priority = button.dataset.priority ?? "all";
      writeQuery("priority", priority);
      render();
    });
  }
  resetButton?.addEventListener("click", () => {
    topic = "all";
    priority = "all";
    clearQuery();
    render();
  });
  render();
}

function current(
  buttons: readonly HTMLButtonElement[],
  datasetKey: "data-topic" | "data-priority",
  queryKey: "topic" | "priority",
): string {
  const fromQuery = new URLSearchParams(window.location.search).get(queryKey);
  if (fromQuery && buttons.some((button) => button.getAttribute(datasetKey) === fromQuery)) {
    return fromQuery;
  }
  return "all";
}

function press(
  buttons: readonly HTMLButtonElement[],
  key: "topic" | "priority",
  selected: string,
): void {
  for (const button of buttons) {
    const value = button.dataset[key];
    button.setAttribute("aria-pressed", value === selected ? "true" : "false");
  }
}

function writeQuery(key: "topic" | "priority", value: string): void {
  const params = new URLSearchParams(window.location.search);
  if (value === "all") params.delete(key);
  else params.set(key, value);
  replaceQuery(params);
}

function clearQuery(): void {
  const params = new URLSearchParams(window.location.search);
  params.delete("topic");
  params.delete("priority");
  replaceQuery(params);
}

function replaceQuery(params: URLSearchParams): void {
  const query = params.toString();
  const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", next);
}
