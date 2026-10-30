export type DefaultAppStatus = {
  supported: boolean;
  isDefault: boolean;
  currentApp: string | null;
};

export type DefaultAppKind = "pdf" | "markdown";

export const defaultAppWords: Record<DefaultAppKind, { label: string; files: string; file: string }> = {
  pdf: { label: "PDF", files: "PDFs", file: "a PDF" },
  markdown: { label: "Markdown", files: "Markdown files", file: "a Markdown file" },
};

export type DefaultAppPreference = { state: "never" } | { state: "snoozed"; until: number } | null;

export const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldPromptForDefault(status: DefaultAppStatus, preference: DefaultAppPreference, now: number) {
  if (!status.supported || status.isDefault || preference?.state === "never") {
    return false;
  }
  return !(preference?.state === "snoozed" && preference.until > now);
}
