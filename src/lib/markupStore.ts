import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { UndoableCommand } from "./commentManager";
import { hideAnnotations } from "./hiddenAnnotations";
import { MARKUP_KEY_PREFIX, editedFileIds, isMeasureKind, markupIn, visibleMarkup, type Markup } from "./markup";
import { undoBursts } from "./markupDraft";
import type { PageScale } from "./measurePdf";
import { claimStamps } from "./pdfjs";

const MEASURE_TYPES = new Set([4, 7, 8]);
const MEASURE_INTENTS = new Set(["LineDimension", "PolyLineDimension", "PolygonDimension"]);

const KEEP_LAYERS = { keepAnnotationLayer: true, keepAnnotationEditorLayer: true, keepXfaLayer: true, keepTextLayer: true, keepCanvasWrapper: true };

type StorePageView = { reset(options: Record<string, boolean>): void };

export type MarkupEntry = { id: string; pageIndex: number; after: Markup | null };

export type StoreHooks = {
  addCommands(command: UndoableCommand): void;
  readFile(doc: PDFDocumentProxy): Promise<Markup[]>;
  readScales(doc: PDFDocumentProxy): Promise<Array<PageScale | null>>;
  loaded(): void;
  changed(pageIndex: number): void;
};

export function createMarkupStore(viewer: PDFViewer, hooks: StoreHooks) {
  let doc: PDFDocumentProxy | null = null;
  let file: Promise<Markup[]> | null = null;
  let fileByPage = new Map<number, Markup[]>();
  let hiddenIds = new Set<string>();
  let scales: Promise<Array<PageScale | null>> | null = null;
  let scaleList: Array<PageScale | null> = [];
  let scalesReady = false;
  const burstType = undoBursts(1000);

  const changes = () => markupIn(doc?.annotationStorage ?? []);
  const all = () => visibleMarkup([...fileByPage.values()].flat(), changes());
  const find = (id: string | null) => (id && all().find((markup) => markup.id === id)) || null;
  const onPage = (pageIndex: number) => visibleMarkup(fileByPage.get(pageIndex) ?? [], changes(), pageIndex);
  const writable = () => !!doc && (viewer.pdfDocument ?? null) === doc;
  const pageOf = (id: string) => [...fileByPage.values()].flat().find((markup) => markup.id === id)?.pageIndex;

  const loadFile = () => {
    const owner = doc;
    if (!owner) {
      return Promise.resolve([]);
    }
    file ??= hooks
      .readFile(owner)
      .catch(() => [])
      .then((list) => {
        if (doc === owner) {
          fileByPage = new Map();
          for (const markup of list) {
            fileByPage.set(markup.pageIndex, [...(fileByPage.get(markup.pageIndex) ?? []), markup]);
          }
          hooks.loaded();
        }
        return list;
      });
    return file;
  };

  const loadScales = () => {
    const owner = doc;
    if (!owner) {
      return Promise.resolve([]);
    }
    scales ??= hooks
      .readScales(owner)
      .catch(() => [])
      .then((list) => {
        if (doc === owner) {
          scaleList = list;
          scalesReady = true;
        }
        return list;
      });
    return scales;
  };

  const findMeasurements = () => {
    viewer.eventBus.off("pagerendered", findMeasurements);
    const owner = doc;
    owner
      ?.getAnnotationsByType(MEASURE_TYPES, new Set())
      .then((annotations) => {
        if (doc === owner && annotations.some((annotation) => MEASURE_INTENTS.has(String((annotation as { it?: string }).it)))) {
          void loadFile();
        }
      })
      .catch(() => {});
  };

  const reset = () => {
    doc = viewer.pdfDocument ?? null;
    file = null;
    scales = null;
    scaleList = [];
    scalesReady = false;
    fileByPage = new Map();
    hiddenIds = new Set();
    viewer.eventBus.off("pagerendered", findMeasurements);
    if (doc) {
      viewer.eventBus.on("pagerendered", findMeasurements);
      claimStamps(doc, () => loadFile().then((list) => new Set(list.filter((markup) => markup.kind === "stamp").map((markup) => markup.id))));
    }
  };

  const syncHidden = () => {
    if (!doc) {
      return;
    }
    const ids = editedFileIds(changes());
    if (!hideAnnotations(doc, ids)) {
      return;
    }
    const pages = new Set([...ids, ...hiddenIds].filter((id) => ids.has(id) !== hiddenIds.has(id)).map(pageOf));
    hiddenIds = ids;
    for (const pageIndex of pages) {
      (pageIndex === undefined ? null : (viewer.getPageView(pageIndex) as unknown as StorePageView | undefined))?.reset(KEEP_LAYERS);
    }
    viewer.update();
  };

  const put = (id: string, value: Markup | null, pageIndex: number) => {
    const storage = doc?.annotationStorage;
    if (!storage) {
      return;
    }
    storage.remove(MARKUP_KEY_PREFIX + id);
    if (value) {
      storage.setValue(MARKUP_KEY_PREFIX + id, { ...value });
    }
    syncHidden();
    hooks.changed(pageIndex);
  };

  const commit = (entries: MarkupEntry[], coalesce?: string) => {
    if (!writable() || !entries.length) {
      return false;
    }
    const befores = entries.map(({ id }) => (doc!.annotationStorage.getRawValue(MARKUP_KEY_PREFIX + id) as Markup | undefined) ?? null);
    hooks.addCommands({
      cmd: () => entries.forEach(({ id, pageIndex, after }) => put(id, after, pageIndex)),
      undo: () => entries.forEach(({ id, pageIndex }, index) => put(id, befores[index], pageIndex)),
      mustExec: true,
      ...(coalesce && { type: burstType(coalesce), overwriteIfSameType: true, keepUndo: true }),
    });
    return true;
  };

  const change = (markup: Markup, after: Markup | null, coalesce?: string) => commit([{ id: markup.id, pageIndex: markup.pageIndex, after }], coalesce && `${coalesce}:${markup.id}`);

  return {
    current: () => doc,
    isStale: () => (viewer.pdfDocument ?? null) !== doc,
    reset,
    loadFile,
    loaded: () => !!file,
    loadScales,
    scalesReady: () => scalesReady,
    scaleOf: (pageIndex: number) => scaleList[pageIndex] ?? null,
    hasFileMarkup: (pageIndex: number) => fileByPage.has(pageIndex),
    edited: () => editedFileIds(changes()),
    find,
    measurements: () => all().filter((markup) => isMeasureKind(markup.kind)),
    onPage,
    writable,
    commit,
    change,
  };
}

export type MarkupStore = ReturnType<typeof createMarkupStore>;
