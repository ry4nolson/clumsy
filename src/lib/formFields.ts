export type FormField = {
  id: string;
  name: string;
  type: string;
  page: number;
  rect: number[] | null;
  value: unknown;
  defaultValue: unknown;
  exportValues: unknown;
  editable: boolean;
  hidden: boolean;
};

export type FieldEntry = { value: string | boolean | string[] };

export type ShownValue = string | boolean | string[];

type FieldObjects = Map<string, object[]> | Record<string, object[]> | null | undefined;

const fillable = new Set(["text", "checkbox", "radiobutton", "combobox", "listbox"]);

const isChoice = (field: FormField) => field.type === "combobox" || field.type === "listbox";

const isToggle = (field: FormField) => field.type === "checkbox" || field.type === "radiobutton";

export function readFields(objects: FieldObjects): FormField[] {
  const groups = objects instanceof Map ? [...objects.values()] : Object.values(objects ?? {});
  return groups.flat().flatMap((raw) => {
    const object = raw as Record<string, unknown>;
    if (typeof object.id !== "string" || typeof object.type !== "string" || !object.type) {
      return [];
    }
    const rect = Array.isArray(object.rect) && object.rect.length === 4 ? (object.rect as number[]) : null;
    return [
      {
        id: object.id,
        name: typeof object.name === "string" ? object.name : "",
        type: object.type,
        page: typeof object.page === "number" ? object.page : -1,
        rect,
        value: object.value,
        defaultValue: object.defaultValue,
        exportValues: object.exportValues,
        editable: object.editable !== false,
        hidden: object.hidden === true,
      },
    ];
  });
}

const bounds = (rect: number[]) => ({
  left: Math.min(rect[0], rect[2]),
  top: Math.max(rect[1], rect[3]),
  height: Math.abs(rect[3] - rect[1]),
});

export function tabOrder(fields: FormField[]) {
  return fields
    .filter((field) => fillable.has(field.type) && field.editable && !field.hidden && field.rect && field.page >= 0)
    .sort((a, b) => {
      if (a.page !== b.page) {
        return a.page - b.page;
      }
      const first = bounds(a.rect!);
      const second = bounds(b.rect!);
      const sameRow = Math.abs(first.top - second.top) <= Math.min(first.height, second.height) / 2;
      return sameRow ? first.left - second.left : second.top - first.top;
    });
}

export function adjacentField(order: FormField[], from: { id: string | null; page: number }, step: 1 | -1) {
  if (!order.length) {
    return null;
  }
  const index = from.id ? order.findIndex((field) => field.id === from.id) : -1;
  if (index >= 0) {
    return order[(index + step + order.length) % order.length];
  }
  if (step === 1) {
    return order.find((field) => field.page >= from.page) ?? order[0];
  }
  return order.findLast((field) => field.page <= from.page) ?? order[order.length - 1];
}

export function resetEntry(field: FormField): FieldEntry | null {
  if (field.type === "text" || isChoice(field)) {
    return { value: typeof field.defaultValue === "string" ? field.defaultValue : "" };
  }
  if (isToggle(field)) {
    return { value: field.defaultValue === field.exportValues };
  }
  return null;
}

export function shownValue(field: FormField, entry: FieldEntry | null): ShownValue {
  const value = entry ? entry.value : isToggle(field) ? field.value === field.exportValues : field.value;
  if (isToggle(field)) {
    return value === true;
  }
  if (isChoice(field)) {
    return Array.isArray(value) ? value.map(String) : typeof value === "string" && value ? [value] : [];
  }
  return typeof value === "string" ? value : "";
}

export function readShown(element: Element): ShownValue {
  if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
    return element.checked;
  }
  if (element instanceof HTMLSelectElement) {
    return [...element.options].filter((option) => option.selected).map((option) => option.value);
  }
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.value : "";
}

export function writeShown(element: Element, value: ShownValue) {
  if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
    element.checked = value === true;
  } else if (element instanceof HTMLSelectElement) {
    const values = Array.isArray(value) ? value : [];
    for (const option of element.options) {
      option.selected = values.includes(option.value);
    }
  } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = typeof value === "string" ? value : "";
  }
}
