import { describe, expect, it } from "vitest";
import type { FormField } from "../src/lib/formFields";
import { MAX_ALERT_LENGTH, MISSED_PINGS_ALLOWED, alertText, commitEvent, passThrough, questionUrl, resetEvent, sameValue, scriptRequest, stoppedAnswering, updateTargets, viewCommand } from "../src/lib/scriptEvents";

const field = (type: string): FormField => ({
  id: "9R",
  name: "qty",
  type,
  page: 0,
  rect: null,
  value: "",
  defaultValue: "",
  exportValues: "Yes",
  editable: true,
  hidden: false,
});

describe("commitEvent", () => {
  it("commits a text value the way a finished keystroke does", () => {
    expect(commitEvent(field("text"), "12.5")).toEqual({ id: "9R", name: "Keystroke", value: "12.5", willCommit: true, commitKey: 1, selStart: 4, selEnd: 4 });
  });

  it("commits the first choice of a list", () => {
    expect(commitEvent(field("combobox"), ["Texas", "Oklahoma"]).value).toBe("Texas");
    expect(commitEvent(field("listbox"), []).value).toBe("");
  });

  it("reports a checkbox or radio button as an action with its state", () => {
    expect(commitEvent(field("checkbox"), true)).toEqual({ id: "9R", name: "Action", value: true });
    expect(commitEvent(field("radiobutton"), false)).toEqual({ id: "9R", name: "Action", value: false });
  });
});

describe("sameValue", () => {
  it("compares text, toggles, and lists of choices", () => {
    expect(sameValue("3", "3")).toBe(true);
    expect(sameValue("3", "")).toBe(false);
    expect(sameValue(true, false)).toBe(false);
    expect(sameValue(["Texas"], ["Texas"])).toBe(true);
    expect(sameValue(["Texas"], [])).toBe(false);
    expect(sameValue([], "")).toBe(true);
  });
});

describe("resetEvent", () => {
  it("names every reset field", () => {
    expect(resetEvent(["9R", "12R"])).toEqual({ id: "app", ids: ["9R", "12R"], name: "ResetForm" });
  });
});

describe("viewCommand", () => {
  it("maps navigation and zoom commands", () => {
    expect(viewCommand({ command: "page-num", value: 4 })).toEqual({ kind: "page", page: 5 });
    expect(viewCommand({ command: "FirstPage" })).toEqual({ kind: "first" });
    expect(viewCommand({ command: "LastPage" })).toEqual({ kind: "last" });
    expect(viewCommand({ command: "NextPage" })).toEqual({ kind: "next" });
    expect(viewCommand({ command: "PrevPage" })).toEqual({ kind: "previous" });
    expect(viewCommand({ command: "zoom", value: "page-fit" })).toEqual({ kind: "zoom", value: "page-fit" });
    expect(viewCommand({ command: "zoom", value: 1.5 })).toEqual({ kind: "zoom", value: "1.5" });
    expect(viewCommand({ command: "ZoomViewIn" })).toEqual({ kind: "zoomIn" });
    expect(viewCommand({ command: "ZoomViewOut" })).toEqual({ kind: "zoomOut" });
  });

  it("ignores printing, saving, console output, and bad values", () => {
    for (const command of ["print", "SaveAs", "println", "error", "clear", "layout", "WillPrintFinished"]) {
      expect(viewCommand({ command, value: "x" })).toBeNull();
    }
    expect(viewCommand({ command: "page-num", value: -1 })).toBeNull();
    expect(viewCommand({ command: "page-num", value: "2" })).toBeNull();
    expect(viewCommand({ command: "zoom", value: 0 })).toBeNull();
    expect(viewCommand({ command: "zoom", value: {} })).toBeNull();
  });

  it("leaves field updates alone", () => {
    expect(viewCommand({ id: "9R", command: "FirstPage" })).toBeNull();
  });
});

describe("scriptRequest", () => {
  it("passes on a script's print and Save As requests", () => {
    expect(scriptRequest({ command: "print" })).toBe("print");
    expect(scriptRequest({ command: "SaveAs" })).toBe("saveAs");
    expect(scriptRequest({ command: "zoom" })).toBeNull();
    expect(scriptRequest({ id: "9R", command: "print" })).toBeNull();
  });
});

describe("passThrough", () => {
  const typed = { id: "9R", name: "Keystroke", willCommit: false };

  it("accepts a typed change where the selection was", () => {
    expect(passThrough({ ...typed, value: "125", change: "9", selStart: 1, selEnd: 2 })).toEqual({ id: "9R", value: "195", selRange: [2, 2] });
    expect(passThrough({ ...typed, value: "", change: "2.5", selStart: 0, selEnd: 0 })).toEqual({ id: "9R", value: "2.5", selRange: [3, 3] });
    expect(passThrough({ ...typed, value: "12", change: "", selStart: 1, selEnd: 2 })).toEqual({ id: "9R", value: "1", selRange: [1, 1] });
  });

  it("appends when the selection is missing", () => {
    expect(passThrough({ ...typed, value: "12", change: "3" })).toEqual({ id: "9R", value: "123", selRange: [3, 3] });
  });

  it("keeps a committed value and drops its old formatted text", () => {
    expect(passThrough({ id: "9R", name: "Keystroke", value: "7", willCommit: true })).toEqual({ id: "9R", value: "7", formattedValue: null });
  });

  it("ignores every other event", () => {
    expect(passThrough({ id: "9R", name: "Focus" })).toBeNull();
    expect(passThrough({ id: "9R", name: "Action", value: true })).toBeNull();
    expect(passThrough({ id: "doc", name: "Open" })).toBeNull();
  });
});

describe("questionUrl", () => {
  it("puts the trimmed, shortened question in the path", () => {
    expect(questionUrl("formask://localhost/", " Clear it? ")).toBe("formask://localhost/Clear%20it%3F");
    expect(decodeURIComponent(questionUrl("formask://localhost/", "x".repeat(MAX_ALERT_LENGTH + 9)).split("/").pop()!)).toHaveLength(MAX_ALERT_LENGTH + 1);
  });
});

describe("updateTargets", () => {
  const known = new Set(["9R", "12R"]);

  it("lists a field and its siblings, keeping only this document's fields", () => {
    expect(updateTargets({ id: "9R", siblings: ["12R", "99R"] }, known)).toEqual(["9R", "12R"]);
    expect(updateTargets({ id: "99R" }, known)).toEqual([]);
    expect(updateTargets({ command: "zoom" }, known)).toEqual([]);
  });

  it("ignores siblings that aren't a list of ids", () => {
    expect(updateTargets({ id: "9R", siblings: "12R" as unknown as string[] }, known)).toEqual(["9R"]);
    expect(updateTargets({ id: "9R", siblings: [12 as unknown as string] }, known)).toEqual(["9R"]);
  });
});

describe("stoppedAnswering", () => {
  it("gives up only after the allowed number of unanswered pings", () => {
    expect(stoppedAnswering(0)).toBe(false);
    expect(stoppedAnswering(MISSED_PINGS_ALLOWED - 1)).toBe(false);
    expect(stoppedAnswering(MISSED_PINGS_ALLOWED)).toBe(true);
  });
});

describe("alertText", () => {
  it("trims, shortens long messages, and drops anything that isn't text", () => {
    expect(alertText("  Too big  ")).toBe("Too big");
    expect(alertText("x".repeat(MAX_ALERT_LENGTH + 50))).toHaveLength(MAX_ALERT_LENGTH + 1);
    expect(alertText({ cMsg: "hi" })).toBe("");
    expect(alertText("   ")).toBe("");
  });
});
