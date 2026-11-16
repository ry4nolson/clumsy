import type { Markup, MarkupStyle, MeasureSettings } from "./markup";
import { insidePage } from "./markupDraft";
import type { Point } from "./markupShapes";
import { snapPoint, type MeasureKind } from "./measure";
import { buildMarkup, canFinish, finishedMarkup, vertexCount, vertexNear, type MeasureBuild } from "./measureBuild";
import { pdfDate } from "./notes";

type ToolViewport = { convertToViewportPoint(x: number, y: number): number[] };

export type MeasureToolView = { viewport: ToolViewport; pdfPage: { rotate: number; view: number[] } | null };

export type MeasureToolDeps = {
  view(pageIndex: number): MeasureToolView | undefined;
  point(pageIndex: number, clientX: number, clientY: number): Point | null;
  repaint(pageIndex: number): void;
  finish(markup: Markup): void;
  style(): MarkupStyle;
  settings(pageIndex: number): MeasureSettings;
};

const CLOSE_RADIUS = 6;
const DRAG_THRESHOLD = 3;

export function createMeasureTool(deps: MeasureToolDeps) {
  let kind: MeasureKind | null = null;
  let build: MeasureBuild | null = null;
  let hover: Point | null = null;
  let press: { pointerId: number; x: number; y: number; dragged: boolean } | null = null;

  const placed = (pageIndex: number, event: PointerEvent): Point | null => {
    const view = deps.view(pageIndex);
    const raw = view?.pdfPage && deps.point(pageIndex, event.clientX, event.clientY);
    if (!view?.pdfPage || !raw) {
      return null;
    }
    const point = insidePage(raw, view.pdfPage.view);
    const count = build ? vertexCount(build) : 0;
    if (!build || !event.shiftKey || !count) {
      return point;
    }
    const last: Point = [build.vertices[count * 2 - 2], build.vertices[count * 2 - 1]];
    return insidePage(snapPoint(last, point) as Point, view.pdfPage.view);
  };

  const screen = (pageIndex: number, points: number[]) => {
    const viewport = deps.view(pageIndex)?.viewport;
    if (!viewport) {
      return [];
    }
    const result: number[] = [];
    for (let index = 0; index + 1 < points.length; index += 2) {
      result.push(...viewport.convertToViewportPoint(points[index], points[index + 1]));
    }
    return result;
  };

  const clear = () => {
    const page = build?.pageIndex;
    build = null;
    hover = null;
    press = null;
    if (page !== undefined) {
      deps.repaint(page);
    }
  };

  const done = () => {
    const finished = build && finishedMarkup(build, deps.style(), pdfDate(new Date()));
    clear();
    if (finished) {
      deps.finish(finished);
    }
  };

  const pointerDown = (event: PointerEvent, pageIndex: number, onSurface: boolean, layer: Element) => {
    if (!kind || (!build && !onSurface)) {
      return false;
    }
    if (build && build.pageIndex !== pageIndex) {
      return true;
    }
    const point = placed(pageIndex, event);
    const view = deps.view(pageIndex);
    if (!point || !view?.pdfPage) {
      return true;
    }
    if (!build) {
      build = { id: `markup-${crypto.randomUUID()}`, pageIndex, kind, vertices: [...point], rotation: view.pdfPage.rotate, settings: deps.settings(pageIndex) };
      hover = point;
      press = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
      layer.setPointerCapture?.(event.pointerId);
      deps.repaint(pageIndex);
      return true;
    }
    const vertices = screen(pageIndex, build.vertices);
    const at = screen(pageIndex, point);
    if (canFinish(build) && vertexNear(vertices.slice(-2), at, CLOSE_RADIUS) === 0) {
      done();
    } else if (build.kind === "measure-area" && vertexCount(build) >= 3 && vertexNear(vertices.slice(0, 2), at, CLOSE_RADIUS) === 0) {
      done();
    } else {
      build.vertices.push(...point);
      if (build.kind === "measure-length" && vertexCount(build) >= 2) {
        done();
      } else {
        deps.repaint(pageIndex);
      }
    }
    return true;
  };

  const pointerMove = (event: PointerEvent) => {
    if (!build) {
      return false;
    }
    hover = placed(build.pageIndex, event) ?? hover;
    if (press && event.pointerId === press.pointerId && event.buttons & 1 && Math.hypot(event.clientX - press.x, event.clientY - press.y) >= DRAG_THRESHOLD) {
      press.dragged = true;
    }
    deps.repaint(build.pageIndex);
    return true;
  };

  const pointerUp = (event: PointerEvent) => {
    if (!press || event.pointerId !== press.pointerId) {
      return false;
    }
    const { dragged } = press;
    press = null;
    if (build && dragged && build.kind === "measure-length" && vertexCount(build) === 1) {
      const point = placed(build.pageIndex, event) ?? hover;
      if (point) {
        build.vertices.push(...point);
      }
      done();
    }
    return true;
  };

  const key = (event: KeyboardEvent) => {
    if (!build) {
      return false;
    }
    if (event.key === "Escape") {
      clear();
    } else if (event.key === "Backspace" || event.key === "Delete") {
      build.vertices.splice(-2, 2);
      if (vertexCount(build)) {
        deps.repaint(build.pageIndex);
      } else {
        clear();
      }
    } else if (event.key === "Enter") {
      if (canFinish(build)) {
        done();
      }
    } else {
      return false;
    }
    return true;
  };

  return {
    setKind(next: MeasureKind | null) {
      clear();
      kind = next;
    },
    building: () => !!build,
    preview: (pageIndex: number) => (build && build.pageIndex === pageIndex ? buildMarkup(build, deps.style(), pdfDate(new Date()), hover) : null),
    pointerDown,
    pointerMove,
    pointerUp,
    key,
    cancel: clear,
  };
}

export type MeasureTool = ReturnType<typeof createMeasureTool>;
