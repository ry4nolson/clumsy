import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName, PDFString, type SecurityOptions } from "@cantoo/pdf-lib";
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { decryptPdf, extractPages } from "../src/lib/pageEdits";
import { oneAtATime, pagesToPrint, printableBytes, printJobName, printWithFallback, rasterDpi, saveKeepingModified, type PrintOps, type PrintSteps } from "../src/lib/print";
import type { PrintOutcome } from "../src/lib/platform";

Promise.withResolvers ??= <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

const buffers = ArrayBuffer.prototype as ArrayBuffer & { transferToFixedLength?: (length?: number) => ArrayBuffer };
buffers.transferToFixedLength ??= function (this: ArrayBuffer, length = this.byteLength) {
  const copy = new ArrayBuffer(length);
  new Uint8Array(copy).set(new Uint8Array(this, 0, Math.min(length, this.byteLength)));
  return copy;
};

const standardFontDataUrl = new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url).pathname;

const ops: PrintOps = { extract: extractPages, decrypt: decryptPdf };

async function makeForm(pageCount = 3) {
  const doc = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    const page = doc.addPage([600, 800]);
    doc.getForm().createTextField(`field${index}`).addToPage(page, { x: 50, y: 700, width: 200, height: 24 });
    const note = doc.context.obj({
      Type: "Annot",
      Subtype: "Square",
      Rect: [100, 100, 200, 200],
      C: [1, 0, 0],
      F: 4,
      Contents: PDFString.of(`box ${index}`),
    });
    page.node.set(PDFName.of("Annots"), doc.context.obj([...(page.node.Annots()?.asArray() ?? []), doc.context.register(note)]));
  }
  return doc;
}

async function encrypted(options: SecurityOptions, pageCount = 3) {
  const doc = await makeForm(pageCount);
  doc.encrypt(options);
  return doc.save();
}

async function open(bytes: Uint8Array, password?: string) {
  return getDocument({ data: bytes.slice(), password, standardFontDataUrl, isEvalSupported: false, verbosity: 0 }).promise;
}

async function widgets(doc: PDFDocumentProxy) {
  const found = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
    found.push(...(await (await doc.getPage(number)).getAnnotations()).filter((annotation) => annotation.subtype === "Widget"));
  }
  return found;
}

async function typedValues(doc: PDFDocumentProxy) {
  return Object.fromEntries((await widgets(doc)).map((widget) => [widget.fieldName, widget.fieldValue]));
}

async function squares(doc: PDFDocumentProxy) {
  const found: string[] = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
    for (const annotation of await (await doc.getPage(number)).getAnnotations()) {
      if (annotation.subtype === "Square") {
        found.push(annotation.contentsObj.str);
      }
    }
  }
  return found;
}

async function fillIn(doc: PDFDocumentProxy, values: Record<string, string>) {
  for (const widget of await widgets(doc)) {
    if (widget.fieldName in values) {
      doc.annotationStorage.setValue(widget.id, { value: values[widget.fieldName] });
    }
  }
  return doc.saveDocument();
}

describe("pagesToPrint", () => {
  it("prints the whole document for Print", () => {
    expect(pagesToPrint("print", [1, 2], 5)).toBeNull();
  });

  it("prints the selection, in page order, for Print Selected Pages", () => {
    expect(pagesToPrint("printSelectedPages", [3, 0, 3], 5)).toEqual([0, 3]);
  });

  it("prints the whole document when the selection covers every page or nothing valid", () => {
    expect(pagesToPrint("printSelectedPages", [0, 1, 2], 3)).toBeNull();
    expect(pagesToPrint("printSelectedPages", [7, -1], 3)).toBeNull();
  });

  it("drops pages that no longer exist", () => {
    expect(pagesToPrint("printSelectedPages", [1, 9], 4)).toEqual([1]);
  });
});

describe("printableBytes", () => {
  it("hands over the saved bytes untouched for a plain full print", async () => {
    const bytes = await (await makeForm()).save();
    expect(await printableBytes(bytes, null, null, ops)).toBe(bytes);
  });

  it("keeps typed form values and markup", async () => {
    const saved = await fillIn(await open(await (await makeForm()).save()), { field0: "Ryan", field2: "Olson" });
    const printed = await open(await printableBytes(saved, null, null, ops));
    expect(printed.numPages).toBe(3);
    expect(await typedValues(printed)).toMatchObject({ field0: "Ryan", field2: "Olson" });
    expect(await squares(printed)).toEqual(["box 0", "box 1", "box 2"]);
  });

  it("prints only the selected pages, with their values and markup", async () => {
    const saved = await fillIn(await open(await (await makeForm()).save()), { field0: "Ryan", field1: "gone", field2: "Olson" });
    const printed = await open(await printableBytes(saved, [0, 2], null, ops));
    expect(printed.numPages).toBe(2);
    expect(await squares(printed)).toEqual(["box 0", "box 2"]);
    const values = await typedValues(printed);
    expect(values).toMatchObject({ field0: "Ryan", field2: "Olson" });
    expect(values).not.toHaveProperty("field1");
  });
});

describe("printing encrypted files", () => {
  const cases: Array<[string, SecurityOptions, string]> = [
    ["a user password", { userPassword: "secret", ownerPassword: "owner" }, "secret"],
    ["a user password, opened with the owner password", { userPassword: "secret", ownerPassword: "owner" }, "owner"],
    ["only an owner password, printing and copying denied", { ownerPassword: "owner", permissions: { printing: false, copying: false } }, ""],
    ["only an owner password, low-resolution printing", { ownerPassword: "owner", permissions: { printing: "lowResolution" } }, ""],
    ["AES-128", { userPassword: "secret", ownerPassword: "owner", algorithm: "AES-128" }, "secret"],
    ["RC4-128", { userPassword: "secret", ownerPassword: "owner", algorithm: "RC4-128", allowWeakCryptography: true }, "secret"],
  ];

  for (const [label, options, password] of cases) {
    it(`decrypts ${label}`, async () => {
      const bytes = await encrypted(options);
      const source = await open(bytes, password || undefined);
      const saved = await fillIn(source, { field1: "typed" });
      const printed = await printableBytes(saved, null, password, ops);
      expect((await PDFDocument.load(printed)).isEncrypted).toBe(false);
      const reopened = await open(printed);
      expect(await reopened.getPermissions()).toBeNull();
      expect(reopened.numPages).toBe(3);
      expect(await typedValues(reopened)).toMatchObject({ field1: "typed" });
      expect(await squares(reopened)).toEqual(["box 0", "box 1", "box 2"]);
    });
  }

  it("decrypts while printing selected pages", async () => {
    const bytes = await encrypted({ userPassword: "secret", ownerPassword: "owner" });
    const saved = await fillIn(await open(bytes, "secret"), { field2: "kept" });
    const printed = await open(await printableBytes(saved, [2], "secret", ops));
    expect(await printed.getPermissions()).toBeNull();
    expect(printed.numPages).toBe(1);
    expect(await typedValues(printed)).toMatchObject({ field2: "kept" });
  });

  it("keeps strings with parentheses and backslashes intact", async () => {
    for (const algorithm of ["AES-256", "AES-128", "RC4-128"] as const) {
      const doc = await makeForm(1);
      doc.getPage(0).node.Annots()!.lookup(1, PDFDict).set(PDFName.of("Contents"), PDFString.of("a \\( b \\\\ c"));
      doc.encrypt({ userPassword: "secret", ownerPassword: "owner", algorithm, allowWeakCryptography: true });
      const saved = await fillIn(await open(await doc.save(), "secret"), { field0: "Smith (Jr. \\ x" });
      const printed = await open(await printableBytes(saved, null, "secret", ops));
      expect(await squares(printed), algorithm).toEqual(["a ( b \\ c"]);
      expect(await typedValues(printed), algorithm).toMatchObject({ field0: "Smith (Jr. \\ x" });
    }
  });

  it("writes a readable file from pdf.js's saves of RC4 files, whatever their file ID", async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const bytes = await encrypted({ userPassword: "secret", ownerPassword: "owner", algorithm: "RC4-128", allowWeakCryptography: true });
      const saved = await fillIn(await open(bytes, "secret"), { field1: "typed" });
      expect(await typedValues(await open(await printableBytes(saved, null, "secret", ops)))).toMatchObject({ field1: "typed" });
    }
  });

  it("fails when the saved bytes can't be decrypted, so the print falls back to images", async () => {
    const bytes = await encrypted({ userPassword: "secret", ownerPassword: "owner" });
    await expect(printableBytes(bytes, null, "nope", ops)).rejects.toThrow();
  });

  it("still fails when selected pages can't be decrypted", async () => {
    const bytes = await encrypted({ userPassword: "secret", ownerPassword: "owner" });
    await expect(printableBytes(bytes, [0], "nope", ops)).rejects.toThrow();
  });
});

describe("printWithFallback", () => {
  const steps = (outcomes: PrintOutcome[], images: Uint8Array | null = new Uint8Array([2])) => {
    const sent: number[][] = [];
    let rendered = 0;
    const plan: PrintSteps = {
      ...ops,
      send: async (bytes) => {
        sent.push([...bytes.slice(0, 1)]);
        return outcomes.shift() ?? "shown";
      },
      asImages: async () => {
        rendered += 1;
        return images;
      },
    };
    return { plan, sent, rendered: () => rendered };
  };

  it("prints the saved bytes and never renders images when PDFKit takes them", async () => {
    const run = steps(["shown"]);
    expect(await printWithFallback(new Uint8Array([1]), null, null, run.plan)).toBe("shown");
    expect(run.sent).toEqual([[1]]);
    expect(run.rendered()).toBe(0);
  });

  it("prints the pages as images when PDFKit can't read the file", async () => {
    const run = steps(["unreadable", "shown"]);
    expect(await printWithFallback(new Uint8Array([1]), null, null, run.plan)).toBe("shown");
    expect(run.sent).toEqual([[1], [2]]);
  });

  it("goes straight to images when the file can't be decrypted", async () => {
    const bytes = await encrypted({ userPassword: "secret", ownerPassword: "owner" });
    const locked = steps([]);
    expect(await printWithFallback(bytes, null, "nope", locked.plan)).toBe("shown");
    expect(locked.sent).toEqual([[2]]);
  });

  it("stops when rendering is cancelled, and leaves a busy print panel alone", async () => {
    const cancelled = steps(["unreadable"], null);
    expect(await printWithFallback(new Uint8Array([1]), null, null, cancelled.plan)).toBe("cancelled");
    expect(cancelled.sent).toEqual([[1]]);
    const busy = steps(["busy"]);
    expect(await printWithFallback(new Uint8Array([1]), null, null, busy.plan)).toBe("busy");
    expect(busy.rendered()).toBe(0);
  });

  it("reports unreadable when even the images can't be printed", async () => {
    const run = steps(["unreadable", "unreadable"]);
    expect(await printWithFallback(new Uint8Array([1]), null, null, run.plan)).toBe("unreadable");
  });
});

describe("rasterDpi", () => {
  it("drops the resolution as the page count grows", () => {
    expect([1, 50, 51, 200, 201, 500, 501, 5000].map(rasterDpi)).toEqual([300, 300, 200, 200, 150, 150, 100, 100]);
  });
});

describe("printJobName", () => {
  it("names Markdown print jobs without the extension, so Save as PDF doesn't double it", () => {
    expect(printJobName("Notes.md")).toBe("Notes");
    expect(printJobName("README.MARKDOWN")).toBe("README");
    expect(printJobName(".md")).toBe(".md");
    expect(printJobName("Lease.pdf")).toBe("Lease.pdf");
  });
});

describe("saveKeepingModified", () => {
  it("returns what Save would write without marking the document saved", async () => {
    const doc = await open(await (await makeForm()).save());
    const events: string[] = [];
    doc.annotationStorage.onSetModified = () => events.push("modified");
    doc.annotationStorage.onResetModified = () => events.push("reset");
    const [widget] = await widgets(doc);
    doc.annotationStorage.setValue(widget.id, { value: "unsaved" });
    const bytes = await saveKeepingModified(doc);
    expect(await typedValues(await open(bytes))).toMatchObject({ field0: "unsaved" });
    expect(events).toEqual(["modified"]);
    expect(Object.hasOwn(doc.annotationStorage, "resetModified")).toBe(false);
    await doc.saveDocument();
    expect(events).toEqual(["modified", "reset"]);
  });
});

describe("oneAtATime", () => {
  it("runs each call after the previous one finishes, even when one fails", async () => {
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const run = oneAtATime(async (name: string) => {
      events.push(`start ${name}`);
      if (name === "print") {
        await gate;
      }
      events.push(`end ${name}`);
      if (name === "bad") {
        throw new Error("bad");
      }
      return name;
    });
    const print = run("print");
    const bad = run("bad");
    const save = run("save");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(["start print"]);
    release();
    expect(await print).toBe("print");
    await expect(bad).rejects.toThrow("bad");
    expect(await save).toBe("save");
    expect(events).toEqual(["start print", "end print", "start bad", "end bad", "start save", "end save"]);
  });
});
