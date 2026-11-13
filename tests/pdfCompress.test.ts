import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef } from "@cantoo/pdf-lib";
import { compressPdf } from "../src/lib/pageEdits";
import { compressImages, drawnSizes, type ImageCodec, type ImageSource } from "../src/lib/pdfCompress";
import { pageLeafRefs } from "../src/lib/pdfStructure";
import { runInWorker, WorkerStoppedError } from "../src/lib/pageEditWorker";
import { openPdf } from "./pdfjsNode";

const key = PDFName.of;
const settings = { dpi: 150, quality: 0.7 };

const segment = (marker: number, body: number[]) => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];

function fakeJpeg(components: number, length: number, extra: number[] = []) {
  const head = [0xff, 0xd8, ...extra, ...segment(0xc0, [8, 0, 16, 0, 16, components, ...Array(components * 3).fill(0)]), 0xff, 0xda];
  const out = new Uint8Array(Math.max(length, head.length + 2));
  out.set(head);
  out.set([0xff, 0xd9], out.length - 2);
  return out;
}

function noise(length: number) {
  const out = new Uint8Array(length);
  let state = 12345;
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff;
    out[index] = state >> 16;
  }
  return out;
}

type ImageOptions = { width?: number; height?: number; space?: unknown; entries?: Record<string, unknown>; jpeg?: Uint8Array; pixels?: Uint8Array };

function addImage(doc: PDFDocument, { width = 200, height = 200, space = "DeviceRGB", entries = {}, jpeg, pixels }: ImageOptions = {}) {
  const dict = doc.context.obj({ Type: "XObject", Subtype: "Image", Width: width, Height: height, BitsPerComponent: 8, ColorSpace: space, Filter: jpeg ? "DCTDecode" : "FlateDecode", ...entries });
  const contents = jpeg ?? new Uint8Array(deflateSync(pixels ?? noise(width * height * (space === "DeviceGray" ? 1 : 3))));
  return doc.context.register(PDFRawStream.of(dict, contents));
}

function addPage(doc: PDFDocument, content: string, xobjects: Record<string, PDFRef>) {
  const page = doc.addPage([612, 792]);
  page.node.set(key("Resources"), doc.context.obj({ XObject: xobjects }));
  page.node.set(key("Contents"), doc.context.register(PDFRawStream.of(doc.context.obj({}), new TextEncoder().encode(content))));
}

function recorder(length = 2000) {
  const calls: Array<{ source: ImageSource; width: number; height: number; quality: number }> = [];
  const codec: ImageCodec = async (source, size, quality) => {
    calls.push({ source, ...size, quality });
    return fakeJpeg(3, length);
  };
  return { calls, codec };
}

const imageAt = (doc: PDFDocument, ref: PDFRef) => doc.context.lookup(ref, PDFRawStream);
const nameIn = (doc: PDFDocument, ref: PDFRef, entry: string) => imageAt(doc, ref).dict.lookup(key(entry));
const numberIn = (doc: PDFDocument, ref: PDFRef, entry: string) => (imageAt(doc, ref).dict.lookup(key(entry)) as PDFNumber).asNumber();

describe("compressImages", () => {
  it("downsamples a lossless image to the size it's drawn at and stores it as JPEG", async () => {
    const doc = await PDFDocument.create();
    const image = addImage(doc, { width: 600, height: 400, entries: { DecodeParms: { Predictor: 1 }, Interpolate: true } });
    addPage(doc, "q 144 0 0 96 100 100 cm /Im0 Do Q", { Im0: image });
    const { calls, codec } = recorder();
    expect(await compressImages(doc, settings, codec)).toEqual({ images: 1, replaced: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ width: 300, height: 200, quality: 0.7 });
    expect(calls[0].source).toMatchObject({ kind: "pixels", width: 600, height: 400 });
    expect(nameIn(doc, image, "Filter")).toBe(key("DCTDecode"));
    expect(numberIn(doc, image, "Width")).toBe(300);
    expect(numberIn(doc, image, "Height")).toBe(200);
    expect(imageAt(doc, image).dict.has(key("DecodeParms"))).toBe(false);
    expect(imageAt(doc, image).dict.has(key("Interpolate"))).toBe(true);
    expect(imageAt(doc, image).contents).toHaveLength(2000);
  });

  it("uses the largest placement, through nested forms", async () => {
    const doc = await PDFDocument.create();
    const image = addImage(doc, { width: 1000, height: 1000 });
    const form = doc.context.register(
      PDFRawStream.of(doc.context.obj({ Type: "XObject", Subtype: "Form", BBox: [0, 0, 1, 1], Matrix: [2, 0, 0, 2, 0, 0], Resources: { XObject: { Inner: image } } }), new TextEncoder().encode("72 0 0 72 0 0 cm /Inner Do")),
    );
    addPage(doc, "q 36 0 0 36 0 0 cm /Im0 Do Q /Fm0 Do", { Im0: image, Fm0: form });
    expect(drawnSizes(doc, pageLeafRefs(doc)).get(image)).toEqual({ width: 144, height: 144 });
    const { calls, codec } = recorder();
    await compressImages(doc, settings, codec);
    expect(calls[0]).toMatchObject({ width: 300, height: 300 });
  });

  it("re-encodes at full size when it can't tell where an image is drawn", async () => {
    const doc = await PDFDocument.create();
    const image = addImage(doc);
    const looping = doc.context.register(PDFRawStream.of(doc.context.obj({ Subtype: "Form" }), new TextEncoder().encode("/Self Do")));
    doc.context.lookup(looping, PDFRawStream).dict.set(key("Resources"), doc.context.obj({ XObject: { Self: looping } }));
    addPage(doc, "/Fm0 Do", { Fm0: looping, Unused: image });
    const { calls, codec } = recorder();
    await compressImages(doc, settings, codec);
    expect(calls[0]).toMatchObject({ width: 200, height: 200 });
  });

  it("strips metadata from JPEGs before decoding and turns gray images into RGB", async () => {
    const doc = await PDFDocument.create();
    const exif = segment(0xe1, [1, 2, 3, 4]);
    const image = addImage(doc, { space: "DeviceGray", jpeg: fakeJpeg(1, 40_000, exif) });
    addPage(doc, "612 0 0 792 0 0 cm /Im0 Do", { Im0: image });
    const { calls, codec } = recorder();
    await compressImages(doc, settings, codec);
    const source = calls[0].source as { kind: "jpeg"; bytes: Uint8Array };
    expect(source.kind).toBe("jpeg");
    expect(source.bytes).toHaveLength(40_000 - exif.length);
    expect(nameIn(doc, image, "ColorSpace")).toBe(key("DeviceRGB"));
  });

  it("keeps the original when the new image isn't clearly smaller or the codec fails", async () => {
    const doc = await PDFDocument.create();
    const first = addImage(doc, { jpeg: fakeJpeg(3, 20_000) });
    const second = addImage(doc, { jpeg: fakeJpeg(3, 30_000) });
    const third = addImage(doc, { jpeg: fakeJpeg(3, 30_001) });
    addPage(doc, "/A Do /B Do /C Do", { A: first, B: second, C: third });
    let call = 0;
    const codec: ImageCodec = async () => {
      call += 1;
      if (call === 2) {
        throw new Error("decode failed");
      }
      return call === 1 ? fakeJpeg(3, 19_000) : new Uint8Array([1, 2, 3]);
    };
    expect(await compressImages(doc, settings, codec)).toEqual({ images: 3, replaced: 0 });
    expect(imageAt(doc, first).contents).toHaveLength(20_000);
    expect(imageAt(doc, third).contents).toHaveLength(30_001);
  });

  it("leaves alone what it can't re-encode safely", async () => {
    const doc = await PDFDocument.create();
    const mask = addImage(doc, { space: "DeviceGray" });
    const matte = addImage(doc, { space: "DeviceGray", entries: { Matte: [0, 0, 0] } });
    const icc = doc.context.register(PDFRawStream.of(doc.context.obj({ N: 4 }), new Uint8Array(4)));
    const images = {
      masked: addImage(doc, { entries: { SMask: mask } }),
      small: addImage(doc, { jpeg: fakeJpeg(3, 4000) }),
      cmyk: addImage(doc, { space: "DeviceCMYK", jpeg: fakeJpeg(4, 40_000) }),
      cmykProfile: addImage(doc, { space: ["ICCBased", icc], jpeg: fakeJpeg(4, 40_000) }),
      mismatched: addImage(doc, { jpeg: fakeJpeg(4, 40_000) }),
      indexed: addImage(doc, { space: ["Indexed", "DeviceRGB", 1, "<000000FFFFFF>"] }),
      oneBit: addImage(doc, { entries: { BitsPerComponent: 1 } }),
      stencil: addImage(doc, { entries: { ImageMask: true } }),
      inverted: addImage(doc, { entries: { Decode: [1, 0, 1, 0, 1, 0] } }),
      colorKey: addImage(doc, { entries: { Mask: [0, 0, 0, 0, 0, 0] } }),
      premultiplied: addImage(doc, { entries: { SMask: matte } }),
      jpx: addImage(doc, { entries: { Filter: "JPXDecode" } }),
      fax: addImage(doc, { entries: { Filter: ["FlateDecode", "CCITTFaxDecode"] } }),
      predicted: addImage(doc, { entries: { DecodeParms: { Predictor: 15, Colors: 1, Columns: 200 } } }),
    };
    addPage(doc, Object.keys(images).map((name) => `/${name} Do`).join(" "), images);
    const { calls, codec } = recorder();
    expect(await compressImages(doc, settings, codec)).toEqual({ images: 3, replaced: 1 });
    expect(calls).toHaveLength(1);
    expect(nameIn(doc, images.masked, "Filter")).toBe(key("DCTDecode"));
    expect(imageAt(doc, images.masked).dict.get(key("SMask"))).toBe(mask);
    expect(nameIn(doc, mask, "Filter")).toBe(key("FlateDecode"));
    expect(nameIn(doc, images.predicted, "Filter")).toBe(key("FlateDecode"));
  });

  it("reports progress for each image", async () => {
    const doc = await PDFDocument.create();
    addPage(doc, "/A Do /B Do", { A: addImage(doc), B: addImage(doc) });
    const seen: number[] = [];
    await compressImages(doc, settings, recorder().codec, ({ done, total }) => seen.push(done, total));
    expect(seen).toEqual([0, 2, 1, 2]);
  });
});

async function photoPdf() {
  const doc = await PDFDocument.create();
  for (let index = 0; index < 3; index += 1) {
    addPage(doc, "612 0 0 792 0 0 cm /Im0 Do", { Im0: addImage(doc, { width: 2550, height: 33, pixels: noise(2550 * 33 * 3) }) });
  }
  return doc;
}

describe("compressPdf", () => {
  it("writes a smaller file that pdf.js opens", async () => {
    const bytes = await (await photoPdf()).save();
    const compressed = await compressPdf(bytes, settings, undefined, undefined, recorder().codec);
    expect(compressed.length).toBeLessThan(bytes.length / 10);
    const opened = await openPdf(compressed);
    expect(opened.numPages).toBe(3);
    await opened.loadingTask.destroy();
  });

  it("compresses a password-protected file to plain bytes", async () => {
    const doc = await photoPdf();
    doc.encrypt({ userPassword: "secret", ownerPassword: "secret" });
    const bytes = await doc.save({ useObjectStreams: true });
    const compressed = await PDFDocument.load(await compressPdf(bytes, settings, "secret", undefined, recorder().codec));
    expect(compressed.isEncrypted).toBe(false);
    const filters = compressed.context.enumerateIndirectObjects().flatMap(([, object]) => (object instanceof PDFRawStream && object.dict.get(key("Subtype")) === key("Image") ? [object.dict.get(key("Filter"))] : []));
    expect(filters).toEqual([key("DCTDecode"), key("DCTDecode"), key("DCTDecode")]);
  });
});

class StubWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  postMessage() {}
  terminate() {
    this.terminated = true;
  }
}

describe("runInWorker progress and stopping", () => {
  const job = { op: "compress" as const, bytes: new Uint8Array(4), settings };

  it("passes progress on without ending the job", async () => {
    const worker = new StubWorker();
    const seen: number[] = [];
    const running = runInWorker(() => worker as unknown as Worker, job, { onProgress: ({ done }) => seen.push(done) });
    worker.onmessage?.({ data: { progress: { done: 0, total: 2 } } });
    worker.onmessage?.({ data: { progress: { done: 1, total: 2 } } });
    expect(worker.terminated).toBe(false);
    worker.onmessage?.({ data: { result: { bytes: new Uint8Array([1]) } } });
    expect((await running).bytes).toEqual(new Uint8Array([1]));
    expect(seen).toEqual([0, 1]);
    expect(worker.terminated).toBe(true);
  });

  it("terminates the worker when stopped", async () => {
    const worker = new StubWorker();
    const controller = new AbortController();
    const running = runInWorker(() => worker as unknown as Worker, job, { signal: controller.signal });
    controller.abort();
    await expect(running).rejects.toBeInstanceOf(WorkerStoppedError);
    expect(worker.terminated).toBe(true);
  });
});
