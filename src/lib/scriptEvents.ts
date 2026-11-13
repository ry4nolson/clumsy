import type { FormField, ShownValue } from "./formFields";

export type SandboxEvent = Record<string, unknown> & { id: string; name: string };

export type SandboxUpdate = Record<string, unknown> & { id?: string; siblings?: string[]; command?: string; value?: unknown };

export type ScriptingRequest =
  | { op: "create"; wasmUrl: string; askUrl: string | null; data: unknown }
  | { op: "event"; event: SandboxEvent; ack?: number }
  | { op: "ping" };

export type ScriptingReply =
  | { type: "ready" }
  | { type: "failed"; message: string }
  | { type: "update"; detail: SandboxUpdate }
  | { type: "alert"; message: string }
  | { type: "done"; ack: number }
  | { type: "asking" }
  | { type: "asked" }
  | { type: "pong" };

export type ScriptRequest = "print" | "saveAs";

export type DocumentAction = "WillSave" | "DidSave" | "WillPrint" | "DidPrint";

export type ViewCommand =
  | { kind: "page"; page: number }
  | { kind: "first" }
  | { kind: "last" }
  | { kind: "next" }
  | { kind: "previous" }
  | { kind: "zoom"; value: string }
  | { kind: "zoomIn" }
  | { kind: "zoomOut" };

export const PING_INTERVAL_MS = 2000;
export const MISSED_PINGS_ALLOWED = 4;
export const MAX_ALERT_LENGTH = 600;
export const QUESTIONS_PER_EVENT = 3;
export const ACTION_TIMEOUT_MS = 2000;
export const SCRIPT_COMMAND_EVENT = "clumsy-script-command";

const isToggle = (field: FormField) => field.type === "checkbox" || field.type === "radiobutton";

export const resetEvent = (ids: string[]): SandboxEvent => ({ id: "app", ids, name: "ResetForm" });

export function commitEvent(field: FormField, shown: ShownValue): SandboxEvent {
  if (isToggle(field)) {
    return { id: field.id, name: "Action", value: shown === true };
  }
  const value = Array.isArray(shown) ? (shown[0] ?? "") : String(shown);
  return { id: field.id, name: "Keystroke", value, willCommit: true, commitKey: 1, selStart: value.length, selEnd: value.length };
}

export const sameValue = (first: ShownValue, second: ShownValue) =>
  Array.isArray(first) || Array.isArray(second) ? [first].flat().join("\n") === [second].flat().join("\n") : first === second;

export function viewCommand({ id, command, value }: SandboxUpdate): ViewCommand | null {
  if (id) {
    return null;
  }
  switch (command) {
    case "page-num":
      return typeof value === "number" && Number.isInteger(value) && value >= 0 ? { kind: "page", page: value + 1 } : null;
    case "FirstPage":
      return { kind: "first" };
    case "LastPage":
      return { kind: "last" };
    case "NextPage":
      return { kind: "next" };
    case "PrevPage":
      return { kind: "previous" };
    case "zoom":
      return typeof value === "string" || (typeof value === "number" && value > 0) ? { kind: "zoom", value: String(value) } : null;
    case "ZoomViewIn":
      return { kind: "zoomIn" };
    case "ZoomViewOut":
      return { kind: "zoomOut" };
    default:
      return null;
  }
}

export function scriptRequest({ id, command }: SandboxUpdate): ScriptRequest | null {
  if (id) {
    return null;
  }
  return command === "print" ? "print" : command === "SaveAs" ? "saveAs" : null;
}

export function passThrough({ id, name, value, change, willCommit, selStart, selEnd }: SandboxEvent): SandboxUpdate | null {
  if (name !== "Keystroke" || typeof value !== "string") {
    return null;
  }
  if (willCommit) {
    return { id, value, formattedValue: null };
  }
  const start = typeof selStart === "number" ? selStart : value.length;
  const end = typeof selEnd === "number" ? selEnd : start;
  const typed = typeof change === "string" ? change : "";
  const caret = start + typed.length;
  return { id, value: value.slice(0, start) + typed + value.slice(end), selRange: [caret, caret] };
}

export const questionUrl = (askUrl: string, message: string) => `${askUrl}${encodeURIComponent(alertText(message))}`;

export function updateTargets({ id, siblings }: SandboxUpdate, known: ReadonlySet<string>) {
  const ids = id ? [id, ...(Array.isArray(siblings) ? siblings : [])] : [];
  return ids.filter((target) => typeof target === "string" && known.has(target));
}

export const stoppedAnswering = (missedPings: number) => missedPings >= MISSED_PINGS_ALLOWED;

export function alertText(message: unknown) {
  const text = typeof message === "string" ? message.trim() : "";
  return text.length > MAX_ALERT_LENGTH ? `${text.slice(0, MAX_ALERT_LENGTH)}…` : text;
}
