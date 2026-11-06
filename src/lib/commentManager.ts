import { CSSConstants, PDFDateString, applyOpacity, findContrastColor } from "pdfjs-dist";
import type { EventBus, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import { CommentPopup, type CommentTarget } from "./commentPopup";
import { compareComments, dropComments, upsertComment, type CommentEntry } from "./comments";
import { attachStickyNotes, type StickyNotes } from "./stickyNotes";

export type CommentUiManager = {
  removeEditListeners(): void;
  addEditListeners(): void;
  waitForEditorsRendered(pageNumber: number): Promise<void>;
  selectComment(pageIndex: number, uid: string): void;
  addCommands(command: UndoableCommand): void;
};

export type UndoableCommand = { cmd: () => void; undo: () => void; mustExec: boolean };

type CommentEditor = CommentTarget & {
  uid: string;
  getData(): ReturnType<CommentTarget["getData"]> & { id: string; pageIndex: number; rect: number[] };
  focusCommentButton(): void;
  commentButtonWidth: number;
};

type AnnotationComment = ReturnType<CommentEditor["getData"]> & { popupRef?: unknown };

export type CommentRequest = { text: string; x: number; y: number; height: number | null; color: string | null; anchor: { right: number; buttonWidth: number } | null };

export type CommentState = { comment: CommentRequest | null; comments: CommentEntry[] | null; selectedComment: string | null };

type CommentHost = {
  set(patch: Partial<CommentState>): void;
  selected(): string | null;
  undoBar: { show(undo: () => void, removed: string): void; hide(): void };
};

function makeCommentColor(color: ArrayLike<number> | null | undefined, opacity: number | null | undefined) {
  if (!color || matchMedia("(forced-colors: active)").matches) {
    return null;
  }
  return findContrastColor(applyOpacity(color, opacity ?? 1), CSSConstants.commentForegroundColor) as string;
}

function commentEntry(annotation: AnnotationComment): CommentEntry {
  const { id, pageIndex, rect, richText, contentsObj, creationDate, modificationDate, color, opacity } = annotation;
  return {
    id,
    pageIndex,
    rect: Array.from(rect),
    time: PDFDateString.toDateObject(modificationDate || creationDate || "")?.getTime() ?? null,
    text: (richText?.str && (!contentsObj?.str || richText.str === contentsObj.str) ? richText.str : contentsObj?.str) ?? "",
    color: makeCommentColor(color, opacity),
  };
}

const hasCommentText = (annotation: AnnotationComment) => !!annotation.popupRef && !!(annotation.richText?.str || annotation.contentsObj?.str);

const savesComment = ({ elementBeforePopup }: CommentEditor) => {
  if (!elementBeforePopup.closest(".annotationLayer")) {
    return true;
  }
  const section = elementBeforePopup.localName === "section" ? elementBeforePopup : elementBeforePopup.previousElementSibling;
  return !!section?.matches(":is(.highlightAnnotation, .freeTextAnnotation, .inkAnnotation, .stampAnnotation)");
};

export function createCommentManager(eventBus: EventBus, linkService: PDFLinkService, { set, selected, undoBar }: CommentHost) {
  let uiManager: CommentUiManager | null = null;
  let commentEditor: { uiManager: CommentUiManager | null; editor: CommentEditor } | null = null;
  let commentDialog: HTMLElement | null = null;
  let notes: StickyNotes | null = null;
  let pdfComments: CommentEntry[] | null = null;
  let noteComments: CommentEntry[] = [];

  const popup = new CommentPopup({ makeColor: makeCommentColor, onHide: () => set({ selectedComment: null }) });

  const publishComments = () => set({ comments: pdfComments && [...pdfComments, ...noteComments].sort(compareComments) });

  const refreshNotes = () => {
    notes?.entries().then((entries) => {
      noteComments = entries;
      if (pdfComments) {
        publishComments();
      }
    });
  };

  const commentManager = {
    get dialogElement() {
      return commentDialog;
    },
    setSidebarUiManager(manager: CommentUiManager) {
      uiManager = manager;
    },
    showSidebar(annotations: AnnotationComment[]) {
      pdfComments = annotations.filter(hasCommentText).map(commentEntry).reduce(upsertComment, [] as CommentEntry[]);
      publishComments();
      refreshNotes();
    },
    hideSidebar() {
      pdfComments = null;
      set({ comments: null, selectedComment: null });
    },
    removeComments(ids: string[]) {
      if (pdfComments) {
        pdfComments = dropComments(pdfComments, ids);
        publishComments();
      }
    },
    selectComment(id: string | null) {
      set({ selectedComment: id });
    },
    addComment(annotation: AnnotationComment) {
      commentManager.updateComment(annotation);
    },
    updateComment(annotation: AnnotationComment) {
      if (!pdfComments) {
        return;
      }
      pdfComments = hasCommentText(annotation) ? upsertComment(pdfComments, commentEntry(annotation)) : dropComments(pdfComments, [annotation.id]);
      publishComments();
    },
    toggleCommentPopup(editor: CommentEditor, isSelected: boolean, visibility?: boolean, isEditable = true) {
      if (isSelected && editor) {
        commentManager.selectComment(editor.uid);
      }
      popup.toggle(editor, isSelected, visibility, isEditable && (!editor || savesComment(editor)));
    },
    destroyPopup() {
      popup.destroy();
    },
    updatePopupColor(editor: CommentEditor) {
      popup.updateColor(editor);
    },
    makeCommentColor,
    showDialog(manager: CommentUiManager | null, editor: CommentEditor, x: number, y: number, options?: { height?: number; parentDimensions?: DOMRect }) {
      commentEditor = { uiManager: manager, editor };
      const { contentsObj, color, opacity } = editor.getData();
      manager?.removeEditListeners();
      const parent = options?.parentDimensions;
      set({
        comment: {
          text: contentsObj?.str ?? "",
          x,
          y,
          height: options?.height ?? null,
          color: makeCommentColor(color, opacity),
          anchor: editor.hasDefaultPopupPosition() && parent ? { right: parent.x + parent.width, buttonWidth: editor.commentButtonWidth * parent.width } : null,
        },
      });
    },
    destroy() {
      finishComment(null);
      popup.destroy();
    },
  };

  const finishComment = (text: string | null) => {
    if (!commentEditor) {
      return;
    }
    const { uiManager: manager, editor } = commentEditor;
    commentEditor = null;
    set({ comment: null });
    if (text !== null) {
      editor.comment = text;
    }
    editor.focusCommentButton();
    manager?.addEditListeners();
  };

  const showComment = async (entry: CommentEntry) => {
    const wasSelected = selected() === entry.id;
    popup.hide();
    if (wasSelected) {
      return;
    }
    set({ selectedComment: entry.id });
    if (notes?.has(entry.id)) {
      notes.reveal(entry.id);
      return;
    }
    const pageNumber = entry.pageIndex + 1;
    const rendered = uiManager?.waitForEditorsRendered(pageNumber);
    linkService.goToXY(pageNumber, entry.rect[0], entry.rect[3], { center: "both" });
    await rendered;
    uiManager?.selectComment(entry.pageIndex, entry.id);
  };

  const addCommands = (command: UndoableCommand) => {
    undoBar.hide();
    if (uiManager) {
      uiManager.addCommands(command);
    } else {
      command.cmd();
    }
  };

  const attachViewer = (viewer: PDFViewer) => {
    notes = attachStickyNotes(viewer, eventBus, linkService, {
      toggle: (target, isSelected, visibility, isEditable) => commentManager.toggleCommentPopup(target, isSelected, visibility, isEditable),
      isPopupPinned: () => popup.pinned,
      hidePopup: (id) => {
        if (!id || popup.editor?.uid === id) {
          popup.hide();
        }
      },
      editComment: (target, x, y, options) => commentManager.showDialog(uiManager, target, x, y, options),
      addCommands,
      makeColor: makeCommentColor,
      removed: () => undoBar.show(() => {}, "comment"),
      changed: refreshNotes,
    });
  };

  return {
    commentManager,
    attachViewer,
    addCommands,
    setCommentDialog(element: HTMLElement | null) {
      commentDialog = element;
    },
    finishComment,
    showComment,
    canAddNote: () => !!notes?.writable(),
    addNoteAt: (pageDiv: HTMLElement, clientX: number, clientY: number) => !!notes?.addAt(pageDiv, clientX, clientY),
    dispose() {
      notes?.dispose();
      popup.destroy();
    },
  };
}
