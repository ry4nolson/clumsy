import { describe, expect, it } from "vitest";
import { deviceFrom } from "../src/lib/device";

const macAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";

describe("deviceFrom", () => {
  it("reads a Mac without touch as a Mac", () => {
    expect(deviceFrom(macAgent, 0)).toBe("mac");
  });

  it("reads an iPad that reports a Mac user agent as iOS", () => {
    expect(deviceFrom(macAgent, 5)).toBe("ios");
  });

  it("reads iPhone and iPad user agents as iOS", () => {
    expect(deviceFrom("Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15", 5)).toBe("ios");
    expect(deviceFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15", 5)).toBe("ios");
  });

  it("reads Android before anything else in its user agent", () => {
    expect(deviceFrom("Mozilla/5.0 (Linux; Android 15; Pixel Tablet) AppleWebKit/537.36 Chrome/124.0 Safari/537.36", 5)).toBe("android");
  });

  it("reads a touch-screen Windows machine as Windows", () => {
    expect(deviceFrom("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/124.0", 10)).toBe("windows");
  });

  it("falls back to other", () => {
    expect(deviceFrom("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15", 0)).toBe("other");
  });
});
