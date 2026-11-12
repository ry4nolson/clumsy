import { PDFArray, PDFDict, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString, type PDFContext, type PDFDocument, type PDFObject } from "@cantoo/pdf-lib";
import type { DocMdpPermission } from "./signatureTypes";

const key = PDFName.of;
const MAX_FIELD_DEPTH = 32;

export type SignField = { ref: PDFRef | undefined; dict: PDFDict; name: string; type: string | null; value: PDFObject | undefined };

const textOf = (dict: PDFDict, name: string) => dict.lookupMaybe(key(name), PDFString, PDFHexString)?.decodeText();

const nameOf = (value: PDFObject | undefined) => (value instanceof PDFName ? value.decodeText() : null);

export function acroFormOf(doc: PDFDocument) {
  return doc.catalog.lookupMaybe(key("AcroForm"), PDFDict);
}

export function ensureAcroForm(doc: PDFDocument) {
  const existing = acroFormOf(doc);
  if (existing) {
    return existing;
  }
  const created = doc.context.obj({ Fields: [] });
  doc.catalog.set(key("AcroForm"), doc.context.register(created));
  return created;
}

export function fieldsArray(context: PDFContext, form: PDFDict) {
  const existing = form.lookupMaybe(key("Fields"), PDFArray);
  if (existing) {
    return existing;
  }
  const created = context.obj([]);
  form.set(key("Fields"), created);
  return created;
}

export function collectFields(doc: PDFDocument): SignField[] {
  const form = acroFormOf(doc);
  const roots = form?.lookupMaybe(key("Fields"), PDFArray);
  if (!roots) {
    return [];
  }
  const fields: SignField[] = [];
  const seen = new Set<PDFDict>();
  const visit = (entry: PDFObject, parentName: string, parentType: string | null, depth: number) => {
    const dict = entry instanceof PDFRef ? doc.context.lookupMaybe(entry, PDFDict) : entry instanceof PDFDict ? entry : undefined;
    if (!dict || seen.has(dict) || depth > MAX_FIELD_DEPTH) {
      return;
    }
    seen.add(dict);
    const partial = textOf(dict, "T");
    const name = partial === undefined ? parentName : parentName ? `${parentName}.${partial}` : partial;
    const type = nameOf(dict.lookup(key("FT"))) ?? parentType;
    const kids = dict.lookupMaybe(key("Kids"), PDFArray);
    const fieldKids = (kids?.asArray() ?? []).filter((kid) => {
      const kidDict = kid instanceof PDFRef ? doc.context.lookupMaybe(kid, PDFDict) : undefined;
      return kidDict?.has(key("T"));
    });
    if (fieldKids.length) {
      fieldKids.forEach((kid) => visit(kid, name, type, depth + 1));
      return;
    }
    fields.push({ ref: entry instanceof PDFRef ? entry : undefined, dict, name, type, value: dict.lookup(key("V")) });
  };
  roots.asArray().forEach((root) => visit(root, "", null, 0));
  return fields;
}

export const isSigned = (field: SignField) => field.type === "Sig" && field.value instanceof PDFDict;

export function widgetsOf(doc: PDFDocument, field: SignField) {
  if (nameOf(field.dict.lookup(key("Subtype"))) === "Widget" || !field.dict.has(key("Kids"))) {
    return [{ ref: field.ref, dict: field.dict }];
  }
  const kids = field.dict.lookupMaybe(key("Kids"), PDFArray)?.asArray() ?? [];
  return kids.flatMap((kid) => {
    const dict = kid instanceof PDFRef ? doc.context.lookupMaybe(kid, PDFDict) : undefined;
    return dict && !dict.has(key("T")) ? [{ ref: kid as PDFRef, dict }] : [];
  });
}

export function uniqueFieldName(fields: SignField[]) {
  const names = new Set(fields.map((field) => field.name.split(".")[0]));
  let index = 1;
  while (names.has(`Signature${index}`)) {
    index += 1;
  }
  return `Signature${index}`;
}

export function docMdpPermission(doc: PDFDocument): DocMdpPermission | null {
  const signature = doc.catalog.lookupMaybe(key("Perms"), PDFDict)?.lookupMaybe(key("DocMDP"), PDFDict);
  if (!signature) {
    return null;
  }
  const references = signature.lookupMaybe(key("Reference"), PDFArray);
  for (const entry of references?.asArray() ?? []) {
    const reference = entry instanceof PDFRef ? doc.context.lookupMaybe(entry, PDFDict) : entry instanceof PDFDict ? entry : undefined;
    if (reference && nameOf(reference.lookup(key("TransformMethod"))) === "DocMDP") {
      const permission = reference.lookupMaybe(key("TransformParams"), PDFDict)?.lookupMaybe(key("P"), PDFNumber)?.asNumber();
      return permission === 1 || permission === 3 ? permission : 2;
    }
  }
  return 2;
}

export function pageRotation(page: PDFDict) {
  const seen = new Set<PDFDict>();
  let node: PDFDict | undefined = page;
  while (node && !seen.has(node)) {
    seen.add(node);
    const rotate = node.lookupMaybe(key("Rotate"), PDFNumber);
    if (rotate) {
      return rotate.asNumber();
    }
    node = node.lookupMaybe(key("Parent"), PDFDict);
  }
  return 0;
}

export function lockOf(field: SignField) {
  const lock = field.dict.lookupMaybe(key("Lock"), PDFDict);
  if (!lock) {
    return null;
  }
  const action = nameOf(lock.lookup(key("Action"))) ?? "All";
  const fields = lock.lookupMaybe(key("Fields"), PDFArray);
  const names = (fields?.asArray() ?? []).flatMap((_, index) => {
    const value = fields?.lookupMaybe(index, PDFString, PDFHexString)?.decodeText();
    return value === undefined ? [] : [value];
  });
  return { action, fields: names };
}
