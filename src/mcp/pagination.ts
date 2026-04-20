export const DEFAULT_PAGE_SIZE = 200;
export const MAX_PAGE_SIZE = 2000;

export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  next_offset: number | null;
}

export function paginate<T>(
  items: T[],
  offset = 0,
  limit = DEFAULT_PAGE_SIZE,
): Page<T> {
  const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const safeOffset = Math.max(0, offset);
  const slice = items.slice(safeOffset, safeOffset + safeLimit);
  const next = safeOffset + slice.length;
  return {
    items: slice,
    total: items.length,
    offset: safeOffset,
    limit: safeLimit,
    next_offset: next < items.length ? next : null,
  };
}

export function formatPageFooter(page: Page<unknown>): string {
  const shown = `${page.offset + 1}-${page.offset + page.items.length}`;
  const more = page.next_offset !== null ? ` — more available, call again with offset=${page.next_offset}` : "";
  return `\n\n[showing ${shown} of ${page.total}${more}]`;
}
