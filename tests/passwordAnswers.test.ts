import { describe, expect, it, vi } from "vitest";
import { passwordAnswers } from "../src/lib/passwordAnswers";

describe("passwordAnswers", () => {
  it("tries known passwords first, once each, before prompting", async () => {
    const prompt = vi.fn(async () => "typed");
    const answers = passwordAnswers([{ password: "a" }, { password: "a", ownerPassword: true }, undefined, { password: "b" }], prompt);
    expect(await answers.ask(false)).toBe("a");
    expect(await answers.ask(true)).toBe("b");
    expect(prompt).not.toHaveBeenCalled();
    expect(await answers.ask(true)).toBe("typed");
    expect(prompt).toHaveBeenLastCalledWith(false);
    expect(await answers.ask(true)).toBe("typed");
    expect(prompt).toHaveBeenLastCalledWith(true);
  });

  it("only says incorrect after the person has typed something", async () => {
    const prompt = vi.fn(async () => null);
    const answers = passwordAnswers([], prompt);
    expect(await answers.ask(false)).toBeNull();
    expect(prompt).toHaveBeenCalledWith(false);
  });

  it("reports which password opened the file and whether it was typed", async () => {
    const answers = passwordAnswers([{ password: "known", ownerPassword: true }], async () => "typed");
    await answers.ask(false);
    await answers.ask(true);
    expect(answers.accepted("known")).toEqual({ protection: { password: "known", ownerPassword: true }, typed: false });
    expect(answers.accepted("typed")).toEqual({ protection: { password: "typed" }, typed: true });
    expect(answers.accepted(undefined)).toEqual({ typed: false });
  });
});
