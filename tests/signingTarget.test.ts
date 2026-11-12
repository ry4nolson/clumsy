import { describe, expect, it } from "vitest";
import { appearanceLines, cleanTimestampUrl, cornerRect, localIsoTime, normalizedBox, outlineFrom, preselectedIdentity, targetFor } from "../src/lib/signingTarget";
import type { SigningIdentity } from "../src/lib/signatureTypes";

const letter: [number, number, number, number] = [0, 0, 612, 792];

describe("cornerRect", () => {
  it("sits in the lower right of an upright page", () => {
    expect(cornerRect(letter, 0)).toEqual([396, 36, 576, 90]);
  });

  it("follows the page's rotation so it still shows in the lower right", () => {
    expect(cornerRect(letter, 90)).toEqual([522, 576, 576, 756]);
    expect(cornerRect(letter, 180)).toEqual([36, 702, 216, 756]);
    expect(cornerRect(letter, 270)).toEqual([36, 36, 90, 216]);
  });

  it("respects an offset media box", () => {
    expect(cornerRect([100, 100, 712, 892], 0)).toEqual([496, 136, 676, 190]);
  });

  it("fits a small page", () => {
    const [x0, y0, x1, y1] = cornerRect([0, 0, 120, 80], 0);
    expect(x0).toBeGreaterThanOrEqual(0);
    expect(y0).toBeGreaterThanOrEqual(0);
    expect(x1).toBeLessThanOrEqual(120);
    expect(y1).toBeLessThanOrEqual(80);
  });
});

describe("normalizedBox", () => {
  it("orders the corners", () => {
    expect(normalizedBox([200, 100, 50, 20])).toEqual([50, 20, 200, 100]);
  });

  it("refuses a box too small to hold a signature", () => {
    expect(normalizedBox([0, 0, 5, 50])).toBeNull();
  });
});

describe("targetFor", () => {
  it("maps each choice to what the writer takes", () => {
    expect(targetFor({ kind: "field", field: { fieldName: "Sig1", page: 2, rect: [0, 0, 1, 1] } })).toEqual({ kind: "field", fieldName: "Sig1" });
    expect(targetFor({ kind: "corner", page: 3, rect: [1, 2, 3, 4] })).toEqual({ kind: "new", page: 3, rect: [1, 2, 3, 4] });
    expect(targetFor({ kind: "box", page: 1, rect: [1, 2, 3, 4] })).toEqual({ kind: "new", page: 1, rect: [1, 2, 3, 4] });
    expect(targetFor({ kind: "invisible", page: 4 })).toEqual({ kind: "invisible", page: 4 });
  });
});

it("writes the local time with its offset", () => {
  const text = localIsoTime(new Date(2026, 10, 11, 9, 5, 7));
  expect(text).toMatch(/^2026-11-11T09:05:07[+-]\d\d:\d\d$/);
});

it("draws the signer, date, and reason", () => {
  expect(appearanceLines("Ryan Olson", "2026-11-11T09:00:00-06:00", "Approved", null)).toEqual(["Digitally signed by Ryan Olson", "Date: 2026-11-11", "Reason: Approved"]);
  expect(appearanceLines("Ryan Olson", "2026-11-11T09:00:00Z", null, 2)[0]).toBe("Certified by Ryan Olson");
});

it("reads a saved signature's outline", () => {
  expect(outlineFrom({ viewBox: "0 0 10 5", path: "M0 0L1 1", areContours: true }, 2)).toEqual({ path: "M0 0L1 1", viewBox: [0, 0, 10, 5], areContours: true, thickness: 2 });
  expect(outlineFrom({ viewBox: "bad", path: "M0 0", areContours: false }, 1)).toBeNull();
});

describe("preselectedIdentity", () => {
  const identity = (fingerprint: string, usable: boolean): SigningIdentity => ({
    fingerprint,
    certificate: { commonName: fingerprint, email: null, organization: null, issuer: "CA", serial: "1", notBefore: "", notAfter: "", fingerprint },
    keyType: "rsa",
    keyBits: 2048,
    hardware: false,
    trusted: true,
    usable,
    problems: usable ? [] : ["Expired"],
    warnings: [],
  });

  it("keeps the last identity used when it's still usable", () => {
    expect(preselectedIdentity([identity("A", true), identity("B", true)], "B")).toBe("B");
  });

  it("falls back to the first usable one", () => {
    expect(preselectedIdentity([identity("A", false), identity("B", true)], "A")).toBe("B");
    expect(preselectedIdentity([identity("A", false)], null)).toBeNull();
  });
});

it("accepts only http and https timestamp servers", () => {
  expect(cleanTimestampUrl(" http://timestamp.digicert.com ")).toBe("http://timestamp.digicert.com");
  expect(cleanTimestampUrl("file:///etc/passwd")).toBeNull();
  expect(cleanTimestampUrl("nonsense")).toBeNull();
});
