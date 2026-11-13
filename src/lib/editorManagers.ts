import { AnnotationEditorParamsType, SignatureExtractor } from "pdfjs-dist";
import type { EventBus, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import { createCommentManager, type CommentState } from "./commentManager";
import { removedMessage } from "./comments";
import { createFormScripting } from "./formScripting";
import type { Markup } from "./markup";
import { attachMarkup, type MarkupLayer } from "./markupLayer";
import { readMarkupParams, styleOf } from "./markupParams";
import { dateLabel, isMarkDescription } from "./marks";
import { readMarkupOffThread } from "./pageEditWorker";
import { passwordOf } from "./pdfjs";
import { showError, showMessage } from "./platform";
import { MAX_SAVED_SIGNATURES, SIGNATURES_KEY, clearLegacySignature, readLegacySignature, readSignatures, withSignature, withoutSignature, writeSignatures, type SavedSignature } from "./signatures";

export const SIGNATURE_HEIGHT_IN_PAGE = 40;

type UiManager = {
  removeEditListeners(): void;
  addEditListeners(): void;
  imageManager: { getFromFile(file: File): Promise<{ bitmap: ImageBitmap } | null> };
};

type Outline = { viewBox: string; toSVGPath(): string };

export type SignatureLines = { outline: Outline; newCurves: number[][]; areContours: boolean; thickness: number; width: number; height: number };

export type DrawnCurves = { width: number; height: number; thickness: number; curves: Array<{ points: number[] }> };

type SignatureEditor = {
  _drawId: number | null;
  description: string;
  _uiManager: UiManager;
  remove(): void;
  addSignature(data: SignatureLines, heightInPage: number, description: string, uuid: string | null): void;
  getFromText(text: string, font: { fontFamily: string; fontStyle: string; fontWeight: string }): SignatureLines | null;
  getDrawnSignature(curves: DrawnCurves): SignatureLines | null;
  getFromImage(bitmap: ImageBitmap): SignatureLines | null;
  getSignaturePreview(): { areContours: boolean; outline: Outline };
};

type AltTextEditor = {
  altTextData?: { altText?: string; decorative?: boolean };
  altTextFinish(): void;
};

export type SignaturePreview = { uuid: string; description: string; viewBox: string; path: string; areContours: boolean };

export type ShapePreview = { viewBox: string; path: string; areContours: boolean };

export type SignatureRequest = {
  full: boolean;
  fromText: (text: string, font: { fontFamily: string; fontStyle: string; fontWeight: string }) => SignatureLines | null;
  fromDrawing: (curves: DrawnCurves) => SignatureLines | null;
  fromImage: (file: File) => Promise<SignatureLines | null>;
};

export type DescriptionRequest = { description: string; preview: ShapePreview };

export type AltTextRequest = { altText: string; decorative: boolean };

export type EditorUiState = CommentState & {
  removed: string | null;
  altText: AltTextRequest | null;
  signature: SignatureRequest | null;
  description: DescriptionRequest | null;
  signatures: SignaturePreview[];
  markupSelection: Markup | null;
};

export const idleEditorUi: EditorUiState = {
  removed: null,
  altText: null,
  signature: null,
  description: null,
  comment: null,
  comments: null,
  selectedComment: null,
  signatures: [],
  markupSelection: null,
};

export function shapePreview(lines: SignatureLines | null): ShapePreview | null {
  return lines ? { viewBox: lines.outline.viewBox, path: lines.outline.toSVGPath(), areContours: lines.areContours } : null;
}

type Decompressed = NonNullable<Awaited<ReturnType<typeof SignatureExtractor.decompressSignature>>>;

const savedLines = ({ outlines, thickness, width, height }: Decompressed) => ({ curves: outlines.map((points) => ({ points })), thickness, width, height });

async function savedPreview({ uuid, description, signatureData }: SavedSignature): Promise<SignaturePreview | null> {
  const data = await SignatureExtractor.decompressSignature(signatureData);
  if (!data) {
    return null;
  }
  const size = Math.max(data.width, data.height);
  const lines = SignatureExtractor.processDrawnLines({
    lines: savedLines(data),
    pageWidth: size,
    pageHeight: size,
    rotation: 0,
    innerMargin: 0,
    mustSmooth: false,
    areContours: data.areContours,
  }) as SignatureLines | null;
  const shape = shapePreview(lines);
  return shape && { uuid, description, ...shape };
}

async function compress(lines: SignatureLines) {
  const { newCurves, areContours, thickness, width, height } = lines;
  return (await SignatureExtractor.compressSignature({ outlines: newCurves, areContours, thickness, width, height })) as string;
}

async function migrateLegacySignature() {
  const dataUrl = readLegacySignature();
  if (!dataUrl) {
    return;
  }
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const lines = SignatureExtractor.process(bitmap, 1, 1, 0, 0) as SignatureLines | null;
  const list = lines && withSignature(readSignatures(), { uuid: crypto.randomUUID(), description: "Signature", signatureData: await compress(lines) });
  if (list && writeSignatures(list)) {
    clearLegacySignature();
  }
}

export function createEditorManagers(eventBus: EventBus, linkService: PDFLinkService) {
  let state = idleEditorUi;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<EditorUiState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  let altTextEditor: { uiManager: UiManager; editor: AltTextEditor } | null = null;
  let signatureEditor: { uiManager: UiManager; editor: SignatureEditor } | null = null;
  let describedEditor: SignatureEditor | null = null;
  let loading: Promise<void> | null = null;

  const refreshSignatures = async () => {
    const previews = await Promise.all(readSignatures().map((entry) => savedPreview(entry).catch(() => null)));
    set({ signatures: previews.filter((preview): preview is SignaturePreview => !!preview) });
  };

  const onStorage = (event: StorageEvent) => {
    if (loading && (event.key === null || event.key === SIGNATURES_KEY)) {
      refreshSignatures();
    }
  };
  window.addEventListener("storage", onStorage);

  const editorUndoBar = {
    isOpen: false,
    show(_undo: () => void, removed: string | number) {
      editorUndoBar.isOpen = true;
      set({ removed: removedMessage(removed) });
    },
    hide() {
      if (editorUndoBar.isOpen) {
        editorUndoBar.isOpen = false;
        set({ removed: null });
      }
    },
    destroy() {
      editorUndoBar.hide();
    },
  };

  const comments = createCommentManager(eventBus, linkService, { set, selected: () => state.selectedComment, undoBar: editorUndoBar });
  let markup: MarkupLayer | null = null;

  const scripting = createFormScripting(eventBus, {
    alert: (text) => showMessage(text, "Message from this form"),
    stopped: () => void showError("This form's scripts stopped responding, so Clumsy turned them off. Calculated fields won't update until the document is reopened."),
  });

  const attachViewer = (viewer: PDFViewer) => {
    scripting.attachViewer(viewer);
    comments.attachViewer(viewer);
    markup = attachMarkup(viewer, eventBus, {
      addCommands: comments.addCommands,
      style: () => styleOf(readMarkupParams()),
      readFile: async (doc) => readMarkupOffThread(await doc.getData(), passwordOf(doc)),
      stampDate: () => dateLabel(new Date()),
      selected: (markupSelection) => set({ markupSelection }),
      removed: () => editorUndoBar.show(() => {}, "markup"),
    });
  };

  const altTextManager = {
    editAltText(manager: UiManager, editor: AltTextEditor) {
      if (altTextEditor || !editor) {
        return;
      }
      const { altText, decorative } = editor.altTextData ?? {};
      altTextEditor = { uiManager: manager, editor };
      manager.removeEditListeners();
      set({ altText: { altText: altText?.trim() ?? "", decorative: decorative === true } });
    },
    destroy() {
      finishAltText(null);
    },
  };

  const finishAltText = (result: AltTextRequest | null) => {
    if (!altTextEditor) {
      return;
    }
    const { uiManager: manager, editor } = altTextEditor;
    altTextEditor = null;
    if (result) {
      editor.altTextData = { altText: result.decorative ? "" : result.altText.trim(), decorative: result.decorative };
    }
    manager.addEditListeners();
    editor.altTextFinish();
    set({ altText: null });
  };

  const signatureManager = {
    async getSignature({ uiManager: manager, editor }: { uiManager: UiManager; editor: SignatureEditor }) {
      signatureEditor = { uiManager: manager, editor };
      manager.removeEditListeners();
      set({
        signature: {
          full: readSignatures().length >= MAX_SAVED_SIGNATURES,
          fromText: (text, font) => editor.getFromText(text, font),
          fromDrawing: (curves) => editor.getDrawnSignature(curves),
          fromImage: async (file) => {
            const data = await manager.imageManager.getFromFile(file).catch(() => null);
            return data ? editor.getFromImage(data.bitmap) : null;
          },
        },
      });
    },
    loadSignatures() {
      loading ??= migrateLegacySignature().catch(() => undefined);
      return loading.then(refreshSignatures);
    },
    async renderEditButton(editor: SignatureEditor) {
      if (isMarkDescription(editor.description)) {
        return null;
      }
      const button = document.createElement("button");
      button.classList.add("altText", "editDescription");
      button.tabIndex = 0;
      button.title = editor.description || "Edit description";
      const span = document.createElement("span");
      span.textContent = "Edit description";
      button.append(span);
      button.addEventListener("click", () => {
        const { outline, areContours } = editor.getSignaturePreview();
        describedEditor = editor;
        editor._uiManager.removeEditListeners();
        set({ description: { description: editor.description ?? "", preview: { viewBox: outline.viewBox, path: outline.toSVGPath(), areContours } } });
      });
      return button;
    },
    destroy() {
      finishSignature(null);
      finishDescription(null);
    },
  };

  const finishSignature = async (result: { lines: SignatureLines; description: string; save: boolean } | null) => {
    if (!signatureEditor) {
      return;
    }
    const { uiManager: manager, editor } = signatureEditor;
    signatureEditor = null;
    set({ signature: null });
    try {
      const uuid = result?.save ? await saveSignature(result.lines, result.description).catch(() => null) : null;
      if (result) {
        editor.addSignature(result.lines, SIGNATURE_HEIGHT_IN_PAGE, result.description, uuid);
      } else if (editor._drawId === null) {
        editor.remove();
      }
    } finally {
      manager.addEditListeners();
    }
  };

  const saveSignature = async (lines: SignatureLines, description: string) => {
    const entry = { uuid: crypto.randomUUID(), description, signatureData: await compress(lines) };
    const list = withSignature(readSignatures(), entry);
    if (!list || !writeSignatures(list)) {
      return null;
    }
    refreshSignatures();
    return entry.uuid;
  };

  const finishDescription = (description: string | null) => {
    const editor = describedEditor;
    if (!editor) {
      return;
    }
    describedEditor = null;
    if (description !== null) {
      editor.description = description;
    }
    editor._uiManager.addEditListeners();
    set({ description: null });
  };

  const placeSignature = async (uuid: string) => {
    const saved = readSignatures().find((entry) => entry.uuid === uuid);
    const data = saved && (await SignatureExtractor.decompressSignature(saved.signatureData));
    if (!saved || !data) {
      return;
    }
    eventBus.dispatch("switchannotationeditorparams", {
      source: null,
      type: AnnotationEditorParamsType.CREATE,
      value: {
        signatureData: {
          lines: savedLines(data),
          mustSmooth: false,
          areContours: data.areContours,
          description: saved.description,
          uuid: saved.uuid,
          heightInPage: SIGNATURE_HEIGHT_IN_PAGE,
        },
      },
    });
  };

  const forgetSignature = (uuid: string) => {
    if (writeSignatures(withoutSignature(readSignatures(), uuid))) {
      refreshSignatures();
    }
  };

  signatureManager.loadSignatures();

  return {
    viewerOptions: { editorUndoBar, altTextManager, signatureManager, commentManager: comments.commentManager, scriptingManager: scripting.manager },
    scripting,
    attachViewer,
    get markup() {
      return markup;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => state,
    setCommentDialog: comments.setCommentDialog,
    dismissRemoval: () => editorUndoBar.hide(),
    finishAltText,
    finishSignature,
    finishDescription,
    finishComment: comments.finishComment,
    addCommands: comments.addCommands,
    placeSignature,
    forgetSignature,
    showComment: comments.showComment,
    canAddNote: comments.canAddNote,
    addNoteAt: comments.addNoteAt,
    dispose() {
      window.removeEventListener("storage", onStorage);
      markup?.dispose();
      comments.dispose();
      scripting.dispose();
    },
  };
}

export type EditorManagers = ReturnType<typeof createEditorManagers>;
