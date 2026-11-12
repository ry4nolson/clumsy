import { PDFArray, PDFDict, PDFName, PDFObject, PDFRawStream, PDFRef, PDFStream, type PDFDocument } from "@cantoo/pdf-lib";
import { acroForm, pageLeafRefs } from "./pdfStructure";

const key = PDFName.of;

const CATALOG_KEYS = new Set(["DSS", "AcroForm", "Extensions"]);
const ACROFORM_KEYS = new Set(["Fields", "SigFlags"]);
const PAGE_KEYS = new Set(["Annots"]);
const SIGNATURE_FIELD_KEYS = new Set(["V", "AP", "AS", "MK", "F", "Lock"]);

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((value, index) => value === b[index]);

const streamBytes = (stream: PDFStream) => (stream instanceof PDFRawStream ? stream.contents : stream.getContents());

function sameObject(before: PDFObject, after: PDFObject) {
  if (before instanceof PDFStream && after instanceof PDFStream) {
    return before.dict.toString() === after.dict.toString() && sameBytes(streamBytes(before), streamBytes(after));
  }
  return before.toString() === after.toString();
}

function changedKeys(before: PDFDict, after: PDFDict) {
  const names = new Set([...before.keys(), ...after.keys()].map((name) => name.decodeText()));
  return [...names].filter((name) => {
    const old = before.get(key(name));
    const next = after.get(key(name));
    return !old || !next ? old !== next : old.toString() !== next.toString();
  });
}

const onlyKeys = (before: PDFDict, after: PDFDict, allowed: Set<string>) => changedKeys(before, after).every((name) => allowed.has(name));

function refsUnder(doc: PDFDocument, root: PDFObject | undefined) {
  const found = new Set<PDFRef>();
  const stack = root ? [root] : [];
  while (stack.length) {
    const object = stack.pop() as PDFObject;
    if (object instanceof PDFRef) {
      if (found.has(object)) {
        continue;
      }
      found.add(object);
      const target = doc.context.lookup(object);
      if (target) {
        stack.push(target);
      }
    } else if (object instanceof PDFDict) {
      stack.push(...object.values());
    } else if (object instanceof PDFArray) {
      stack.push(...object.asArray());
    } else if (object instanceof PDFStream) {
      stack.push(...object.dict.values());
    }
  }
  return found;
}

function growingArrays(doc: PDFDocument) {
  const refs = new Set<PDFRef>();
  const fields = acroForm(doc)?.get(key("Fields"));
  if (fields instanceof PDFRef) {
    refs.add(fields);
  }
  for (const pageRef of pageLeafRefs(doc)) {
    const annots = doc.context.lookupMaybe(pageRef, PDFDict)?.get(key("Annots"));
    if (annots instanceof PDFRef) {
      refs.add(annots);
    }
  }
  return refs;
}

function isSignatureField(doc: PDFDocument, object: PDFObject) {
  let dict = object instanceof PDFRef ? doc.context.lookupMaybe(object, PDFDict) : object instanceof PDFDict ? object : undefined;
  for (let depth = 0; dict && depth < 32; depth += 1) {
    const type = dict.lookupMaybe(key("FT"), PDFName)?.decodeText();
    if (type) {
      return type === "Sig";
    }
    dict = dict.lookupMaybe(key("Parent"), PDFDict);
  }
  return false;
}

function onlySignaturesJoined(after: PDFDocument, before: PDFArray | undefined, next: PDFArray | undefined) {
  const old = new Set((before?.asArray() ?? []).map((item) => item.toString()));
  const items = next?.asArray() ?? [];
  const kept = new Set(items.map((item) => item.toString()));
  return [...old].every((item) => kept.has(item)) && items.every((item) => old.has(item.toString()) || isSignatureField(after, item));
}

const arrayAt = (dict: PDFDict, name: string) => dict.lookupMaybe(key(name), PDFArray);

const isEmptySignatureField = (dict: PDFDict) => dict.lookupMaybe(key("FT"), PDFName)?.decodeText() === "Sig" && !dict.has(key("V"));

const isPage = (dict: PDFDict) => dict.lookupMaybe(key("Type"), PDFName)?.decodeText() === "Page";

const joinedUnder = (after: PDFDocument, old: PDFDict, next: PDFDict, name: string) =>
  old.get(key(name))?.toString() === next.get(key(name))?.toString() || onlySignaturesJoined(after, arrayAt(old, name), arrayAt(next, name));

export function onlySignaturesAdded(before: PDFDocument, after: PDFDocument) {
  const catalog = before.context.trailerInfo.Root;
  if (after.context.trailerInfo.Root !== catalog && !onlyKeys(before.catalog, after.catalog, CATALOG_KEYS)) {
    return false;
  }
  const form = before.catalog.get(key("AcroForm"));
  const dss = refsUnder(before, before.catalog.get(key("DSS")));
  const arrays = growingArrays(after);
  for (const [ref, next] of after.context.enumerateIndirectObjects()) {
    const old = before.context.lookup(ref);
    if (!old || sameObject(old, next) || dss.has(ref)) {
      continue;
    }
    if (old instanceof PDFDict && next instanceof PDFDict && !(old instanceof PDFStream)) {
      if (ref === catalog && onlyKeys(old, next, CATALOG_KEYS)) {
        continue;
      }
      if (ref === form && onlyKeys(old, next, ACROFORM_KEYS) && joinedUnder(after, old, next, "Fields")) {
        continue;
      }
      if (isPage(old) && onlyKeys(old, next, PAGE_KEYS) && joinedUnder(after, old, next, "Annots")) {
        continue;
      }
      if (isEmptySignatureField(old) && onlyKeys(old, next, SIGNATURE_FIELD_KEYS)) {
        continue;
      }
    }
    if (old instanceof PDFArray && next instanceof PDFArray && arrays.has(ref) && onlySignaturesJoined(after, old, next)) {
      continue;
    }
    return false;
  }
  return true;
}
