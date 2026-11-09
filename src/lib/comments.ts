export type CommentEntry = {
  id: string;
  pageIndex: number;
  rect: number[];
  time: number | null;
  text: string;
  color: string | null;
};

export function compareComments(a: CommentEntry, b: CommentEntry) {
  if (a.time !== b.time) {
    if (a.time !== null && b.time !== null) {
      return b.time - a.time;
    }
    return a.time !== null ? -1 : 1;
  }
  if (a.pageIndex !== b.pageIndex) {
    return a.pageIndex - b.pageIndex;
  }
  for (const [index, direction] of [[3, -1], [0, 1], [1, -1], [2, 1]] as const) {
    if (a.rect[index] !== b.rect[index]) {
      return direction * (a.rect[index] - b.rect[index]);
    }
  }
  return a.id.localeCompare(b.id);
}

export function upsertComment(list: CommentEntry[], entry: CommentEntry) {
  return [...list.filter((item) => item.id !== entry.id), entry].sort(compareComments);
}

export function dropComments(list: CommentEntry[], ids: Iterable<string>) {
  const gone = new Set(ids);
  return list.filter((item) => !gone.has(item.id));
}

const removedMessages: Record<string, string> = {
  highlight: "Highlight removed",
  freetext: "Text removed",
  ink: "Drawing removed",
  stamp: "Image removed",
  signature: "Signature removed",
  comment: "Comment removed",
  markup: "Markup removed",
};

export function removedMessage(removed: string | number) {
  if (typeof removed === "number") {
    return removed === 1 ? "1 annotation removed" : `${removed} annotations removed`;
  }
  return removedMessages[removed] ?? "Annotation removed";
}

const DIALOG_MARGIN = 8;

type DialogAnchor = { x: number; y: number; height: number | null; anchor: { right: number; buttonWidth: number } | null };

export function placeCommentDialog(request: DialogAnchor, width: number, height: number, viewport: { width: number; height: number }) {
  let { x, y } = request;
  if (request.anchor && x + width > Math.min(request.anchor.right, viewport.width)) {
    x -= width - request.anchor.buttonWidth;
  }
  x = Math.min(Math.max(x, DIALOG_MARGIN), viewport.width - width - DIALOG_MARGIN);
  y = Math.min(Math.max(y, DIALOG_MARGIN), viewport.height - Math.max(height, request.height ?? 0) - DIALOG_MARGIN);
  return { x: Math.max(x, DIALOG_MARGIN), y: Math.max(y, DIALOG_MARGIN) };
}

const FREE_TEXT_ANNOTATION = 3;

type AnnotationData = { annotationType: number; popupRef?: string | null };

export function withoutTextBoxComment<T extends AnnotationData>(annotation: T): T {
  if (annotation.annotationType !== FREE_TEXT_ANNOTATION || annotation.popupRef) {
    return annotation;
  }
  return { ...annotation, contentsObj: null, richText: null };
}
