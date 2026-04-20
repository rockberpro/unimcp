import { describe, expect, test } from "bun:test";
import { paginate, formatPageFooter, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from "../src/mcp/pagination";

describe("paginate", () => {
  test("returns first page with next_offset when more remains", () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const page = paginate(items, 0, 3);
    expect(page.items).toEqual([0, 1, 2]);
    expect(page.total).toBe(10);
    expect(page.next_offset).toBe(3);
  });

  test("returns null next_offset on the last page", () => {
    const items = [1, 2, 3];
    const page = paginate(items, 0, 10);
    expect(page.items).toEqual([1, 2, 3]);
    expect(page.next_offset).toBeNull();
  });

  test("clamps negative offset to 0", () => {
    const page = paginate([1, 2, 3], -5, 10);
    expect(page.offset).toBe(0);
    expect(page.items).toEqual([1, 2, 3]);
  });

  test("clamps limit above MAX_PAGE_SIZE", () => {
    const items = Array.from({ length: MAX_PAGE_SIZE + 50 }, (_, i) => i);
    const page = paginate(items, 0, MAX_PAGE_SIZE + 9999);
    expect(page.limit).toBe(MAX_PAGE_SIZE);
    expect(page.items.length).toBe(MAX_PAGE_SIZE);
    expect(page.next_offset).toBe(MAX_PAGE_SIZE);
  });

  test("clamps limit below 1", () => {
    const page = paginate([1, 2, 3], 0, 0);
    expect(page.limit).toBe(1);
    expect(page.items).toEqual([1]);
  });

  test("uses DEFAULT_PAGE_SIZE when no limit given", () => {
    const items = Array.from({ length: DEFAULT_PAGE_SIZE + 5 }, () => 0);
    const page = paginate(items);
    expect(page.limit).toBe(DEFAULT_PAGE_SIZE);
    expect(page.next_offset).toBe(DEFAULT_PAGE_SIZE);
  });

  test("offset past the end returns empty page with null next", () => {
    const page = paginate([1, 2, 3], 10, 5);
    expect(page.items).toEqual([]);
    expect(page.next_offset).toBeNull();
  });
});

describe("formatPageFooter", () => {
  test("includes next_offset when more available", () => {
    const footer = formatPageFooter({ items: [1, 2], total: 10, offset: 0, limit: 2, next_offset: 2 });
    expect(footer).toContain("1-2 of 10");
    expect(footer).toContain("offset=2");
  });

  test("omits next-offset hint on the last page", () => {
    const footer = formatPageFooter({ items: [9, 10], total: 10, offset: 8, limit: 2, next_offset: null });
    expect(footer).toContain("9-10 of 10");
    expect(footer).not.toContain("offset=");
  });
});
