import type { PDFDocumentProxy } from "pdfjs-dist";
import type { EventBus, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { UndoableCommand } from "./commentManager";
import { isTypingTarget } from "./commands";
import { hideAnnotations } from "./hiddenAnnotations";
import {
  MARKUP_KEY_PREFIX,
  editedFileIds,
  markupIn,
  mayBeMarkup,
  movedMarkup,
  removedMarkup,
  restyledMarkup,
  sameStyle,
  visibleMarkup,
  type Markup,
  type MarkupStyle,
  type ShapeKind,
  type TextMarkupKind,
} from "./markup";
import { textMarkupFromSelection } from "./markupSelection";
import { draftFor, drawable, insidePage, nudgeDelta, resizedMarkup, undoBursts } from "./markupDraft";
import { clampShift, outerRect, type Handle, type Point } from "./markupShapes";
import { markupDrawing, markupHitTarget, matrixAttribute, selectionOverlay, svg } from "./markupSvg";
import { pdfDate } from "./notes";
import { claimStamps } from "./pdfjs";

type Viewport = {
  width: number;
  height: number;
  scale: number;
  transform: number[];
  convertToViewportPoint(x: number, y: number): number[];
  convertToPdfPoint(x: number, y: number): number[];
};

type MarkupPageView = {
  div?: HTMLDivElement;
  viewport: Viewport;
  pdfPage: { getAnnotations(): Promise<unknown[]>; rotate: number; view: number[] } | null;
  renderingState?: number;
  reset(options: Record<string, boolean>): void;
};

export type MarkupTool = { kind: "shape"; shape: ShapeKind } | { kind: "stamp"; stamp: string } | { kind: "text"; text: TextMarkupKind } | null;

export type MarkupHooks = {
  addCommands(command: UndoableCommand): void;
  style(): MarkupStyle;
  readFile(doc: PDFDocumentProxy): Promise<Markup[]>;
  stampDate(): string;
  selected(markup: Markup | null): void;
  removed(): void;
};

type Drag =
  | { mode: "draw"; pageIndex: number; pointerId: number; start: Point; end: Point; shift: boolean; moved: boolean }
  | { mode: "move"; pageIndex: number; pointerId: number; id: string; start: Point; delta: Point; moved: boolean }
  | { mode: "resize"; pageIndex: number; pointerId: number; id: string; handle: Handle; preview: Markup | null };
type ActiveDrag = Drag & { layer: SVGSVGElement };

const MIN_HIT = 6;
const DRAG_THRESHOLD = 3;
const RENDERED = 3;
const KEEP_LAYERS = { keepAnnotationLayer: true, keepAnnotationEditorLayer: true, keepXfaLayer: true, keepTextLayer: true, keepCanvasWrapper: true };

const now = () => pdfDate(new Date());

export function attachMarkup(viewer: PDFViewer, eventBus: EventBus, hooks: MarkupHooks) {
  const container = viewer.container as HTMLDivElement;
  let doc: PDFDocumentProxy | null = null;
  let file: Promise<Markup[]> | null = null;
  let fileByPage = new Map<number, Markup[]>();
  let hiddenIds = new Set<string>();
  let tool: MarkupTool = null;
  let interactive = false;
  let selectedId: string | null = null;
  let drag: ActiveDrag | null = null;
  const burstType = undoBursts(1000);

  const pageView = (pageIndex: number) => viewer.getPageView(pageIndex) as unknown as MarkupPageView | undefined;
  const changes = () => markupIn(doc?.annotationStorage ?? []);
  const allMarkup = () => visibleMarkup([...fileByPage.values()].flat(), changes());
  const findMarkup = (id: string | null) => (id && allMarkup().find((markup) => markup.id === id)) || null;
  const drawing = () => tool?.kind === "shape" || tool?.kind === "stamp";
  const writable = () => !!doc && (viewer.pdfDocument ?? null) === doc;

  const publishSelection = () => hooks.selected(findMarkup(selectedId));

  const select = (id: string | null) => {
    if (selectedId === id) {
      return;
    }
    const before = findMarkup(selectedId);
    selectedId = id;
    if (before) {
      paint(before.pageIndex);
    }
    const after = findMarkup(id);
    if (after) {
      paint(after.pageIndex);
    }
    publishSelection();
  };

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
          paintAll();
        }
        return list;
      });
    return file;
  };

  const reset = () => {
    doc = viewer.pdfDocument ?? null;
    file = null;
    fileByPage = new Map();
    hiddenIds = new Set();
    selectedId = null;
    drag = null;
    hooks.selected(null);
    if (doc) {
      claimStamps(doc, () => loadFile().then((list) => new Set(list.filter((markup) => markup.kind === "stamp").map((markup) => markup.id))));
    }
  };

  const resetIfNew = () => {
    if ((viewer.pdfDocument ?? null) !== doc) {
      reset();
    }
  };

  const localPoint = (view: MarkupPageView, clientX: number, clientY: number): Point => {
    const box = view.div!.getBoundingClientRect();
    const { viewport } = view;
    const [x, y] = viewport.convertToPdfPoint(((clientX - box.left) * viewport.width) / box.width, ((clientY - box.top) * viewport.height) / box.height);
    return [x, y];
  };

  const draftMarkup = (current: Extract<Drag, { mode: "draw" }>): Markup | null => {
    const view = pageView(current.pageIndex);
    return view?.pdfPage ? draftFor(tool, { ...current, rotation: view.pdfPage.rotate }, hooks.style(), hooks.stampDate) : null;
  };

  const previewOf = (pageIndex: number): Markup | null => {
    if (!drag || drag.pageIndex !== pageIndex) {
      return null;
    }
    if (drag.mode === "draw") {
      return drag.moved || tool?.kind === "stamp" ? draftMarkup(drag) : null;
    }
    if (drag.mode === "resize") {
      return drag.preview;
    }
    const markup = findMarkup(drag.id);
    return markup && drag.moved ? movedMarkup(markup, drag.delta[0], drag.delta[1], now()) : null;
  };

  const paint = (pageIndex: number) => {
    const view = pageView(pageIndex);
    if (!view?.div) {
      return;
    }
    const preview = previewOf(pageIndex);
    const markups = visibleMarkup(fileByPage.get(pageIndex) ?? [], changes(), pageIndex).map((markup) => (preview && markup.id === preview.id ? preview : markup));
    if (preview && !markups.some((markup) => markup.id === preview.id)) {
      markups.push(preview);
    }
    let layer = view.div.querySelector<SVGSVGElement>(":scope > svg.markup-layer");
    if (!layer && !markups.length && !drawing()) {
      return;
    }
    if (!layer) {
      layer = svg("svg", { class: "markup-layer" });
      layer.addEventListener("pointerdown", onPointerDown);
      layer.addEventListener("pointermove", onPointerMove);
      layer.addEventListener("pointerup", onPointerUp);
      layer.addEventListener("pointercancel", onPointerUp);
      layer.addEventListener("lostpointercapture", onPointerUp);
    }
    if (!layer.isConnected) {
      view.div.append(layer);
    }
    const { viewport } = view;
    layer.setAttribute("viewBox", `0 0 ${viewport.width} ${viewport.height}`);
    layer.dataset.page = String(pageIndex);
    const content = svg("g", { class: "markup-content", transform: matrixAttribute(viewport.transform) });
    const edited = editedFileIds(changes());
    for (const markup of markups) {
      const group = svg("g", { class: "markup", "data-markup": markup.id });
      if (markup.fresh || edited.has(markup.id) || markup === preview) {
        group.append(markupDrawing(markup));
      }
      group.append(markupHitTarget(markup, MIN_HIT / viewport.scale));
      content.append(group);
    }
    const selected = markups.find((markup) => markup.id === selectedId);
    layer.replaceChildren(svg("rect", { class: "markup-surface", width: viewport.width, height: viewport.height }), content, ...(selected ? [selectionOverlay(selected, viewport)] : []));
  };

  const paintAll = () => {
    for (let index = 0; index < viewer.pagesCount; index++) {
      const view = pageView(index);
      if (view?.div?.querySelector(":scope > svg.markup-layer") || (view?.renderingState === RENDERED && (fileByPage.has(index) || drawing()))) {
        paint(index);
      }
    }
  };

  const pageOf = (id: string) => [...fileByPage.values()].flat().find((markup) => markup.id === id)?.pageIndex;

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
      const view = pageIndex === undefined ? null : pageView(pageIndex);
      view?.reset(KEEP_LAYERS);
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
    paint(pageIndex);
    if (selectedId && !findMarkup(selectedId)) {
      selectedId = null;
    }
    publishSelection();
  };

  const commit = (entries: Array<{ id: string; pageIndex: number; after: Markup | null }>, coalesce?: string) => {
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

  const startDrag = (event: PointerEvent, layer: SVGSVGElement, next: Drag) => {
    event.preventDefault();
    event.stopPropagation();
    layer.setPointerCapture(event.pointerId);
    container.focus({ preventScroll: true });
    drag = { ...next, layer };
  };

  function onPointerDown(this: SVGSVGElement, event: PointerEvent) {
    const pageIndex = Number(this.dataset.page);
    const view = pageView(pageIndex);
    const target = event.target as Element;
    if (drag && !drag.layer.isConnected) {
      drag = null;
    }
    if (drag || event.button !== 0 || !view || !writable()) {
      return;
    }
    const point = localPoint(view, event.clientX, event.clientY);
    const handle = target.closest<SVGElement>(".markup-handle")?.dataset.handle as Handle | undefined;
    const id = target.closest<SVGElement>(".markup")?.dataset.markup;
    if (handle && selectedId) {
      startDrag(event, this, { mode: "resize", pageIndex, pointerId: event.pointerId, id: selectedId, handle, preview: null });
    } else if (id) {
      select(id);
      startDrag(event, this, { mode: "move", pageIndex, pointerId: event.pointerId, id, start: point, delta: [0, 0], moved: false });
    } else if (drawing() && target.classList.contains("markup-surface")) {
      select(null);
      startDrag(event, this, { mode: "draw", pageIndex, pointerId: event.pointerId, start: point, end: point, shift: event.shiftKey, moved: false });
      paint(pageIndex);
    }
  }

  function onPointerMove(this: SVGSVGElement, event: PointerEvent) {
    const view = drag && pageView(drag.pageIndex);
    if (!drag || !view?.pdfPage || event.pointerId !== drag.pointerId) {
      return;
    }
    const point = localPoint(view, event.clientX, event.clientY);
    const moved = (from: Point) => {
      const [ax, ay] = view.viewport.convertToViewportPoint(from[0], from[1]);
      const [bx, by] = view.viewport.convertToViewportPoint(point[0], point[1]);
      return Math.hypot(bx - ax, by - ay) >= DRAG_THRESHOLD;
    };
    if (drag.mode === "draw") {
      drag = { ...drag, end: insidePage(point, view.pdfPage.view), shift: event.shiftKey, moved: drag.moved || moved(drag.start) };
    } else if (drag.mode === "move") {
      const markup = findMarkup(drag.id);
      if (!markup) {
        return;
      }
      const delta = clampShift(outerRect(markup), point[0] - drag.start[0], point[1] - drag.start[1], view.pdfPage.view);
      drag = { ...drag, delta, moved: drag.moved || moved(drag.start) };
    } else {
      const markup = findMarkup(drag.id);
      drag = { ...drag, preview: markup && resizedMarkup(markup, drag.handle, insidePage(point, view.pdfPage.view), event.shiftKey) };
    }
    paint(drag.pageIndex);
  }

  function onPointerUp(this: SVGSVGElement, event: PointerEvent) {
    const ended = drag;
    if (!ended || event.pointerId !== ended.pointerId) {
      return;
    }
    drag = null;
    const finished = event.type === "pointerup";
    if (ended.mode === "draw") {
      const created = finished ? draftMarkup(ended) : null;
      if (created && (ended.moved || created.kind === "stamp") && drawable(created)) {
        change(created, created);
        select(created.id);
      }
    } else if (ended.mode === "move") {
      const markup = findMarkup(ended.id);
      if (finished && markup && ended.moved && (ended.delta[0] || ended.delta[1])) {
        change(markup, movedMarkup(markup, ended.delta[0], ended.delta[1], now()));
      }
    } else if (finished && ended.preview) {
      const markup = findMarkup(ended.id);
      if (markup) {
        change(markup, ended.preview);
      }
    }
    paint(ended.pageIndex);
  }

  const nudge = (markup: Markup, key: string, step: number) => {
    const view = pageView(markup.pageIndex);
    const delta = view?.pdfPage && nudgeDelta(view.viewport, key, step);
    const [dx, dy] = delta ? clampShift(outerRect(markup), delta[0], delta[1], view.pdfPage!.view) : [0, 0];
    if (dx || dy) {
      change(markup, movedMarkup(markup, dx, dy, now()), "nudge");
    }
  };

  const remove = (markup: Markup) => {
    if (change(markup, removedMarkup(markup, now()))) {
      hooks.removed();
    }
  };

  const visible = () => container.contains(document.activeElement) && !container.closest("[inert]") && !document.querySelector("dialog[open], :popover-open");

  const onKeyDown = (event: KeyboardEvent) => {
    const markup = findMarkup(selectedId);
    if (!markup || !visible() || isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (event.key === "Escape") {
      select(null);
    } else if (event.key === "Backspace" || event.key === "Delete") {
      remove(markup);
    } else if (event.key.startsWith("Arrow")) {
      nudge(markup, event.key, event.shiftKey ? 10 : 1);
    } else {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onContainerPointerDown = (event: PointerEvent) => {
    const target = event.target as Element;
    if (selectedId && !target.closest?.(".markup-layer .markup, .markup-handle")) {
      select(null);
    }
  };

  const applyText = (kind: TextMarkupKind) => {
    if (!writable()) {
      return false;
    }
    const created = textMarkupFromSelection(container, (pageIndex) => pageView(pageIndex)?.viewport ?? null, kind, hooks.style(), now());
    commit(created.map((markup) => ({ id: markup.id, pageIndex: markup.pageIndex, after: markup })));
    if (created.length) {
      document.getSelection()?.removeAllRanges();
    }
    return created.length > 0;
  };

  const onContainerPointerUp = () => {
    if (tool?.kind === "text") {
      const kind = tool.text;
      setTimeout(() => applyText(kind));
    }
  };

  const onRendered = ({ source, isDetailView }: { source: MarkupPageView & { id: number }; isDetailView?: boolean }) => {
    if (isDetailView) {
      return;
    }
    resetIfNew();
    const pageIndex = source.id - 1;
    paint(pageIndex);
    if (!file) {
      source.pdfPage
        ?.getAnnotations()
        .then((annotations) => {
          if ((annotations as Array<{ annotationType: number }>).some(mayBeMarkup)) {
            loadFile();
          }
        })
        .catch(() => undefined);
    }
  };

  const updateClasses = () => {
    container.classList.toggle("markup-select", (interactive && !tool) || drawing());
    container.classList.toggle("markup-drawing", drawing());
  };

  eventBus.on("pagesinit", resetIfNew);
  eventBus.on("pagerendered", onRendered);
  eventBus.on("scalechanging", paintAll);
  eventBus.on("rotationchanging", paintAll);
  window.addEventListener("keydown", onKeyDown, true);
  container.addEventListener("pointerdown", onContainerPointerDown, true);
  container.addEventListener("pointerup", onContainerPointerUp);

  return {
    setTool(next: MarkupTool) {
      if (next?.kind === "text") {
        select(null);
      }
      tool = next;
      updateClasses();
      paintAll();
    },
    setInteractive(on: boolean) {
      interactive = on;
      if (!on && !tool) {
        select(null);
      }
      updateClasses();
    },
    restyle(style: Partial<MarkupStyle>) {
      const markup = findMarkup(selectedId);
      if (!markup) {
        return false;
      }
      if (!sameStyle(markup, style)) {
        change(markup, restyledMarkup(markup, style, now()), `restyle:${Object.keys(style).sort().join(",")}`);
      }
      return true;
    },
    applyText,
    dispose() {
      eventBus.off("pagesinit", resetIfNew);
      eventBus.off("pagerendered", onRendered);
      eventBus.off("scalechanging", paintAll);
      eventBus.off("rotationchanging", paintAll);
      window.removeEventListener("keydown", onKeyDown, true);
      container.removeEventListener("pointerdown", onContainerPointerDown, true);
      container.removeEventListener("pointerup", onContainerPointerUp);
      container.classList.remove("markup-select", "markup-drawing");
    },
  };
}

export type MarkupLayer = ReturnType<typeof attachMarkup>;
