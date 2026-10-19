import { describe, expect, it } from "vitest";
import { SNOOZE_MS, shouldPromptForDefault, type DefaultAppStatus } from "../src/lib/defaultApp";

const notDefault: DefaultAppStatus = { supported: true, isDefault: false, currentApp: "Preview" };
const now = 1_000_000;

describe("shouldPromptForDefault", () => {
  it("prompts when another app handles PDFs and nothing is suppressed", () => {
    expect(shouldPromptForDefault(notDefault, null, now)).toBe(true);
  });

  it("never prompts when Clumsy is already the default", () => {
    expect(shouldPromptForDefault({ ...notDefault, isDefault: true }, null, now)).toBe(false);
  });

  it("never prompts when setting the default is unsupported", () => {
    expect(shouldPromptForDefault({ ...notDefault, supported: false }, null, now)).toBe(false);
  });

  it("respects don't ask again", () => {
    expect(shouldPromptForDefault(notDefault, { state: "never" }, now)).toBe(false);
  });

  it("waits out a snooze and prompts again afterwards", () => {
    const snoozed = { state: "snoozed" as const, until: now + SNOOZE_MS };
    expect(shouldPromptForDefault(notDefault, snoozed, now)).toBe(false);
    expect(shouldPromptForDefault(notDefault, snoozed, now + SNOOZE_MS + 1)).toBe(true);
  });
});
