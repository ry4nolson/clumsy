import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { EventBus, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { EditorManagers } from "../lib/editorManagers";
import { adjacentField, readFields, readShown, resetEntry, shownValue, tabOrder, writeShown, type FieldEntry, type FormField } from "../lib/formFields";
import { commitEvent, resetEvent, sameValue } from "../lib/scriptEvents";

type FormParts = { eventBus: EventBus; viewer: PDFViewer; editorUi: EditorManagers };

type Storage = PDFDocumentProxy["annotationStorage"];

const FIELD_MARGIN = 48;
const RENDER_TIMEOUT = 2000;

export function useViewerForm(partsRef: RefObject<FormParts | null>) {
  const fieldsRef = useRef<{ all: FormField[]; order: FormField[] }>({ all: [], order: [] });
  const lastFieldRef = useRef<string | null>(null);
  const [hasForm, setHasForm] = useState(false);

  const elementFor = useCallback(
    (id: string) => partsRef.current?.viewer.container.querySelector<HTMLElement>(`.annotationLayer [data-element-id="${CSS.escape(id)}"]`) ?? null,
    [partsRef],
  );

  const loadFields = useCallback(
    (doc: PDFDocumentProxy | null) => {
      fieldsRef.current = { all: [], order: [] };
      lastFieldRef.current = null;
      setHasForm(false);
      doc
        ?.getFieldObjects()
        .then((objects) => {
          if (partsRef.current?.viewer.pdfDocument !== doc) {
            return;
          }
          const all = readFields(objects);
          fieldsRef.current = { all, order: tabOrder(all) };
          setHasForm(all.length > 0);
        })
        .catch(() => undefined);
    },
    [partsRef],
  );

  const rendered = useCallback(
    (field: FormField) =>
      new Promise<HTMLElement | null>((resolve) => {
        const eventBus = partsRef.current?.eventBus;
        const done = () => {
          clearTimeout(timer);
          eventBus?.off("annotationlayerrendered", check);
          resolve(elementFor(field.id));
        };
        const check = () => elementFor(field.id) && done();
        const timer = setTimeout(done, RENDER_TIMEOUT);
        eventBus?.on("annotationlayerrendered", check);
      }),
    [partsRef, elementFor],
  );

  const stepField = useCallback(
    async (step: 1 | -1) => {
      const viewer = partsRef.current?.viewer;
      if (!viewer?.pdfDocument) {
        return;
      }
      const active = document.activeElement;
      const focused = active instanceof HTMLElement && viewer.container.contains(active) ? active.getAttribute("data-element-id") : null;
      const remembered = fieldsRef.current.order.find((field) => field.id === lastFieldRef.current);
      const from = focused ?? (remembered?.page === viewer.currentPageNumber - 1 ? remembered.id : null);
      const field = adjacentField(fieldsRef.current.order, { id: from, page: viewer.currentPageNumber - 1 }, step);
      if (!field?.rect) {
        return;
      }
      lastFieldRef.current = field.id;
      let element = elementFor(field.id);
      if (!element) {
        const left = Math.min(field.rect[0], field.rect[2]);
        const top = Math.max(field.rect[1], field.rect[3]);
        viewer.scrollPageIntoView({
          pageNumber: field.page + 1,
          destArray: [null, { name: "XYZ" }, left - FIELD_MARGIN, top + FIELD_MARGIN, null],
          allowNegativeOffset: true,
        });
        element = await rendered(field);
      }
      if (element && lastFieldRef.current === field.id) {
        element.focus();
      }
    },
    [partsRef, elementFor, rendered],
  );

  const resetForm = useCallback(() => {
    const parts = partsRef.current;
    const storage: Storage | undefined = parts?.viewer.pdfDocument?.annotationStorage;
    if (!parts || !storage) {
      return;
    }
    const changes = fieldsRef.current.all.flatMap((field) => {
      const after = resetEntry(field);
      if (!after) {
        return [];
      }
      const stored = storage.getRawValue(field.id) as FieldEntry | undefined;
      const before = stored ? { ...stored } : null;
      const element = elementFor(field.id);
      return [{ field, before, after, shownBefore: element ? readShown(element) : shownValue(field, before) }];
    });
    if (!changes.length) {
      return;
    }
    const apply = (forward: boolean) => {
      for (const { field, before, after, shownBefore } of changes) {
        const entry = forward ? after : before;
        storage.remove(field.id);
        if (entry) {
          storage.setValue(field.id, { ...entry });
        }
        const element = elementFor(field.id);
        if (element && forward) {
          element.dispatchEvent(new Event("resetform"));
        } else if (element) {
          writeShown(element, shownBefore);
        }
      }
      const { scripting } = parts.editorUi;
      if (forward) {
        scripting.dispatch(resetEvent(changes.map(({ field }) => field.id)));
      } else {
        for (const { field, before, after } of changes) {
          const restored = shownValue(field, before);
          if (!sameValue(restored, shownValue(field, after))) {
            scripting.dispatch(commitEvent(field, restored));
          }
        }
      }
    };
    parts.editorUi.addCommands({ cmd: () => apply(true), undo: () => apply(false), mustExec: true });
  }, [partsRef, elementFor]);

  useEffect(() => {
    const container = partsRef.current?.viewer.container;
    if (!container) {
      return;
    }
    const fieldId = (target: EventTarget | null) =>
      target instanceof HTMLElement && target.closest(".annotationLayer") ? target.getAttribute("data-element-id") : null;
    const onFocus = (event: FocusEvent) => {
      const id = fieldId(event.target);
      if (id) {
        lastFieldRef.current = id;
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) {
        return;
      }
      const id = fieldId(event.target);
      if (id && fieldsRef.current.order.some((field) => field.id === id)) {
        event.preventDefault();
        stepField(event.shiftKey ? -1 : 1);
      }
    };
    container.addEventListener("focusin", onFocus);
    container.addEventListener("keydown", onKeyDown, true);
    return () => {
      container.removeEventListener("focusin", onFocus);
      container.removeEventListener("keydown", onKeyDown, true);
    };
  }, [partsRef, stepField]);

  return { hasForm, loadFields, stepField, resetForm };
}
