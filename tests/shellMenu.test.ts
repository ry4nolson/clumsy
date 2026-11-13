import { describe, expect, it } from "vitest";
import { menuChoice } from "../src/lib/shellMenu";

describe("menuChoice", () => {
  it("leaves text fields to the webview's own menu", () => {
    expect(menuChoice(true, "")).toBe("webview");
    expect(menuChoice(true, "selected words")).toBe("webview");
  });

  it("offers only Copy over selected text", () => {
    expect(menuChoice(false, "selected words")).toBe("copy");
  });

  it("shows nothing anywhere else", () => {
    expect(menuChoice(false, "")).toBe("none");
    expect(menuChoice(false, "  \n")).toBe("none");
  });
});
