import { describe, expect, it } from "vitest";
import { LEGACY_SIGNATURE_KEY, MAX_SAVED_SIGNATURES, SIGNATURES_KEY, clearLegacySignature, parseSignatures, readLegacySignature, readSignatures, withSignature, withoutSignature, writeSignatures } from "../src/lib/signatures";

const entry = (uuid: string) => ({ uuid, description: `Sig ${uuid}`, signatureData: `data-${uuid}` });

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe("parseSignatures", () => {
  it("returns an empty list for missing or broken data", () => {
    expect(parseSignatures(null)).toEqual([]);
    expect(parseSignatures("not json")).toEqual([]);
    expect(parseSignatures('{"uuid":"a"}')).toEqual([]);
  });

  it("keeps only well-formed entries, up to the limit", () => {
    const list = [entry("a"), { uuid: "b" }, entry("c"), ...["d", "e", "f", "g"].map(entry)];
    expect(parseSignatures(JSON.stringify(list)).map((item) => item.uuid)).toEqual(["a", "c", "d", "e", "f"]);
  });
});

describe("withSignature and withoutSignature", () => {
  it("adds until the list is full", () => {
    const full = Array.from({ length: MAX_SAVED_SIGNATURES }, (_, index) => entry(String(index)));
    expect(withSignature(full.slice(1), entry("new"))?.at(-1)?.uuid).toBe("new");
    expect(withSignature(full, entry("new"))).toBeNull();
  });

  it("removes by uuid", () => {
    expect(withoutSignature([entry("a"), entry("b")], "a")).toEqual([entry("b")]);
  });
});

describe("storage", () => {
  it("round-trips the saved list", () => {
    const storage = memoryStorage();
    expect(writeSignatures([entry("a")], storage)).toBe(true);
    expect(readSignatures(storage)).toEqual([entry("a")]);
    expect(storage.values.has(SIGNATURES_KEY)).toBe(true);
  });

  it("keeps the legacy image signature until it's cleared", () => {
    const storage = memoryStorage({ [LEGACY_SIGNATURE_KEY]: "data:image/png;base64,AAAA" });
    expect(readLegacySignature(storage)).toBe("data:image/png;base64,AAAA");
    expect(readLegacySignature(storage)).toBe("data:image/png;base64,AAAA");
    clearLegacySignature(storage);
    expect(readLegacySignature(storage)).toBeNull();
  });

  it("ignores a legacy value that isn't an image", () => {
    expect(readLegacySignature(memoryStorage({ [LEGACY_SIGNATURE_KEY]: "javascript:alert(1)" }))).toBeNull();
  });
});
