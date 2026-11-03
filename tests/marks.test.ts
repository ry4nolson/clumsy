import { describe, expect, it } from "vitest";
import { dateLabel, markShape } from "../src/lib/marks";

describe("markShape", () => {
  it("draws each mark as one closed outline inside its box", () => {
    for (const kind of ["check", "cross", "dot"] as const) {
      const { lines, description, heightInPage } = markShape(kind);
      const [{ points }] = lines.curves;
      expect(lines.curves).toHaveLength(1);
      expect(points.length % 2).toBe(0);
      expect(points.slice(0, 2)).toEqual(points.slice(-2));
      expect(points.every((value) => value >= 0 && value <= lines.width)).toBe(true);
      expect(description).toBeTruthy();
      expect(heightInPage).toBeGreaterThan(0);
    }
  });

  it("keeps the corners of a checkmark sharp by doubling each corner", () => {
    const [{ points }] = markShape("check").lines.curves;
    expect(points.slice(0, 4)).toEqual([4, 54, 4, 54]);
  });
});

describe("dateLabel", () => {
  const date = new Date(2026, 10, 2);

  it("writes the date with a four-digit year in the reader's format", () => {
    expect(dateLabel(date, "en-US")).toBe("11/02/2026");
    expect(dateLabel(date, "de-DE")).toBe("02.11.2026");
  });

  it("falls back to an ISO date when the format has no plain digits", () => {
    expect(dateLabel(date, "ar-EG")).toBe("2026-11-02");
  });
});
