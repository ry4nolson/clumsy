import { EncryptedPDFError, PDFDocument, degrees } from "@cantoo/pdf-lib";
import { buffersOf, failureOf, type PageEditJob, type PageEditResponse, type PageEditResult } from "./pageEditMessages";
import { PageEditError, reorderedPages, uniqueSorted, type PageEdit } from "./pageEditPlan";
import { relabelRange } from "./pageLabels";
import { pageRefsOf, readPageLabels, relabelPages, writePageLabels, type LabelSource } from "./pdfPageLabels";
import { installDecryptedStrings } from "./pdfDecrypt";
import { flattenForm } from "./pdfForm";
import { collectGarbage, flattenPageTree, importPageRefs, pageLeafRefs, removePageRefs, setPageRefs } from "./pdfStructure";

installDecryptedStrings();

async function load(bytes: Uint8Array, password?: string) {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false, password });
  } catch (error) {
    if (error instanceof EncryptedPDFError) {
      throw new PageEditError("Pages in password-protected PDFs can't be changed yet.");
    }
    throw error;
  }
}

async function save(doc: PDFDocument) {
  collectGarbage(doc);
  return doc.save({ rewrite: true, addDefaultPage: false, updateFieldAppearances: false });
}

export async function pageCount(bytes: Uint8Array) {
  return pageLeafRefs(await load(bytes)).length;
}

async function importLabeled(target: PDFDocument, bytes: Uint8Array): Promise<LabelSource> {
  const source = await load(bytes);
  const refs = importPageRefs(target, source);
  return { refs, labels: readPageLabels(source, refs.length) };
}

export async function applyPageEdit(bytes: Uint8Array, edit: PageEdit) {
  const doc = await load(bytes);
  const refs = flattenPageTree(doc);
  const pages = doc.getPages();
  const labels = readPageLabels(doc, refs.length);
  const extra: LabelSource[] = [];
  switch (edit.kind) {
    case "move":
      setPageRefs(doc, reorderedPages(refs.length, edit.pages, edit.to).map((index) => refs[index]));
      break;
    case "delete": {
      const doomed = new Set(uniqueSorted(edit.pages).filter((page) => page >= 0 && page < refs.length).map((page) => refs[page]));
      if (doomed.size >= refs.length) {
        throw new PageEditError("A PDF needs at least one page.");
      }
      removePageRefs(doc, refs, doomed);
      break;
    }
    case "rotate":
      for (const page of uniqueSorted(edit.pages)) {
        const target = pages[page];
        if (target) {
          target.setRotation(degrees((((target.getRotation().angle + edit.by) % 360) + 360) % 360));
        }
      }
      break;
    case "insert": {
      const inserted = await importLabeled(doc, edit.data);
      const at = Math.min(Math.max(0, edit.at), refs.length);
      setPageRefs(doc, [...refs.slice(0, at), ...inserted.refs, ...refs.slice(at)]);
      extra.push(inserted);
      break;
    }
    case "label":
      writePageLabels(doc, edit.numbering && relabelRange(labels, refs.length, edit.from, edit.to, edit.numbering));
      return save(doc);
    case "flatten":
      if (!(await flattenForm(doc))) {
        throw new PageEditError("This PDF has no form fields to flatten.");
      }
      return save(doc);
  }
  if (edit.kind !== "rotate") {
    relabelPages(doc, { refs, labels }, pageRefsOf(doc), extra);
  }
  return save(doc);
}

export async function decryptPdf(bytes: Uint8Array, password = "") {
  return save(await load(bytes, password));
}

export async function extractPages(bytes: Uint8Array, pages: number[], password?: string) {
  const doc = await load(bytes, password);
  const refs = flattenPageTree(doc);
  const labels = readPageLabels(doc, refs.length);
  const keep = new Set(uniqueSorted(pages).filter((page) => page >= 0 && page < refs.length));
  if (!keep.size) {
    throw new PageEditError("No pages to extract.");
  }
  removePageRefs(doc, refs, new Set(refs.filter((_, index) => !keep.has(index))));
  relabelPages(doc, { refs, labels }, pageRefsOf(doc));
  return save(doc);
}

export async function combinePdfs(files: Uint8Array[]) {
  const [first, ...rest] = files;
  const doc = await load(first);
  const refs = flattenPageTree(doc);
  const labels = readPageLabels(doc, refs.length);
  const extra: LabelSource[] = [];
  for (const bytes of rest) {
    extra.push(await importLabeled(doc, bytes));
  }
  const combined = [...refs, ...extra.flatMap((source) => source.refs)];
  setPageRefs(doc, combined);
  relabelPages(doc, { refs, labels }, combined, extra);
  return save(doc);
}

export async function runPageEditJob(job: PageEditJob): Promise<PageEditResult> {
  switch (job.op) {
    case "edit": {
      const inserted = job.edit.kind === "insert" ? await pageCount(job.edit.data) : 0;
      return { bytes: await applyPageEdit(job.bytes, job.edit), original: job.bytes, inserted };
    }
    case "extract":
      return { bytes: await extractPages(job.bytes, job.pages, job.password) };
    case "decrypt":
      return { bytes: await decryptPdf(job.bytes, job.password) };
    case "combine":
      return { bytes: await combinePdfs(job.files) };
  }
}

export async function answerPageEditJob(job: PageEditJob): Promise<[PageEditResponse, ArrayBuffer[]]> {
  try {
    const result = await runPageEditJob(job);
    return [{ result }, buffersOf([result.bytes, result.original])];
  } catch (error) {
    return [{ failure: failureOf(error) }, []];
  }
}
