import { PDFArray, PDFDict, PDFName, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream, type PDFDocument } from "@cantoo/pdf-lib";
import type { ValidationMaterial } from "./signatureTypes";

const key = PDFName.of;
const latin1 = new TextDecoder("latin1");

const KINDS = [
  { array: "Certs", vri: "Cert", material: "certs" },
  { array: "OCSPs", vri: "OCSP", material: "ocsps" },
  { array: "CRLs", vri: "CRL", material: "crls" },
] as const;

function streamBytes(stream: PDFStream) {
  try {
    return stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents();
  } catch {
    return null;
  }
}

function dictIn(doc: PDFDocument, parent: PDFDict, name: string, type?: string) {
  const existing = parent.lookupMaybe(key(name), PDFDict);
  if (existing) {
    return existing;
  }
  const created = doc.context.obj(type ? { Type: type } : {});
  parent.set(key(name), created);
  return created;
}

function arrayIn(doc: PDFDocument, parent: PDFDict, name: string) {
  const existing = parent.lookupMaybe(key(name), PDFArray);
  if (existing) {
    return existing;
  }
  const created = doc.context.obj([]);
  parent.set(key(name), created);
  return created;
}

function dssOf(doc: PDFDocument) {
  const existing = doc.catalog.lookupMaybe(key("DSS"), PDFDict);
  if (existing) {
    return existing;
  }
  const created = doc.context.obj({ Type: "DSS" });
  doc.catalog.set(key("DSS"), doc.context.register(created));
  return created;
}

function addBlobs(doc: PDFDocument, array: PDFArray, blobs: Uint8Array[]) {
  const known = new Map<string, PDFRef>();
  array.asArray().forEach((entry) => {
    const stream = entry instanceof PDFRef ? doc.context.lookupMaybe(entry, PDFStream) : undefined;
    const bytes = stream && streamBytes(stream);
    if (bytes && entry instanceof PDFRef) {
      known.set(latin1.decode(bytes), entry);
    }
  });
  return blobs.map((blob) => {
    const id = latin1.decode(blob);
    const existing = known.get(id);
    if (existing) {
      return existing;
    }
    const ref = doc.context.register(doc.context.flateStream(blob));
    array.push(ref);
    known.set(id, ref);
    return ref;
  });
}

function mergeRefs(doc: PDFDocument, entry: PDFDict, name: string, refs: PDFRef[]) {
  if (!refs.length) {
    return;
  }
  const array = arrayIn(doc, entry, name);
  const present = new Set(array.asArray().filter((value): value is PDFRef => value instanceof PDFRef));
  refs.forEach((ref) => {
    if (!present.has(ref)) {
      array.push(ref);
      present.add(ref);
    }
  });
}

export function appendDssTo(doc: PDFDocument, material: ValidationMaterial) {
  const dss = dssOf(doc);
  const refs = Object.fromEntries(
    KINDS.map((kind) => [kind.material, material[kind.material].length ? addBlobs(doc, arrayIn(doc, dss, kind.array), material[kind.material]) : []]),
  ) as Record<(typeof KINDS)[number]["material"], PDFRef[]>;
  const entries = Object.entries(material.vri);
  if (!entries.length) {
    return;
  }
  const vri = dictIn(doc, dss, "VRI");
  for (const [name, indexes] of entries) {
    const entry = dictIn(doc, vri, name.toUpperCase());
    for (const kind of KINDS) {
      const picked = indexes[kind.material].flatMap((index) => (refs[kind.material][index] ? [refs[kind.material][index]] : []));
      mergeRefs(doc, entry, kind.vri, picked);
    }
  }
}
