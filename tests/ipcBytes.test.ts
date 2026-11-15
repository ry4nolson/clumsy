import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { chunksOf } from "../src/lib/ipcBytes";

describe("chunksOf", () => {
  it("splits bytes into pieces that join back to the original", () => {
    const bytes = Uint8Array.from({ length: 10 }, (_, index) => index);
    const chunks = chunksOf(bytes, 4);
    expect(chunks.map((chunk) => chunk.length)).toEqual([4, 4, 2]);
    expect(chunks.flatMap((chunk) => [...chunk])).toEqual([...bytes]);
  });

  it("sends nothing for an empty document", () => {
    expect(chunksOf(new Uint8Array(), 4)).toEqual([]);
  });
});
