import { describe, expect, it } from "vitest";
import { trimHistory } from "../src/lib/pageHistory";

const version = (size: number, page = 0) => ({ bytes: new Uint8Array(size), page, count: 1 });

describe("trimHistory", () => {
  it("keeps the newest versions up to the count limit", () => {
    const versions = [0, 1, 2, 3].map((page) => version(1, page));
    expect(trimHistory(versions, 2).map((entry) => entry.page)).toEqual([2, 3]);
  });

  it("drops the oldest versions once they'd go over the byte budget", () => {
    const versions = [version(60, 0), version(30, 1), version(30, 2)];
    expect(trimHistory(versions, 20, 100).map((entry) => entry.page)).toEqual([1, 2]);
  });

  it("always keeps the newest version, even if it's over budget on its own", () => {
    expect(trimHistory([version(10, 0), version(500, 1)], 20, 100).map((entry) => entry.page)).toEqual([1]);
  });
});
