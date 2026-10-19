import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "../src/lib/recent";

const minute = 60 * 1000;
const hour = 60 * minute;
const day = 24 * hour;
const now = Date.UTC(2026, 9, 19, 12);

describe("formatRelativeTime", () => {
  it("says just now for the last minute and for clock skew", () => {
    expect(formatRelativeTime(now - 30 * 1000, now)).toBe("just now");
    expect(formatRelativeTime(now + 5 * minute, now)).toBe("just now");
  });

  it("uses the largest whole unit", () => {
    expect(formatRelativeTime(now - 5 * minute, now)).toBe("5 minutes ago");
    expect(formatRelativeTime(now - 3 * hour, now)).toBe("3 hours ago");
    expect(formatRelativeTime(now - 1 * day, now)).toBe("yesterday");
    expect(formatRelativeTime(now - 10 * day, now)).toBe("last week");
    expect(formatRelativeTime(now - 400 * day, now)).toBe("last year");
  });
});
