import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import { answerPageEditJob } from "../src/lib/pageEdits";
import { PageEditError } from "../src/lib/pageEditPlan";
import { runInWorker } from "../src/lib/pageEditWorker";

class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;

  constructor(private crash = false) {}

  postMessage(job: Parameters<typeof answerPageEditJob>[0], transfer: Transferable[]) {
    const received = structuredClone(job, { transfer });
    if (this.crash) {
      queueMicrotask(() => this.onerror?.({ message: "" }));
      return;
    }
    answerPageEditJob(received).then(([response, back]) => this.onmessage?.({ data: structuredClone(response, { transfer: back }) }));
  }

  terminate() {
    this.terminated = true;
  }
}

function spawner(crash = false) {
  const workers: FakeWorker[] = [];
  const spawn = () => {
    const worker = new FakeWorker(crash);
    workers.push(worker);
    return worker as unknown as Worker;
  };
  return { spawn, workers };
}

async function makePdf(pages: number) {
  const doc = await PDFDocument.create();
  for (let index = 0; index < pages; index += 1) {
    doc.addPage([600 + index, 800]);
  }
  return doc.save();
}

const rotations = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((page) => page.getRotation().angle);

describe("runInWorker", () => {
  it("moves the bytes instead of copying them and hands the original back", async () => {
    const bytes = await makePdf(3);
    const copy = bytes.slice();
    const { spawn, workers } = spawner();
    const result = await runInWorker(spawn, { op: "edit", bytes, edit: { kind: "rotate", pages: [1], by: 90 } });
    expect(bytes.byteLength).toBe(0);
    expect(result.original).toEqual(copy);
    expect(await rotations(result.bytes)).toEqual([0, 90, 0]);
    expect(result.inserted).toBe(0);
    expect(workers.map((worker) => worker.terminated)).toEqual([true]);
  });

  it("counts inserted pages", async () => {
    const data = await makePdf(2);
    const { spawn } = spawner();
    const result = await runInWorker(spawn, { op: "edit", bytes: await makePdf(3), edit: { kind: "insert", data, at: 1 } });
    expect(data.byteLength).toBe(0);
    expect(result.inserted).toBe(2);
    expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(5);
  });

  it("extracts and combines", async () => {
    const { spawn } = spawner();
    const extracted = await runInWorker(spawn, { op: "extract", bytes: await makePdf(4), pages: [1, 2] });
    expect((await PDFDocument.load(extracted.bytes)).getPageCount()).toBe(2);
    const combined = await runInWorker(spawn, { op: "combine", files: [await makePdf(1), await makePdf(2)] });
    expect((await PDFDocument.load(combined.bytes)).getPageCount()).toBe(3);
  });

  it("sends a shared buffer once", async () => {
    const bytes = await makePdf(1);
    const { spawn } = spawner();
    const combined = await runInWorker(spawn, { op: "combine", files: [bytes, bytes] });
    expect((await PDFDocument.load(combined.bytes)).getPageCount()).toBe(2);
  });

  it("keeps page edit errors as page edit errors", async () => {
    const { spawn, workers } = spawner();
    const edit = runInWorker(spawn, { op: "edit", bytes: await makePdf(2), edit: { kind: "delete", pages: [0, 1] } });
    await expect(edit).rejects.toBeInstanceOf(PageEditError);
    await expect(edit).rejects.toThrow("A PDF needs at least one page.");
    expect(workers[0].terminated).toBe(true);
  });

  it("explains password-protected files across the boundary", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.encrypt({ userPassword: "secret", ownerPassword: "owner" });
    const { spawn } = spawner();
    const edit = runInWorker(spawn, { op: "edit", bytes: await doc.save(), edit: { kind: "delete", pages: [0] } });
    await expect(edit).rejects.toBeInstanceOf(PageEditError);
    await expect(edit).rejects.toThrow(/password didn't work/);
  });

  it("passes other errors on as plain errors", async () => {
    const { spawn } = spawner();
    const edit = runInWorker(spawn, { op: "extract", bytes: new TextEncoder().encode("not a pdf"), pages: [0] });
    await expect(edit).rejects.toBeInstanceOf(Error);
    await expect(edit).rejects.not.toBeInstanceOf(PageEditError);
  });

  it("fails and stops the worker when it crashes", async () => {
    const { spawn, workers } = spawner(true);
    await expect(runInWorker(spawn, { op: "combine", files: [await makePdf(1)] })).rejects.toThrow("The page edit stopped unexpectedly.");
    expect(workers[0].terminated).toBe(true);
  });

  it("fails without sending bytes that were already moved", async () => {
    const bytes = await makePdf(1);
    structuredClone(bytes, { transfer: [bytes.buffer] });
    const { spawn, workers } = spawner();
    await expect(runInWorker(spawn, { op: "extract", bytes, pages: [0] })).rejects.toThrow();
    expect(workers[0].terminated).toBe(true);
  });
});
