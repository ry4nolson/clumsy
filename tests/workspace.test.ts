import { describe, expect, it } from "vitest";
import {
  addTab,
  closeSplit,
  closeTab,
  createWorkspace,
  cycleTabs,
  focusAdjacentPane,
  focusedTab,
  moveTab,
  moveTabToAdjacentPane,
  orderedTabs,
  selectTab,
  selectTabAt,
  splitWithTab,
  type Workspace,
} from "../src/lib/workspace";

type T = { id: string; kind: "start" | "document" };
const doc = (id: string): T => ({ id, kind: "document" });
let starts = 0;
const start = (): T => ({ id: `start-${++starts}`, kind: "start" });

const layout = (workspace: Workspace<T>) =>
  workspace.panes.map((pane) => pane.tabIds.map((id) => (id === pane.activeTabId ? `*${id}` : id)).join(",") + (pane.id === workspace.focusedPaneId ? " (focused)" : ""));

function twoPanes() {
  let ws = createWorkspace(doc("a"), "p1");
  ws = addTab(ws, doc("b"));
  ws = splitWithTab(ws, doc("c"), "p2");
  return ws;
}

describe("tabs within a pane", () => {
  it("opens new tabs after the active one and activates them", () => {
    let ws = createWorkspace(doc("a"), "p1");
    ws = addTab(ws, doc("b"));
    ws = selectTab(ws, "a");
    ws = addTab(ws, doc("c"));
    expect(layout(ws)).toEqual(["a,*c,b (focused)"]);
  });

  it("cycles and jumps by index within the focused pane only", () => {
    let ws = twoPanes();
    ws = focusAdjacentPane(ws, -1);
    expect(focusedTab(cycleTabs(ws, 1)).id).toBe("a");
    expect(focusedTab(selectTabAt(ws, 0)).id).toBe("a");
    expect(selectTabAt(ws, 5)).toBe(ws);
  });

  it("replaces the last tab of the only pane with a start tab", () => {
    const ws = closeTab(createWorkspace(doc("a"), "p1"), "a", start);
    expect(ws.panes).toHaveLength(1);
    expect(focusedTab(ws).kind).toBe("start");
    expect(ws.tabs.a).toBeUndefined();
  });
});

describe("split panes", () => {
  it("splits to the right of the focused pane and focuses the new pane", () => {
    const ws = twoPanes();
    expect(layout(ws)).toEqual(["a,*b", "*c (focused)"]);
    expect(ws.panes.map((pane) => pane.size)).toEqual([0.5, 0.5]);
  });

  it("removes a pane when its last tab closes and gives its space to the neighbor", () => {
    const ws = closeTab(twoPanes(), "c", start);
    expect(layout(ws)).toEqual(["a,*b (focused)"]);
    expect(ws.panes[0].size).toBe(1);
  });

  it("moves a tab between panes and closes the emptied pane", () => {
    const ws = moveTab(twoPanes(), "c", { paneId: "p1", index: 0 });
    expect(layout(ws)).toEqual(["*c,a,b (focused)"]);
  });

  it("reorders within a pane", () => {
    const ws = moveTab(twoPanes(), "a", { paneId: "p1", index: 2 });
    expect(ws.panes[0].tabIds).toEqual(["b", "a"]);
  });

  it("moves a tab into a brand new pane", () => {
    let ws = createWorkspace(doc("a"), "p1");
    ws = addTab(ws, doc("b"));
    ws = moveTab(ws, "b", { newPaneAfter: "p1", paneId: "p2" });
    expect(layout(ws)).toEqual(["*a", "*b (focused)"]);
  });

  it("won't split a pane's only tab away from itself", () => {
    const ws = createWorkspace(doc("a"), "p1");
    expect(moveTab(ws, "a", { newPaneAfter: "p1", paneId: "p2" })).toBe(ws);
  });

  it("moves the focused tab to adjacent panes, creating one on the right if needed", () => {
    let ws = createWorkspace(doc("a"), "p1");
    ws = addTab(ws, doc("b"));
    ws = moveTabToAdjacentPane(ws, 1, "p2");
    expect(layout(ws)).toEqual(["*a", "*b (focused)"]);
    ws = moveTabToAdjacentPane(ws, -1, "p3");
    expect(layout(ws)).toEqual(["a,*b (focused)"]);
  });

  it("merges panes back into one, dropping extra start tabs", () => {
    let ws = twoPanes();
    ws = addTab(ws, start());
    const merged = closeSplit(ws);
    expect(merged.panes).toHaveLength(1);
    expect(orderedTabs(merged).map((tab) => tab.id)).toEqual(["a", "b", "c"]);
    expect(focusedTab(merged).id).toBe("b");
  });
});
