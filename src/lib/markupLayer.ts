import type { PDFDocumentProxy } from "pdfjs-dist";
import type { EventBus, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { UndoableCommand } from "./commentManager";
import { mayBeMarkup, movedMarkup, restyledMarkup, sameStyle, type Markup, type MarkupStyle, type ShapeKind, type TextMarkupKind } from "./markup";
import { defaultFormat, fullSize, type MeasureKind } from "./measure";
import type { PageScale } from "./measurePdf";
import { createMeasureTool } from "./measureTool";
import { textMarkupFromSelection } from "./markupSelection";
import { draftFor, drawable, insidePage, resizedMarkup, withVertexToggled } from "./markupDraft";
import { attachMarkupKeys } from "./markupKeys";
import { clampShift, outerRect, type Handle, type Point } from "./markupShapes";
import { createMarkupStore } from "./markupStore";
import { createScaleQuestion } from "./scaleQuestion";
import { markupDrawing, markupHitTarget, matrixAttribute, selectionOverlay, svg } from "./markupSvg";
import { pdfDate } from "./notes";

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
};

export type MarkupTool =
  | { kind: "shape"; shape: ShapeKind }
  | { kind: "stamp"; stamp: string }
  | { kind: "text"; text: TextMarkupKind }
  | { kind: "measure"; measure: MeasureKind }
  | null;

export type MarkupHooks = {
  addCommands(command: UndoableCommand): void;
  style(): MarkupStyle;
  readFile(doc: PDFDocumentProxy): Promise<Markup[]>;
  readScales(doc: PDFDocumentProxy): Promise<Array<PageScale | null>>;
  stampDate(): string;
  askScale(): Promise<boolean>;
  listed(measurements: Markup[] | null): void;
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

const now = () => pdfDate(new Date());

export function attachMarkup(viewer: PDFViewer, eventBus: EventBus, hooks: MarkupHooks) {
  const container = viewer.container as HTMLDivElement;
  let tool: MarkupTool = null;
  let interactive = false;
  let selectedId: string | null = null;
  let drag: ActiveDrag | null = null;

  const pageView = (pageIndex: number) => viewer.getPageView(pageIndex) as unknown as MarkupPageView | undefined;
  const store = createMarkupStore(viewer, {
    addCommands: hooks.addCommands,
    readFile: hooks.readFile,
    readScales: hooks.readScales,
    loaded: () => {
      paintAll();
      publishList();
    },
    changed: (pageIndex) => {
      paint(pageIndex);
      publishList();
      if (selectedId && !store.find(selectedId)) {
        selectedId = null;
      }
      publishSelection();
    },
  });
  const findMarkup = store.find;
  const drawing = () => tool?.kind === "shape" || tool?.kind === "stamp" || tool?.kind === "measure";
  const writable = store.writable;
  const change = store.change;

  const publishSelection = () => hooks.selected(findMarkup(selectedId));

  const publishList = () => {
    const list = store.measurements();
    hooks.listed(list.length || tool?.kind === "measure" ? list : null);
  };

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

  const measure = createMeasureTool({
    view: pageView,
    point: (pageIndex, clientX, clientY) => {
      const view = pageView(pageIndex);
      return view?.div ? localPoint(view, clientX, clientY) : null;
    },
    repaint: (pageIndex) => paint(pageIndex),
    finish: (created) => {
      change(created, created);
      select(created.id);
    },
    style: () => hooks.style(),
    settings: (pageIndex) => store.scaleOf(pageIndex) ?? { scale: fullSize, format: defaultFormat },
  });

  const scaleQuestion = createScaleQuestion({
    store,
    container,
    measuring: () => tool?.kind === "measure",
    currentPage: () => viewer.currentPageNumber - 1,
    ask: hooks.askScale,
    cancel: measure.cancel,
  });

  const reset = () => {
    measure.cancel();
    store.reset();
    if (tool?.kind === "measure") {
      store.loadScales();
    }
    selectedId = null;
    drag = null;
    hooks.selected(null);
    publishList();
  };

  const resetIfNew = () => {
    if (store.isStale()) {
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
    const building = measure.preview(pageIndex);
    if (building) {
      return building;
    }
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
    const markups = store.onPage(pageIndex).map((markup) => (preview && markup.id === preview.id ? preview : markup));
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
    const edited = store.edited();
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
      if (view?.div?.querySelector(":scope > svg.markup-layer") || (view?.renderingState === RENDERED && (store.hasFileMarkup(index) || drawing()))) {
        paint(index);
      }
    }
  };

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
    if (drag && event.pointerType === "touch" && event.pointerId !== drag.pointerId) {
      const { pageIndex: abandoned } = drag;
      drag = null;
      return paint(abandoned);
    }
    if (drag || event.button !== 0 || !view || !writable()) {
      return;
    }
    if (tool?.kind === "measure" && !measure.building() && scaleQuestion.blocks(pageIndex)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (measure.pointerDown(event, pageIndex, target.classList.contains("markup-surface"), this)) {
      event.preventDefault();
      event.stopPropagation();
      container.focus({ preventScroll: true });
      return;
    }
    const point = localPoint(view, event.clientX, event.clientY);
    const handle = target.closest<SVGElement>(".markup-handle")?.dataset.handle as Handle | undefined;
    const id = target.closest<SVGElement>(".markup")?.dataset.markup;
    const selected = event.altKey && (handle || id === selectedId) ? findMarkup(selectedId) : null;
    const toggled = selected && withVertexToggled(selected, handle, point);
    if (selected && toggled) {
      event.preventDefault();
      event.stopPropagation();
      change(selected, toggled);
    } else if (handle && selectedId) {
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
    if (measure.pointerMove(event)) {
      return;
    }
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
    if (measure.pointerUp(event)) {
      return;
    }
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
    store.commit(created.map((markup) => ({ id: markup.id, pageIndex: markup.pageIndex, after: markup })));
    if (created.length) {
      document.getSelection()?.removeAllRanges();
    }
    return created.length > 0;
  };

  const onContainerPointerUp = (event: PointerEvent) => {
    if (tool?.kind === "text" && event.button === 0) {
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
    if (!store.loaded()) {
      source.pdfPage
        ?.getAnnotations()
        .then((annotations) => {
          if ((annotations as Array<{ annotationType: number }>).some(mayBeMarkup)) {
            store.loadFile();
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
  const detachKeys = attachMarkupKeys({
    container,
    building: measure.building,
    buildKey: measure.key,
    selected: () => findMarkup(selectedId),
    deselect: () => select(null),
    pageView,
    change,
    removed: hooks.removed,
  });
  container.addEventListener("pointerdown", onContainerPointerDown, true);
  container.addEventListener("pointerup", onContainerPointerUp);

  return {
    setTool(next: MarkupTool) {
      if (next?.kind === "text") {
        select(null);
      }
      tool = next;
      measure.setKind(next?.kind === "measure" ? next.measure : null);
      if (next?.kind === "measure") {
        scaleQuestion.check();
      }
      updateClasses();
      paintAll();
      publishList();
    },
    show(id: string) {
      const markup = findMarkup(id);
      const view = markup && pageView(markup.pageIndex);
      if (!markup || !view?.div) {
        return;
      }
      const [left, bottom, right, top] = outerRect(markup);
      const [x, y] = view.viewport.convertToViewportPoint((left + right) / 2, (bottom + top) / 2);
      container.scrollTo({ left: view.div.offsetLeft + x - container.clientWidth / 2, top: view.div.offsetTop + y - container.clientHeight / 2 });
      select(id);
      container.focus({ preventScroll: true });
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
      detachKeys();
      container.removeEventListener("pointerdown", onContainerPointerDown, true);
      container.removeEventListener("pointerup", onContainerPointerUp);
      container.classList.remove("markup-select", "markup-drawing");
    },
  };
}

export type MarkupLayer = ReturnType<typeof attachMarkup>;
