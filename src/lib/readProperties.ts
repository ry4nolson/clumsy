import { PDFDateString, type PDFDocumentProxy } from "pdfjs-dist";
import { cleanText, pageBoxSize, type FormKind, type PropertiesInput } from "./documentProperties";

export type PropertiesContext = {
  name: string;
  path: string | null;
  pageNumber: number;
  passwordToOpen: boolean;
  hasForm: boolean;
  attachments: number;
  layers: number;
};

type Info = Record<string, unknown>;

const dateOf = (value: unknown) => (typeof value === "string" ? PDFDateString.toDateObject(value) : null);

function formKind(info: Info, hasForm: boolean): FormKind {
  if (info.IsXFAPresent && !hasForm) {
    return "xfa";
  }
  return hasForm ? "fillable" : "none";
}

export async function readProperties(doc: PDFDocumentProxy, context: PropertiesContext): Promise<PropertiesInput> {
  const [{ info: rawInfo, metadata }, download, markInfo, page] = await Promise.all([
    doc.getMetadata(),
    doc.getDownloadInfo().catch(() => null),
    doc.getMarkInfo().catch(() => null),
    doc.getPage(context.pageNumber).catch(() => null),
  ]);
  const info = rawInfo as Info;
  const xmpTitle = cleanText(metadata?.get("dc:title"));
  return {
    name: context.name,
    path: context.path,
    size: download?.length ?? null,
    title: xmpTitle ?? cleanText(info.Title),
    author: cleanText(info.Author),
    subject: cleanText(info.Subject),
    keywords: cleanText(info.Keywords),
    created: dateOf(info.CreationDate),
    modified: dateOf(info.ModDate),
    creator: cleanText(info.Creator),
    producer: cleanText(info.Producer),
    version: cleanText(info.PDFFormatVersion),
    pageCount: doc.numPages,
    pageNumber: context.pageNumber,
    pageSize: page ? pageBoxSize(page.view, page.rotate, page.userUnit) : null,
    language: cleanText(info.Language),
    tagged: !!markInfo?.Marked,
    linearized: !!info.IsLinearized,
    passwordToOpen: context.passwordToOpen,
    restricted: !context.passwordToOpen && !!info.EncryptFilterName,
    form: formKind(info, context.hasForm),
    signed: !!info.IsSignaturesPresent,
    attachments: context.attachments,
    layers: context.layers,
  };
}
