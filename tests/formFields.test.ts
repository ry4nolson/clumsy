import { describe, expect, it } from "vitest";
import { adjacentField, readFields, resetEntry, shownValue, tabOrder, type FormField } from "../src/lib/formFields";

const field = (overrides: Partial<FormField>): FormField => ({
  id: "1R",
  name: "name",
  type: "text",
  page: 0,
  rect: [0, 0, 10, 10],
  value: "",
  defaultValue: "",
  exportValues: undefined,
  editable: true,
  hidden: false,
  ...overrides,
});

describe("readFields", () => {
  it("flattens pdf.js field objects and skips parent fields", () => {
    const objects = new Map<string, object[]>([
      ["parent", [{ id: "9R", type: "", kidIds: ["10R"], page: 0 }]],
      ["name", [{ id: "10R", type: "text", name: "name", page: 1, rect: [1, 2, 3, 4], value: "Ann", defaultValue: "", editable: true }]],
      ["agree", [{ id: "11R", type: "checkbox", page: 0, rect: [0, 0, 5, 5], value: "Off", defaultValue: "Yes", exportValues: "Yes", editable: false, hidden: true }]],
    ]);
    expect(readFields(objects)).toEqual([
      field({ id: "10R", page: 1, rect: [1, 2, 3, 4], value: "Ann" }),
      field({ id: "11R", name: "", type: "checkbox", rect: [0, 0, 5, 5], value: "Off", defaultValue: "Yes", exportValues: "Yes", editable: false, hidden: true }),
    ]);
  });

  it("reads nothing from a document without fields", () => {
    expect(readFields(null)).toEqual([]);
  });
});

describe("tabOrder", () => {
  it("orders by page, then rows top to bottom, then left to right", () => {
    const fields = [
      field({ id: "b", page: 0, rect: [300, 700, 400, 720] }),
      field({ id: "d", page: 1, rect: [0, 700, 100, 720] }),
      field({ id: "a", page: 0, rect: [50, 702, 150, 718] }),
      field({ id: "c", page: 0, rect: [50, 600, 150, 620] }),
    ];
    expect(tabOrder(fields).map((entry) => entry.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("skips fields you can't fill in", () => {
    const fields = [
      field({ id: "readOnly", editable: false }),
      field({ id: "hidden", hidden: true }),
      field({ id: "button", type: "button" }),
      field({ id: "offPage", page: -1 }),
      field({ id: "kept", type: "combobox" }),
    ];
    expect(tabOrder(fields).map((entry) => entry.id)).toEqual(["kept"]);
  });
});

describe("adjacentField", () => {
  const order = [field({ id: "a", page: 0 }), field({ id: "b", page: 2 }), field({ id: "c", page: 2 })];

  it("steps from the focused field and wraps around", () => {
    expect(adjacentField(order, { id: "a", page: 0 }, 1)?.id).toBe("b");
    expect(adjacentField(order, { id: "c", page: 2 }, 1)?.id).toBe("a");
    expect(adjacentField(order, { id: "a", page: 0 }, -1)?.id).toBe("c");
  });

  it("starts from the current page when no field has focus", () => {
    expect(adjacentField(order, { id: null, page: 1 }, 1)?.id).toBe("b");
    expect(adjacentField(order, { id: null, page: 1 }, -1)?.id).toBe("a");
    expect(adjacentField(order, { id: null, page: 3 }, 1)?.id).toBe("a");
  });

  it("has nothing to step to without fields", () => {
    expect(adjacentField([], { id: null, page: 0 }, 1)).toBeNull();
  });
});

describe("resetEntry", () => {
  it("resets each kind of field to its default", () => {
    expect(resetEntry(field({ defaultValue: "Draft" }))).toEqual({ value: "Draft" });
    expect(resetEntry(field({ defaultValue: undefined }))).toEqual({ value: "" });
    expect(resetEntry(field({ type: "checkbox", defaultValue: "Yes", exportValues: "Yes" }))).toEqual({ value: true });
    expect(resetEntry(field({ type: "radiobutton", defaultValue: "A", exportValues: "B" }))).toEqual({ value: false });
    expect(resetEntry(field({ type: "listbox", defaultValue: "Two" }))).toEqual({ value: "Two" });
    expect(resetEntry(field({ type: "button" }))).toBeNull();
  });
});

describe("shownValue", () => {
  it("shows a stored value or the file's own", () => {
    expect(shownValue(field({ value: "From file" }), null)).toBe("From file");
    expect(shownValue(field({ value: "From file" }), { value: "Typed" })).toBe("Typed");
    expect(shownValue(field({ type: "checkbox", value: "Yes", exportValues: "Yes" }), null)).toBe(true);
    expect(shownValue(field({ type: "checkbox", value: "Yes", exportValues: "Yes" }), { value: false })).toBe(false);
    expect(shownValue(field({ type: "combobox", value: "One" }), null)).toEqual(["One"]);
    expect(shownValue(field({ type: "listbox", value: null }), { value: ["A", "B"] })).toEqual(["A", "B"]);
    expect(shownValue(field({ type: "listbox", value: null }), { value: "" })).toEqual([]);
  });
});
