import { describe, expect, it } from "vitest";
import { signatureFont, signatureFonts } from "../src/lib/signatureFonts";

describe("signatureFont", () => {
  it("finds a font by id", () => {
    expect(signatureFont("caveat").name).toBe("Caveat");
  });

  it("falls back to the first font for unknown or malformed ids", () => {
    expect(signatureFont("comic-sans")).toBe(signatureFonts[0]);
    expect(signatureFont(null)).toBe(signatureFonts[0]);
    expect(signatureFont(42)).toBe(signatureFonts[0]);
  });

  it("has unique ids", () => {
    expect(new Set(signatureFonts.map((font) => font.id)).size).toBe(signatureFonts.length);
  });
});
