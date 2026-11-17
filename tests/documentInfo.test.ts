import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFString } from "@cantoo/pdf-lib";
import { attachmentKind, listAttachments, pdfNameFor, safeFileName, type AttachmentAnnotation, type CatalogEntry } from "../src/lib/attachments";
import { cleanText, folderOf, formatFileSize, formatPageSize, pageBoxSize, paperName, propertySections, usesInches, type PropertiesInput } from "../src/lib/documentProperties";
import { changedLayers, countLayers, layerIds, layerTree, parseSavedLayers, restoreLayers, type LayerGroup, type OrderItem } from "../src/lib/layers";
import { openPdf } from "./pdfjsNode";

const baseInput: PropertiesInput = {
  name: "Plans.pdf",
  path: "/Users/me/Jobs/Plans.pdf",
  size: 2_345_678,
  title: "Site plans",
  author: null,
  subject: null,
  keywords: null,
  created: new Date(2024, 0, 2, 9, 30),
  modified: null,
  creator: "CAD",
  producer: null,
  version: "1.7",
  pageCount: 12,
  pageNumber: 3,
  pageSize: { width: 2592, height: 1728 },
  language: null,
  tagged: false,
  linearized: true,
  passwordToOpen: false,
  restricted: false,
  form: "none",
  signed: false,
  attachments: 2,
  layers: 0,
};

describe("document properties", () => {
  it("names standard paper sizes either way round", () => {
    expect(paperName(612, 792)).toBe("Letter");
    expect(paperName(792, 612)).toBe("Letter");
    expect(paperName(595.28, 841.89)).toBe("A4");
    expect(paperName(2592, 1728)).toBe("ARCH D");
    expect(paperName(500, 500)).toBeNull();
  });

  it("uses inches only where people measure in them", () => {
    expect(usesInches("en-US")).toBe(true);
    expect(usesInches("en")).toBe(true);
    expect(usesInches("en-GB")).toBe(false);
    expect(usesInches("de-DE")).toBe(false);
    expect(usesInches("not a locale")).toBe(false);
  });

  it("formats page sizes with the paper name and orientation", () => {
    expect(formatPageSize(612, 792, "en-US")).toBe("8.5 × 11 in (Letter, Portrait)");
    expect(formatPageSize(841.89, 595.28, "en-GB")).toBe("297 × 210 mm (A4, Landscape)");
    expect(formatPageSize(500, 400, "en-US")).toBe("6.94 × 5.56 in (Landscape)");
  });

  it("formats file sizes with the exact byte count", () => {
    expect(formatFileSize(512, "en-US")).toBe("512 bytes");
    expect(formatFileSize(2_345_678, "en-US")).toBe("2.3 MB (2,345,678 bytes)");
  });

  it("finds the folder of local paths only", () => {
    expect(folderOf("/Users/me/Plans.pdf")).toBe("/Users/me");
    expect(folderOf("C:\\Jobs\\Plans.pdf")).toBe("C:\\Jobs");
    expect(folderOf("content://com.android/document/12/Plans.pdf")).toBeNull();
    expect(folderOf(null)).toBeNull();
  });

  it("measures the page box with its rotation and user unit", () => {
    expect(pageBoxSize([0, 0, 612, 792], 0)).toEqual({ width: 612, height: 792 });
    expect(pageBoxSize([0, 0, 612, 792], 270)).toEqual({ width: 792, height: 612 });
    expect(pageBoxSize([10, 10, 110, 60], -90, 2)).toEqual({ width: 100, height: 200 });
  });

  it("cleans info strings", () => {
    expect(cleanText("  Plans\u0000 rev 2 ")).toBe("Plans rev 2");
    expect(cleanText("   ")).toBeNull();
    expect(cleanText(4)).toBeNull();
  });

  it("leaves out empty rows and sections", () => {
    const sections = propertySections(baseInput, "en-US");
    expect(sections.map((section) => section.title)).toEqual(["File", "Description", "Origin", "Document", "Contents"]);
    const rows = Object.fromEntries(sections.flatMap((section) => section.rows));
    expect(rows).toMatchObject({
      Name: "Plans.pdf",
      Location: "/Users/me/Jobs",
      Title: "Site plans",
      Application: "CAD",
      "PDF version": "1.7",
      Pages: "12",
      "Page size (page 3)": "36 × 24 in (ARCH D, Landscape)",
      Tagged: "No",
      "Fast web view": "Yes",
      Attachments: "2 files",
    });
    expect(rows).not.toHaveProperty("Author");
    expect(rows).not.toHaveProperty("Security");
    expect(rows).not.toHaveProperty("Layers");
  });

  it("describes security and forms", () => {
    const rows = (input: Partial<PropertiesInput>) => Object.fromEntries(propertySections({ ...baseInput, ...input }, "en-US").flatMap((section) => section.rows));
    expect(rows({ passwordToOpen: true, restricted: true }).Security).toBe("Needs a password to open");
    expect(rows({ restricted: true }).Security).toBe("Restrictions set, no password to open");
    expect(rows({ form: "fillable" }).Form).toBe("Fillable form");
    expect(rows({ form: "xfa" }).Form).toMatch(/^XFA form/);
    expect(rows({ pageCount: 1, pageNumber: 1 })).toHaveProperty("Page size");
  });
});

describe("attachments", () => {
  it("keeps only a file name", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\temp\\report.xlsx")).toBe("report.xlsx");
    expect(safeFileName("a<b>:c?.txt")).toBe("abc.txt");
    expect(safeFileName("..")).toBe("attachment");
    expect(safeFileName("")).toBe("attachment");
  });

  it("lists catalog files by name, then page attachments by page", () => {
    const catalog = new Map<string, CatalogEntry>([
      ["b.txt", { filename: "b.txt", description: "" }],
      ["A10.pdf", { filename: "A10.pdf", description: " Sheet " }],
      ["A9.pdf", { filename: "A9.pdf" }],
    ]);
    const annotations: AttachmentAnnotation[] = [
      { id: "20R", pageIndex: 4, fileId: "20R", file: { filename: "late.csv" } },
      { id: "12R", pageIndex: 1, fileId: "12R", file: { filename: "early.md", description: "notes" } },
      { id: "13R", pageIndex: 2 },
    ];
    const list = listAttachments(catalog, annotations);
    expect(list.map((entry) => entry.filename)).toEqual(["A9.pdf", "A10.pdf", "b.txt", "early.md", "late.csv"]);
    expect(list[1]).toMatchObject({ contentId: "A10.pdf", description: "Sheet", page: null });
    expect(list[3]).toMatchObject({ contentId: "12R", page: 1, description: "notes" });
    expect(listAttachments(null, [])).toEqual([]);
  });

  it("opens PDFs and Markdown, by name or by a PDF header", () => {
    expect(attachmentKind("Spec.PDF")).toBe("pdf");
    expect(attachmentKind("README.md")).toBe("markdown");
    expect(attachmentKind("notes.markdown")).toBe("markdown");
    expect(attachmentKind("setup.exe")).toBe("other");
    expect(attachmentKind("scan.bin", new TextEncoder().encode("junk%PDF-1.7\n"))).toBe("pdf");
    expect(attachmentKind("scan.bin", new TextEncoder().encode("plain text"))).toBe("other");
    expect(pdfNameFor("scan.bin")).toBe("scan.bin.pdf");
    expect(pdfNameFor("a.pdf")).toBe("a.pdf");
  });
});

const groups = (entries: Array<[string, string, boolean]>) => new Map<string, LayerGroup>(entries.map(([id, name, visible]) => [id, { name, visible }]));

describe("layers", () => {
  const all = groups([
    ["1R", "Walls", true],
    ["2R", "Doors", false],
    ["3R", "Electrical", true],
    ["4R", "Hidden", true],
  ]);

  it("builds a tree from the order, flattening unnamed groups", () => {
    const order: OrderItem[] = ["1R", { name: "MEP", order: ["3R", "missing"] }, { name: null, order: ["4R"] }, ["2R"], "1R", { name: "Empty", order: [] }];
    const tree = layerTree(order, (id) => all.get(id) ?? null);
    expect(tree).toEqual([
      { kind: "layer", id: "1R", name: "Walls", visible: true },
      { kind: "label", name: "MEP", children: [{ kind: "layer", id: "3R", name: "Electrical", visible: true }] },
      { kind: "layer", id: "4R", name: "Hidden", visible: true },
      { kind: "layer", id: "2R", name: "Doors", visible: false },
    ]);
    expect(countLayers(tree)).toBe(4);
    expect(layerIds(tree)).toEqual(["1R", "3R", "4R", "2R"]);
    expect(layerTree(null, () => null)).toEqual([]);
  });

  it("stops at absurd nesting", () => {
    let order: OrderItem[] = ["1R"];
    for (let depth = 0; depth < 100; depth += 1) {
      order = [{ name: `level ${depth}`, order }];
    }
    expect(countLayers(layerTree(order, (id) => all.get(id) ?? null))).toBe(0);
  });

  it("remembers only what the user changed", () => {
    const initial = new Map([...all].map(([id, group]) => [id, group.visible]));
    const now = groups([
      ["1R", "Walls", false],
      ["2R", "Doors", false],
      ["3R", "Electrical", true],
      ["4R", "Hidden", true],
    ]);
    expect(changedLayers(initial, now)).toEqual([{ id: "1R", name: "Walls", visible: false }]);
  });

  it("restores by id when the name agrees, else by a unique name", () => {
    const renumbered = groups([
      ["7R", "Walls", true],
      ["2R", "Doors", false],
      ["8R", "Notes", true],
      ["9R", "Notes", true],
    ]);
    const saved = [
      { id: "1R", name: "Walls", visible: false },
      { id: "2R", name: "Doors", visible: true },
      { id: "5R", name: "Notes", visible: false },
      { id: "6R", name: "Gone", visible: false },
    ];
    expect(restoreLayers(saved, renumbered)).toEqual([
      ["7R", false],
      ["2R", true],
    ]);
    expect(restoreLayers(undefined, renumbered)).toEqual([]);
  });

  it("parses saved layers defensively", () => {
    expect(parseSavedLayers([{ id: "1R", name: "Walls", visible: false }, { id: 2 }, null])).toEqual([{ id: "1R", name: "Walls", visible: false }]);
    expect(parseSavedLayers("nope")).toBeUndefined();
    expect(parseSavedLayers([])).toBeUndefined();
  });
});

async function documentWithEverything() {
  const doc = await PDFDocument.create();
  doc.setTitle("Fixture");
  doc.addPage([612, 792]);
  const second = doc.addPage([792, 612]);
  await doc.attach(new TextEncoder().encode("# Notes\n"), "notes.md", { description: "Field notes", mimeType: "text/markdown" });
  const { context } = doc;
  const embedded = context.register(context.flateStream(new TextEncoder().encode("a,b\n1,2\n"), { Type: "EmbeddedFile" }));
  const fileSpec = context.obj({ Type: "Filespec", F: PDFString.of("takeoff.csv"), UF: PDFString.of("takeoff.csv"), EF: { F: embedded }, Desc: PDFString.of("Counts") });
  const annotation = context.register(
    context.obj({ Type: "Annot", Subtype: "FileAttachment", Rect: [100, 100, 120, 120], FS: fileSpec, Contents: PDFString.of("Counts") }),
  );
  second.node.set(PDFName.of("Annots"), context.obj([annotation]));
  const layer = (name: string) => context.register(context.obj({ Type: "OCG", Name: PDFString.of(name) }));
  const walls = layer("Walls");
  const doors = layer("Doors");
  const power = layer("Power");
  const order = PDFArray.withContext(context);
  order.push(walls);
  order.push(context.obj([PDFString.of("MEP"), power]));
  order.push(doors);
  const config = context.obj({ Order: order, OFF: [doors] });
  doc.catalog.set(PDFName.of("OCProperties"), context.obj({ OCGs: [walls, doors, power], D: config }));
  const page = doc.getPage(0).node;
  const resources = page.get(PDFName.of("Resources"));
  if (resources instanceof PDFDict) {
    resources.set(PDFName.of("Properties"), context.obj({ W: walls }));
  }
  page.set(PDFName.of("UserUnit"), PDFNumber.of(1));
  return doc.save();
}

describe("document info against pdf.js", () => {
  it("lists both kinds of attachments and reads their content", async () => {
    const pdf = await openPdf(await documentWithEverything());
    const catalog = (await pdf.getAttachments()) as Map<string, CatalogEntry> | null;
    const annotations = (await pdf.getAnnotationsByType(new Set([17]), new Set())) as AttachmentAnnotation[];
    const list = listAttachments(catalog, annotations);
    expect(list.map(({ filename, description, page }) => ({ filename, description, page }))).toEqual([
      { filename: "notes.md", description: "Field notes", page: null },
      { filename: "takeoff.csv", description: "Counts", page: 1 },
    ]);
    const contents = await Promise.all(list.map((entry) => pdf.getAttachmentContent(entry.contentId!)));
    expect(contents.map((bytes) => new TextDecoder().decode(bytes!))).toEqual(["# Notes\n", "a,b\n1,2\n"]);
    await pdf.loadingTask.destroy();
  });

  it("builds the layer tree pdf.js reads and restores changes", async () => {
    const pdf = await openPdf(await documentWithEverything());
    const config = await pdf.getOptionalContentConfig({ intent: "display" });
    const lookup = (id: string) => config.getGroup(id) as LayerGroup | null;
    const tree = layerTree(config.getOrder() as OrderItem[], lookup);
    expect(tree.map((node) => (node.kind === "layer" ? [node.name, node.visible] : [node.name, node.children.map((child) => child.kind === "layer" && child.name)]))).toEqual([
      ["Walls", true],
      ["MEP", ["Power"]],
      ["Doors", false],
    ]);
    const entries = () => [...config] as Array<[string, LayerGroup]>;
    const initial = new Map(entries().map(([id, group]) => [id, group.visible]));
    const wallsId = layerIds(tree)[0];
    config.setVisibility(wallsId, false);
    const saved = changedLayers(initial, entries());
    expect(saved).toEqual([{ id: wallsId, name: "Walls", visible: false }]);
    const fresh = await pdf.getOptionalContentConfig({ intent: "display" });
    expect(restoreLayers(saved, [...fresh] as Array<[string, LayerGroup]>)).toEqual([[wallsId, false]]);
    await pdf.loadingTask.destroy();
  });
});
