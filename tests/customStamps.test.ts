import { describe, expect, it } from "vitest";
import { runsOf } from "../src/lib/markupSvg";
import { winAnsiSafe } from "../src/lib/winAnsi";
import {
  CUSTOM_STAMPS_KEY,
  cleanText,
  MAX_CUSTOM_STAMPS,
  MAX_IMAGE_CHARS,
  customStamp,
  fitSize,
  inLibrary,
  libraryStamps,
  nameFromFile,
  parseCustomStamp,
  parseLibrary,
  readLibrary,
  registerStamps,
  renamedStamp,
  setLibrary,
  stampsFor,
  withoutStamp,
  writeLibrary,
  type CustomStamp,
} from "../src/lib/customStamps";
import { draftFor, stampHeight } from "../src/lib/markupDraft";
import { readRecentStamps } from "../src/lib/markupParams";
import { isKnownStamp, searchStamps, stampAspect, stampColor, stampDesign, stampLabel } from "../src/lib/stampSymbols";

const text = (id: string, patch: Partial<CustomStamp> = {}): CustomStamp => ({ id, name: "Approved as Noted", kind: "text", text: "Approved as Noted", color: [0.1, 0.2, 0.3], date: true, ...patch }) as CustomStamp;
const image = (id: string, patch: Partial<CustomStamp> = {}): CustomStamp =>
  ({ id, name: "Logo", kind: "image", mime: "image/png", data: "iVBORw0KGgo=", width: 200, height: 100, ...patch }) as CustomStamp;

function memoryStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe("custom stamp library", () => {
  it("keeps well-formed stamps and drops the rest", () => {
    const list = [
      text("custom:a"),
      image("custom:b"),
      text("custom:a", { name: "Duplicate" }),
      { ...text("custom:c"), color: [2, 0, 0] },
      { ...image("custom:d"), data: "not base64!" },
      { ...image("custom:e"), width: 0 },
      { ...image("custom:f"), mime: "image/gif" },
      text("review:approved"),
      { ...text("custom:g"), text: "   " },
      "junk",
    ];
    expect(parseLibrary(JSON.stringify(list)).map((stamp) => stamp.id)).toEqual(["custom:a", "custom:b"]);
    expect(parseLibrary("{")).toEqual([]);
    expect(parseLibrary(null)).toEqual([]);
  });

  it("cleans names and text", () => {
    const parsed = parseCustomStamp({ ...text("custom:a"), name: "  ", text: `  ${"Long ".repeat(20)}` });
    expect(parsed?.kind === "text" && parsed.text.length).toBe(40);
    expect(parsed?.name).toBe(parsed?.kind === "text" ? parsed.text : "");
    expect(parseCustomStamp({ ...image("custom:b"), name: "" })?.name).toBe("Image");
  });

  it("refuses more stamps or more characters than the caps allow", () => {
    const store = memoryStore();
    const many = Array.from({ length: MAX_CUSTOM_STAMPS + 1 }, (_, index) => text(`custom:${index}`));
    expect(writeLibrary(many, store)).toBe("count");
    const big = Array.from({ length: 4 }, (_, index) => image(`custom:${index}`, { data: "A".repeat(MAX_IMAGE_CHARS) }));
    expect(writeLibrary(big, store)).toBe("size");
    expect(store.values.size).toBe(0);
    expect(writeLibrary([text("custom:a")], store)).toBeNull();
    expect(readLibrary(store).map((stamp) => stamp.id)).toEqual(["custom:a"]);
    expect(writeLibrary([text("custom:a")], { getItem: () => null, setItem: () => { throw new Error("quota"); } })).toBe("storage");
  });

  it("renames and deletes by id", () => {
    const list = [text("custom:a"), image("custom:b")];
    expect(renamedStamp(list, "custom:b", "  Company   logo ").map((stamp) => stamp.name)).toEqual(["Approved as Noted", "Company logo"]);
    expect(renamedStamp(list, "custom:b", "   ")[1].name).toBe("Logo");
    expect(withoutStamp(list, "custom:a").map((stamp) => stamp.id)).toEqual(["custom:b"]);
    expect(CUSTOM_STAMPS_KEY).toBe("clumsy.customStamps");
  });

  it("keeps deleted stamps drawable while dropping them from the library", () => {
    setLibrary([text("custom:keep"), image("custom:gone")]);
    setLibrary([text("custom:keep")]);
    expect(inLibrary("custom:gone")).toBe(false);
    expect(customStamp("custom:gone")?.kind).toBe("image");
    expect(libraryStamps().map((stamp) => stamp.id)).toEqual(["custom:keep"]);
    expect(isKnownStamp("custom:keep")).toBe(true);
    expect(isKnownStamp("custom:gone")).toBe(false);
  });

  it("lets the library win over a document's copy and never the reverse", () => {
    setLibrary([text("custom:mine", { name: "Mine" })]);
    registerStamps([text("custom:mine", { name: "From file" }), text("custom:doc", { name: "Doc" })]);
    expect(customStamp("custom:mine")?.name).toBe("Mine");
    expect(customStamp("custom:doc")?.name).toBe("Doc");
    expect(inLibrary("custom:doc")).toBe(false);
  });

  it("collects the custom stamps a set of markup uses", () => {
    setLibrary([text("custom:a"), image("custom:b")]);
    const found = stampsFor([{ stamp: "custom:a" }, { stamp: "custom:a" }, { stamp: "review:void" }, { stamp: null }, { stamp: "custom:missing" }]);
    expect(found.map((stamp) => stamp.id)).toEqual(["custom:a"]);
  });

  it("fits images without enlarging rasters", () => {
    expect(fitSize(4000, 1000, 1024, false)).toEqual({ width: 1024, height: 256 });
    expect(fitSize(300, 600, 1024, false)).toEqual({ width: 300, height: 600 });
    expect(fitSize(30, 60, 1024, true)).toEqual({ width: 512, height: 1024 });
    expect(nameFromFile("Company Logo.final.png")).toBe("Company Logo.final");
    expect(nameFromFile(".png")).toBe("Image");
  });
});

describe("custom stamps in the stamp lookups", () => {
  it("designs, labels, colors, and searches custom stamps", () => {
    setLibrary([text("custom:t", { name: "Field Verify", text: "FIELD VERIFY", color: [0, 0.5, 0] }), image("custom:i", { name: "Seal" })]);
    expect(stampDesign("custom:t", "11/16/2026")?.labels.map((label) => label.text)).toEqual(["FIELD VERIFY", "11/16/2026"]);
    expect(stampDesign("custom:i")?.image?.id).toBe("custom:i");
    expect(stampAspect("custom:i")).toBe(2);
    expect(stampLabel("custom:i")).toBe("Seal");
    expect(stampLabel("custom:unknown")).toBe("Custom Stamp");
    expect(stampColor("custom:t")).toEqual([0, 0.5, 0]);
    expect(stampColor("custom:i")).toBeNull();
    expect(searchStamps("verify").custom.map((stamp) => stamp.id)).toEqual(["custom:t"]);
    expect(searchStamps("seal").custom.map((stamp) => stamp.id)).toEqual(["custom:i"]);
    expect(searchStamps("").custom).toHaveLength(2);
  });

  it("measures lowercase words narrower than capitals", () => {
    setLibrary([text("custom:lower", { text: "approved as noted" }), text("custom:upper", { text: "APPROVED AS NOTED" })]);
    expect(stampDesign("custom:lower")!.width).toBeLessThan(stampDesign("custom:upper")!.width);
  });

  it("places image stamps at 96 pt on their longest side and text stamps like review stamps", () => {
    setLibrary([text("custom:t"), image("custom:wide"), image("custom:tall", { width: 100, height: 400 })]);
    expect(stampHeight("custom:wide")).toBe(48);
    expect(stampHeight("custom:tall")).toBe(96);
    expect(stampHeight("custom:t")).toBe(40);
    const style = { color: [1, 0, 0], fill: false, width: 2, opacity: 1 };
    const draft = { pageIndex: 0, start: [100, 100] as [number, number], end: [100, 100] as [number, number], shift: false, moved: false, rotation: 0 };
    const placed = draftFor({ kind: "stamp", stamp: "custom:t" }, draft, style, () => "11/16/2026")!;
    expect(placed.stampDate).toBe("11/16/2026");
    expect(placed.color).toEqual([0.1, 0.2, 0.3]);
    const logo = draftFor({ kind: "stamp", stamp: "custom:wide" }, draft, style, () => "11/16/2026")!;
    expect(logo.stampDate).toBeNull();
    expect(logo.box).toEqual([52, 76, 148, 124]);
  });

  it("only remembers recent custom stamps that are still in the library", () => {
    setLibrary([text("custom:a")]);
    const store = memoryStore({ "clumsy.recentStamps": JSON.stringify(["custom:a", "custom:deleted", "review:void"]) });
    expect(readRecentStamps(store)).toEqual(["custom:a", "review:void"]);
  });
});

describe("custom stamp text and drawing order", () => {
  it("keeps WinAnsi punctuation and replaces what Helvetica can't encode", () => {
    expect(winAnsiSafe("Approved – J.D.’s “OK” … €5")).toBe("Approved – J.D.’s “OK” … €5");
    expect(winAnsiSafe("Done ✓ 完成")).toBe("Done ? ??");
    expect(cleanText("  Owner’s   review ✓ ")).toBe("Owner’s review ?");
  });

  it("refuses image data that doesn't start like its type", () => {
    expect(parseCustomStamp(image("custom:a", { data: "/9j/4AAQ" }))).toBeNull();
    expect(parseCustomStamp(image("custom:b", { mime: "image/jpeg", data: "/9j/4AAQ" }))?.kind).toBe("image");
  });

  it("groups markup into runs that keep their order", () => {
    const entries = [false, false, true, false, true, true].map((image, index) => ({ image, index }));
    expect(runsOf(entries).map((run) => run.map((entry) => entry.index))).toEqual([[0, 1], [2], [3], [4, 5]]);
    expect(runsOf([])).toEqual([]);
  });
});
