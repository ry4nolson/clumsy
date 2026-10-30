import { describe, expect, it } from "vitest";
import { documentView, isScrollMode, isSpreadMode, scrollsVertically } from "../src/lib/viewModes";

describe("documentView", () => {
  it("maps every page layout to scroll and spread modes", () => {
    expect(documentView(null, "SinglePage")).toEqual({ scrollMode: "page", spreadMode: "none" });
    expect(documentView(null, "OneColumn")).toEqual({ scrollMode: "vertical", spreadMode: "none" });
    expect(documentView(null, "TwoColumnLeft")).toEqual({ scrollMode: "vertical", spreadMode: "odd" });
    expect(documentView(null, "TwoColumnRight")).toEqual({ scrollMode: "vertical", spreadMode: "even" });
    expect(documentView(null, "TwoPageLeft")).toEqual({ scrollMode: "page", spreadMode: "odd" });
    expect(documentView(null, "TwoPageRight")).toEqual({ scrollMode: "page", spreadMode: "even" });
  });

  it("opens the sidebar for outline and thumbnail page modes", () => {
    expect(documentView("UseOutlines", null)).toEqual({ sidebar: "outline" });
    expect(documentView("UseThumbs", "")).toEqual({ sidebar: "thumbnails" });
    expect(documentView("UseOutlines", "TwoColumnRight")).toEqual({ scrollMode: "vertical", spreadMode: "even", sidebar: "outline" });
  });

  it("leaves everything else to the user's settings", () => {
    expect(documentView("UseNone", null)).toEqual({});
    expect(documentView("FullScreen", "")).toEqual({});
    expect(documentView("UseOC", "Bogus")).toEqual({});
    expect(documentView("UseAttachments", undefined)).toEqual({});
    expect(documentView(undefined, undefined)).toEqual({});
  });
});

describe("mode guards", () => {
  it("accepts only known mode names", () => {
    expect(isScrollMode("wrapped")).toBe(true);
    expect(isScrollMode(2)).toBe(false);
    expect(isSpreadMode("even")).toBe(true);
    expect(isSpreadMode("both")).toBe(false);
  });

  it("knows which scroll modes scroll up and down", () => {
    expect(scrollsVertically("vertical")).toBe(true);
    expect(scrollsVertically("wrapped")).toBe(true);
    expect(scrollsVertically("horizontal")).toBe(false);
    expect(scrollsVertically("page")).toBe(false);
  });
});
