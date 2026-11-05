import { describe, expect, it } from "vitest";
import { DAMAGED_PDF, openErrorDetail } from "../src/lib/openErrors";

describe("openErrorDetail", () => {
  it("explains a PDF pdf.js can't parse", () => {
    const error = Object.assign(new Error("Invalid PDF structure."), { name: "InvalidPDFException" });
    expect(openErrorDetail(error)).toBe(DAMAGED_PDF);
  });

  it("keeps other errors' messages", () => {
    expect(openErrorDetail(new Error("not-allowed"))).toBe("not-allowed");
    expect(openErrorDetail("changed-on-disk")).toBe("changed-on-disk");
  });
});
