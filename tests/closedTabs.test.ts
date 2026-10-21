import { describe, expect, it } from "vitest";
import { CLOSED_TAB_LIMIT, rememberClosed, takeClosed } from "../src/lib/closedTabs";

describe("closed tabs", () => {
  it("reopens the most recently closed file first", () => {
    let stack = rememberClosed([], { path: "/a.pdf" });
    stack = rememberClosed(stack, { path: "/b.pdf" });
    expect(takeClosed(stack, new Set()).tab?.path).toBe("/b.pdf");
  });

  it("moves a file closed twice to the top instead of listing it twice", () => {
    let stack = rememberClosed([], { path: "/a.pdf" });
    stack = rememberClosed(stack, { path: "/b.pdf" });
    stack = rememberClosed(stack, { path: "/a.pdf", view: { page: 3, scaleValue: "auto", left: null, top: null, rotation: 0 } });
    expect(stack.map((entry) => entry.path)).toEqual(["/b.pdf", "/a.pdf"]);
    expect(stack[1].view?.page).toBe(3);
  });

  it("skips and forgets files that are open again", () => {
    const stack = [{ path: "/a.pdf" }, { path: "/b.pdf" }];
    const { tab, rest } = takeClosed(stack, new Set(["/b.pdf"]));
    expect(tab?.path).toBe("/a.pdf");
    expect(rest).toEqual([]);
  });

  it("returns nothing when the stack is empty", () => {
    expect(takeClosed([], new Set())).toEqual({ tab: null, rest: [] });
  });

  it("keeps a bounded history", () => {
    let stack: ReturnType<typeof rememberClosed> = [];
    for (let index = 0; index < CLOSED_TAB_LIMIT + 5; index++) {
      stack = rememberClosed(stack, { path: `/${index}.pdf` });
    }
    expect(stack).toHaveLength(CLOSED_TAB_LIMIT);
    expect(stack[0].path).toBe("/5.pdf");
  });
});
