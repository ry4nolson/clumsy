import { describe, expect, it } from "vitest";
import { buildWorkspace } from "../src/lib/session";

type T = { id: string; kind: "start" | "document" };

const doc = (id: string): T => ({ id, kind: "document" });

const ids = () => {
  let next = 0;
  return () => `pane-${++next}`;
};

const start = () => ({ id: "start", kind: "start" as const });

describe("buildWorkspace", () => {
  it("rebuilds panes with their tab order, active tab, sizes, and focus", () => {
    const workspace = buildWorkspace(
      [
        { size: 2, active: 1, tabs: [doc("a"), doc("b")] },
        { size: 1, active: 0, tabs: [doc("c")] },
      ],
      1,
      ids(),
      start,
    );
    expect(workspace).toEqual({
      tabs: { a: doc("a"), b: doc("b"), c: doc("c") },
      panes: [
        { id: "pane-1", tabIds: ["a", "b"], activeTabId: "b", size: 2 },
        { id: "pane-2", tabIds: ["c"], activeTabId: "c", size: 1 },
      ],
      focusedPaneId: "pane-2",
    });
  });

  it("skips tabs that couldn't be reopened and keeps a nearby tab active", () => {
    const workspace = buildWorkspace([{ size: 1, active: 2, tabs: [doc("a"), doc("b"), null, doc("d")] }], 0, ids(), start);
    expect(workspace.panes[0]).toEqual({ id: "pane-1", tabIds: ["a", "b", "d"], activeTabId: "b", size: 1 });
    const first = buildWorkspace([{ size: 1, active: 0, tabs: [null, doc("b")] }], 0, ids(), start);
    expect(first.panes[0].activeTabId).toBe("b");
  });

  it("drops empty panes and moves focus to the first one left", () => {
    const workspace = buildWorkspace(
      [
        { size: 1, active: 0, tabs: [doc("a")] },
        { size: 1, active: 0, tabs: [null] },
      ],
      1,
      ids(),
      start,
    );
    expect(workspace.panes.map((pane) => pane.tabIds)).toEqual([["a"]]);
    expect(workspace.focusedPaneId).toBe("pane-1");
  });

  it("falls back to a Start tab when nothing could be reopened", () => {
    const workspace = buildWorkspace([{ size: 1, active: 0, tabs: [null] }], 0, ids(), start);
    expect(workspace.tabs).toEqual({ start: start() });
    expect(workspace.panes).toHaveLength(1);
  });
});
