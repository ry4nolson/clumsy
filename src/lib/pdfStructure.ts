import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFObject,
  PDFObjectCopier,
  PDFPageLeaf,
  PDFRef,
  PDFStream,
  PDFString,
} from "@cantoo/pdf-lib";
import { dropStructParents, pruneIdTree, pruneStructTree } from "./pdfStructTree";

const key = PDFName.of;

function children(object: PDFObject | undefined): PDFObject[] {
  if (object instanceof PDFDict) {
    return object.values();
  }
  if (object instanceof PDFArray) {
    return object.asArray();
  }
  if (object instanceof PDFStream) {
    return object.dict.values();
  }
  return [];
}

function rootRef(doc: PDFDocument) {
  return doc.catalog.get(key("Pages")) as PDFRef;
}

export function flattenPageTree(doc: PDFDocument) {
  const pages = doc.getPages();
  for (const page of pages) {
    for (const name of PDFPageLeaf.InheritableEntries) {
      const inherited = page.node.getInheritableAttribute(key(name));
      if (inherited && !page.node.get(key(name))) {
        page.node.set(key(name), inherited);
      }
    }
  }
  const refs = pages.map((page) => page.ref);
  setPageRefs(doc, refs);
  return refs;
}

export function setPageRefs(doc: PDFDocument, refs: PDFRef[]) {
  const parent = rootRef(doc);
  for (const ref of refs) {
    doc.context.lookup(ref, PDFDict).set(key("Parent"), parent);
  }
  const root = doc.catalog.Pages();
  root.set(key("Kids"), doc.context.obj(refs));
  root.set(key("Count"), PDFNumber.of(refs.length));
}

export function importPageRefs(target: PDFDocument, source: PDFDocument) {
  flattenPageTree(source);
  const copier = PDFObjectCopier.for(source.context, target.context);
  const copiedRoot = target.context.lookup(copier.copy(rootRef(source)), PDFDict);
  const refs = copiedRoot.lookup(key("Kids"), PDFArray).asArray() as PDFRef[];
  dropStructParents(target, refs);
  return refs;
}

function annotationRefs(doc: PDFDocument, pageRef: PDFRef) {
  const annots = doc.context.lookup(pageRef, PDFDict).lookup(key("Annots"));
  return annots instanceof PDFArray ? annots.asArray().filter((entry): entry is PDFRef => entry instanceof PDFRef) : [];
}

function removeEntries(array: PDFArray, shouldRemove: (entry: PDFObject) => boolean) {
  for (let index = array.size() - 1; index >= 0; index--) {
    if (shouldRemove(array.get(index))) {
      array.remove(index);
    }
  }
}

function acroForm(doc: PDFDocument) {
  const form = doc.catalog.lookup(key("AcroForm"));
  return form instanceof PDFDict ? form : null;
}

function pruneFields(doc: PDFDocument, doomed: Set<PDFRef>) {
  const removed = new Set<PDFRef>();
  const prune = (array: PDFArray) =>
    removeEntries(array, (entry) => {
      const field = doc.context.lookup(entry);
      const kids = field instanceof PDFDict ? field.lookup(key("Kids")) : undefined;
      let remove = entry instanceof PDFRef && doomed.has(entry);
      if (!remove && kids instanceof PDFArray && kids.size()) {
        prune(kids);
        remove = kids.size() === 0;
      }
      if (remove && entry instanceof PDFRef) {
        removed.add(entry);
      }
      return remove;
    });
  const fields = acroForm(doc)?.lookup(key("Fields"));
  if (fields instanceof PDFArray) {
    prune(fields);
  }
  const order = acroForm(doc)?.lookup(key("CO"));
  if (order instanceof PDFArray) {
    removeEntries(order, (entry) => entry instanceof PDFRef && (removed.has(entry) || doomed.has(entry)));
  }
  return removed;
}

function dropXfa(doc: PDFDocument) {
  acroForm(doc)?.delete(key("XFA"));
  doc.catalog.delete(key("NeedsRendering"));
}

function detach(doc: PDFDocument, doomed: Set<PDFRef>) {
  const seen = new Set<PDFObject>();
  const stack: PDFObject[] = [doc.context.trailerInfo.Root, doc.context.trailerInfo.Info].filter((object): object is PDFObject => !!object);
  while (stack.length) {
    const object = stack.pop()!;
    if (seen.has(object)) {
      continue;
    }
    seen.add(object);
    if (object instanceof PDFRef) {
      if (!doomed.has(object)) {
        const value = doc.context.lookup(object);
        if (value) {
          stack.push(value);
        }
      }
      continue;
    }
    const dict = object instanceof PDFStream ? object.dict : object instanceof PDFDict ? object : null;
    if (dict) {
      for (const [name, value] of dict.entries()) {
        if (value instanceof PDFRef && doomed.has(value)) {
          dict.delete(name);
        }
      }
    } else if (object instanceof PDFArray) {
      for (let index = 0; index < object.size(); index++) {
        const value = object.get(index);
        if (value instanceof PDFRef && doomed.has(value)) {
          object.set(index, PDFNull);
        }
      }
    }
    stack.push(...children(object));
  }
}

function destinationOf(holder: PDFDict) {
  const action = holder.lookup(key("A"));
  if (action instanceof PDFDict) {
    return action.lookup(key("S")) === key("GoTo") ? action.lookup(key("D")) : undefined;
  }
  return holder.lookup(key("Dest")) ?? holder.lookup(key("D"));
}

type ResolveName = (name: PDFObject) => PDFObject | undefined;

const nameText = (object: PDFObject) =>
  object instanceof PDFName || object instanceof PDFString || object instanceof PDFHexString ? object.decodeText() : null;

function namedDestinations(doc: PDFDocument): ResolveName {
  const named = new Map<string, PDFObject>();
  const legacy = doc.catalog.lookup(key("Dests"));
  if (legacy instanceof PDFDict) {
    for (const [name, value] of legacy.entries()) {
      named.set(name.decodeText(), value);
    }
  }
  const seen = new Set<PDFDict>();
  const walk = (node: PDFObject | undefined) => {
    if (!(node instanceof PDFDict) || seen.has(node)) {
      return;
    }
    seen.add(node);
    const names = node.lookup(key("Names"));
    if (names instanceof PDFArray) {
      for (let index = 0; index + 1 < names.size(); index += 2) {
        const name = nameText(names.lookup(index) ?? PDFNull);
        if (name !== null && !named.has(name)) {
          named.set(name, names.get(index + 1));
        }
      }
    }
    const kids = node.lookup(key("Kids"));
    if (kids instanceof PDFArray) {
      kids.asArray().forEach((kid) => walk(doc.context.lookup(kid)));
    }
  };
  const trees = doc.catalog.lookup(key("Names"));
  if (trees instanceof PDFDict) {
    walk(trees.lookup(key("Dests")));
  }
  return (name) => {
    const text = nameText(name);
    return text === null ? undefined : named.get(text);
  };
}

function isDeadDestination(doc: PDFDocument, destination: PDFObject | undefined, resolveName?: ResolveName, depth = 0): boolean {
  const value = destination instanceof PDFRef ? doc.context.lookup(destination) : destination;
  if (!value || depth > 8) {
    return false;
  }
  if (value instanceof PDFDict) {
    return isDeadDestination(doc, value.get(key("D")), resolveName, depth + 1);
  }
  if (value instanceof PDFArray) {
    return value.size() > 0 && doc.context.lookup(value.get(0)) === PDFNull;
  }
  const target = resolveName?.(value);
  return target !== undefined && isDeadDestination(doc, target, resolveName, depth + 1);
}

function pruneLinks(doc: PDFDocument, pageRefs: PDFRef[], resolveName: ResolveName) {
  for (const pageRef of pageRefs) {
    const annots = doc.context.lookup(pageRef, PDFDict).lookup(key("Annots"));
    if (annots instanceof PDFArray) {
      removeEntries(annots, (entry) => {
        const annotation = doc.context.lookup(entry);
        return (
          annotation === PDFNull ||
          (annotation instanceof PDFDict &&
            annotation.lookup(key("Subtype")) === key("Link") &&
            isDeadDestination(doc, destinationOf(annotation), resolveName))
        );
      });
    }
  }
}

function pruneOutline(doc: PDFDocument, resolveName: ResolveName) {
  const seen = new Set<PDFDict>();
  const prune = (parent: PDFDict): number => {
    const kept: Array<{ ref: PDFObject; item: PDFDict; visible: number }> = [];
    let ref = parent.get(key("First"));
    while (ref) {
      const item = doc.context.lookup(ref);
      if (!(item instanceof PDFDict) || seen.has(item)) {
        break;
      }
      seen.add(item);
      const next = item.get(key("Next"));
      const visible = prune(item);
      const dead = isDeadDestination(doc, destinationOf(item), resolveName);
      if (!dead || item.get(key("First"))) {
        if (dead) {
          item.delete(key("A"));
          item.delete(key("Dest"));
        }
        kept.push({ ref, item, visible });
      }
      ref = next;
    }
    kept.forEach(({ item }, index) => {
      const previous = kept[index - 1];
      const next = kept[index + 1];
      if (previous) {
        item.set(key("Prev"), previous.ref);
      } else {
        item.delete(key("Prev"));
      }
      if (next) {
        item.set(key("Next"), next.ref);
      } else {
        item.delete(key("Next"));
      }
    });
    if (kept.length) {
      parent.set(key("First"), kept[0].ref);
      parent.set(key("Last"), kept[kept.length - 1].ref);
    } else {
      parent.delete(key("First"));
      parent.delete(key("Last"));
    }
    const total = kept.reduce((sum, { item, visible }) => {
      const count = item.lookup(key("Count"));
      const open = count instanceof PDFNumber && count.asNumber() > 0;
      return sum + 1 + (open ? visible : 0);
    }, 0);
    const count = parent.lookup(key("Count"));
    const closed = count instanceof PDFNumber && count.asNumber() < 0;
    if (kept.length) {
      parent.set(key("Count"), PDFNumber.of(closed ? -total : total));
    } else {
      parent.delete(key("Count"));
    }
    return total;
  };
  const outlines = doc.catalog.lookup(key("Outlines"));
  if (outlines instanceof PDFDict) {
    prune(outlines);
  }
}

function pruneNamedDestinations(doc: PDFDocument) {
  const legacy = doc.catalog.lookup(key("Dests"));
  if (legacy instanceof PDFDict) {
    for (const [name, value] of legacy.entries()) {
      if (isDeadDestination(doc, doc.context.lookup(value))) {
        legacy.delete(name);
      }
    }
  }
  const seen = new Set<PDFDict>();
  const pruneTree = (node: PDFObject | undefined) => {
    if (!(node instanceof PDFDict) || seen.has(node)) {
      return;
    }
    seen.add(node);
    const names = node.lookup(key("Names"));
    if (names instanceof PDFArray) {
      for (let index = names.size() - 2; index >= 0; index -= 2) {
        if (isDeadDestination(doc, doc.context.lookup(names.get(index + 1)))) {
          names.remove(index + 1);
          names.remove(index);
        }
      }
    }
    const kids = node.lookup(key("Kids"));
    if (kids instanceof PDFArray) {
      kids.asArray().forEach((kid) => pruneTree(doc.context.lookup(kid)));
    }
  };
  const nameTrees = doc.catalog.lookup(key("Names"));
  if (nameTrees instanceof PDFDict) {
    pruneTree(nameTrees.lookup(key("Dests")));
  }
}

function pruneOpenAction(doc: PDFDocument, resolveName: ResolveName) {
  const open = doc.catalog.lookup(key("OpenAction"));
  const destination = open instanceof PDFDict ? (open.lookup(key("S")) === key("GoTo") ? open.get(key("D")) : undefined) : open;
  if (isDeadDestination(doc, destination, resolveName)) {
    doc.catalog.delete(key("OpenAction"));
  }
}

export function removePageRefs(doc: PDFDocument, pageRefs: PDFRef[], removed: Set<PDFRef>) {
  const doomedAnnotations = [...removed].flatMap((ref) => annotationRefs(doc, ref));
  const doomed = new Set<PDFRef>([...removed, ...doomedAnnotations]);
  const remaining = pageRefs.filter((ref) => !removed.has(ref));
  const removedElements = pruneStructTree(doc, doomed);
  pruneIdTree(doc, removedElements);
  setPageRefs(doc, remaining);
  const removedFields = pruneFields(doc, doomed);
  detach(doc, new Set([...doomed, ...removedFields, ...removedElements]));
  const resolveName = namedDestinations(doc);
  pruneLinks(doc, remaining, resolveName);
  pruneOutline(doc, resolveName);
  pruneOpenAction(doc, resolveName);
  pruneNamedDestinations(doc);
  dropXfa(doc);
}

export function collectGarbage(doc: PDFDocument) {
  const reachable = new Set<PDFRef>();
  const seen = new Set<PDFObject>();
  const stack: PDFObject[] = [doc.context.trailerInfo.Root, doc.context.trailerInfo.Info].filter((object): object is PDFObject => !!object);
  while (stack.length) {
    const object = stack.pop()!;
    if (seen.has(object)) {
      continue;
    }
    seen.add(object);
    if (object instanceof PDFRef) {
      reachable.add(object);
      const value = doc.context.lookup(object);
      if (value) {
        stack.push(value);
      }
    } else {
      stack.push(...children(object));
    }
  }
  for (const [ref] of doc.context.enumerateIndirectObjects()) {
    if (!reachable.has(ref)) {
      doc.context.delete(ref);
    }
  }
}
