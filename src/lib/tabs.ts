export type TabBase = { id: string };

export function insertAfter<T extends TabBase>(tabs: T[], afterId: string | null, tab: T) {
  const index = tabs.findIndex((candidate) => candidate.id === afterId);
  return index === -1 ? [...tabs, tab] : [...tabs.slice(0, index + 1), tab, ...tabs.slice(index + 1)];
}

export function removeTab<T extends TabBase>(tabs: T[], id: string, activeId: string) {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index === -1) {
    return { tabs, activeId };
  }
  const remaining = tabs.filter((tab) => tab.id !== id);
  if (activeId !== id) {
    return { tabs: remaining, activeId };
  }
  const neighbor = remaining[Math.min(index, remaining.length - 1)];
  return { tabs: remaining, activeId: neighbor?.id ?? null };
}

export function cycleTab<T extends TabBase>(tabs: T[], activeId: string, direction: 1 | -1) {
  const index = tabs.findIndex((tab) => tab.id === activeId);
  if (index === -1 || !tabs.length) {
    return activeId;
  }
  return tabs[(index + direction + tabs.length) % tabs.length].id;
}
