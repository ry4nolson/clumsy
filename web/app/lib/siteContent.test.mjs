import { describe, expect, it } from "vitest";
import bundled from "../../content/features.json";
import { parseSiteContent, toSiteContent } from "./siteContent";

describe("site content", () => {
  it("accepts the bundled features file", () => {
    expect(toSiteContent(bundled)).toEqual(bundled);
  });

  it("refuses broken or incomplete content", () => {
    expect(parseSiteContent("{")).toBeNull();
    expect(parseSiteContent("")).toBeNull();
    expect(parseSiteContent(JSON.stringify({ features: [], shortcuts: bundled.shortcuts }))).toBeNull();
    expect(parseSiteContent(JSON.stringify({ ...bundled, shortcuts: [{ keys: [], label: "x", note: "y" }] }))).toBeNull();
    expect(parseSiteContent(JSON.stringify({ ...bundled, features: [{ title: "x", items: [1] }] }))).toBeNull();
  });

  it("drops unknown fields", () => {
    const extra = { ...bundled, features: [{ ...bundled.features[0], icon: "<script>" }] };
    expect(parseSiteContent(JSON.stringify(extra))?.features[0]).toEqual(bundled.features[0]);
  });
});
