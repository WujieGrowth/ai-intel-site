export interface FilterableCard {
  priority: string;
  topics: readonly string[];
}

export interface FilterSelection {
  topic: string;
  priority: string;
}

/** Topic and priority both apply. "all" opts out of that dimension. */
export function matchesFilters(card: FilterableCard, selection: FilterSelection): boolean {
  const topicOk = selection.topic === "all" || card.topics.includes(selection.topic);
  const priorityOk = selection.priority === "all" || card.priority === selection.priority;
  return topicOk && priorityOk;
}
