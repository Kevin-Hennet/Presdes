import type { Analysis } from './api/client';

const prefix = 'presdes:scan:v1:';

export function readHistory(): Analysis[] {
  const items: Analysis[] = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const item: Analysis = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (item?.id && key === prefix + item.id) items.push(item);
  }

  return items.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function removeAnalysis(id: string): void {
  localStorage.removeItem(prefix + id);
}
