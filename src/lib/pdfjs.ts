import "./polyfills";
import { AnnotationLayer, GlobalWorkerOptions, PasswordResponses, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import { withoutTextBoxComment } from "./comments";
import { isClaimedShape, isStamp } from "./markup";
import { isStickyNote } from "./notes";
import workerUrl from "./pdfWorker?worker&url";

GlobalWorkerOptions.workerSrc = workerUrl;

const transportOf = (owner: unknown) => (owner as { _transport?: object } | null)?._transport ?? null;

const stampClaims = new WeakMap<object, () => Promise<Set<string>>>();

export function claimStamps(doc: PDFDocumentProxy, claims: () => Promise<Set<string>>) {
  const transport = transportOf(doc);
  if (transport) {
    stampClaims.set(transport, claims);
  }
}

const renderAnnotationLayer = AnnotationLayer.prototype.render;
AnnotationLayer.prototype.render = async function (params) {
  const shown = params.annotations.filter((annotation) => !isStickyNote(annotation) && !isClaimedShape(annotation));
  const transport = transportOf((this as unknown as { page?: unknown }).page);
  const claims = transport && shown.some(isStamp) ? await stampClaims.get(transport)?.().catch(() => null) : null;
  const annotations = shown.map((annotation) => (claims?.has(annotation.id) ? { ...annotation, isEditable: false } : annotation)).map(withoutTextBoxComment);
  return renderAnnotationLayer.call(this, { ...params, annotations });
};

export const assetsUrl = new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href;

export class PasswordCancelledError extends Error {}

const passwords = new WeakMap<PDFDocumentProxy, string>();

export const passwordOf = (doc: PDFDocumentProxy) => passwords.get(doc);

export function loadPdf(data: Uint8Array, requestPassword: (incorrect: boolean) => Promise<string | null>) {
  const task = getDocument({
    data,
    cMapUrl: `${assetsUrl}cmaps/`,
    standardFontDataUrl: `${assetsUrl}standard_fonts/`,
    wasmUrl: `${assetsUrl}wasm/`,
    iccUrl: `${assetsUrl}iccs/`,
    enableXfa: false,
  });

  let cancelled = false;
  let password: string | null = null;
  task.onPassword = async (update: (password: string) => void, reason: number) => {
    password = await requestPassword(reason === PasswordResponses.INCORRECT_PASSWORD);
    if (password === null) {
      cancelled = true;
      await task.destroy();
      return;
    }
    update(password);
  };

  return task.promise
    .then((doc) => {
      if (password !== null) {
        passwords.set(doc, password);
      }
      return doc;
    })
    .catch((error: unknown) => {
      throw cancelled ? new PasswordCancelledError() : error;
    });
}
