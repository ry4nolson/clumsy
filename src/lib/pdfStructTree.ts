import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFObject, PDFRef } from "@cantoo/pdf-lib";

const key = PDFName.of;

export function pruneStructTree(doc: PDFDocument, doomed: Set<PDFRef>) {
  const removed = new Set<PDFRef>();
  const root = doc.catalog.lookup(key("StructTreeRoot"));
  if (!(root instanceof PDFDict)) {
    return removed;
  }
  const visiting = new Set<PDFDict>();
  const isDoomed = (object: PDFObject | undefined) => object instanceof PDFRef && doomed.has(object);
  const pageOf = (dict: PDFDict, inherited: PDFRef | undefined) => {
    const page = dict.get(key("Pg"));
    return page instanceof PDFRef ? page : inherited;
  };

  const pruneKids = (holder: PDFDict, page: PDFRef | undefined) => {
    const kids = holder.get(key("K"));
    const list = kids instanceof PDFArray ? kids : doc.context.lookup(kids);
    const items = list instanceof PDFArray ? list.asArray() : kids ? [kids] : [];
    const kept = items.filter((item) => !removeItem(item, page));
    if (kept.length === items.length) {
      return { had: items.length > 0, left: kept.length > 0 };
    }
    if (kept.length) {
      holder.set(key("K"), doc.context.obj(kept));
    } else {
      holder.delete(key("K"));
    }
    return { had: true, left: kept.length > 0 };
  };

  const removeItem = (item: PDFObject, page: PDFRef | undefined): boolean => {
    if (item instanceof PDFNumber) {
      return isDoomed(page);
    }
    const node = item instanceof PDFRef ? doc.context.lookup(item) : item;
    if (!(node instanceof PDFDict)) {
      return false;
    }
    const type = node.lookup(key("Type"));
    if (type === key("MCR")) {
      return isDoomed(pageOf(node, page));
    }
    if (type === key("OBJR")) {
      return isDoomed(node.get(key("Obj"))) || isDoomed(pageOf(node, page));
    }
    if (visiting.has(node)) {
      return false;
    }
    visiting.add(node);
    const { had, left } = pruneKids(node, pageOf(node, page));
    const remove = had ? !left : isDoomed(node.get(key("Pg")));
    if (remove && item instanceof PDFRef) {
      removed.add(item);
    }
    return remove;
  };

  pruneKids(root, undefined);
  return removed;
}

export function pruneIdTree(doc: PDFDocument, removed: Set<PDFRef>) {
  const root = doc.catalog.lookup(key("StructTreeRoot"));
  const seen = new Set<PDFDict>();
  const prune = (node: PDFObject | undefined) => {
    if (!(node instanceof PDFDict) || seen.has(node)) {
      return;
    }
    seen.add(node);
    const names = node.lookup(key("Names"));
    if (names instanceof PDFArray) {
      for (let index = names.size() - 2; index >= 0; index -= 2) {
        const value = names.get(index + 1);
        if (value instanceof PDFRef && removed.has(value)) {
          names.remove(index + 1);
          names.remove(index);
        }
      }
    }
    const kids = node.lookup(key("Kids"));
    if (kids instanceof PDFArray) {
      kids.asArray().forEach((kid) => prune(doc.context.lookup(kid)));
    }
  };
  if (root instanceof PDFDict) {
    prune(root.lookup(key("IDTree")));
  }
}

export function dropStructParents(doc: PDFDocument, pageRefs: PDFRef[]) {
  for (const ref of pageRefs) {
    const page = doc.context.lookup(ref, PDFDict);
    page.delete(key("StructParents"));
    const annots = page.lookup(key("Annots"));
    if (annots instanceof PDFArray) {
      for (const entry of annots.asArray()) {
        const annotation = doc.context.lookup(entry);
        if (annotation instanceof PDFDict) {
          annotation.delete(key("StructParent"));
        }
      }
    }
  }
}
