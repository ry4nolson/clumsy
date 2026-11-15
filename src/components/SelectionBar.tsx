import { useEffect, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Highlighter, MessageSquare, Strikethrough, Trash2, Underline } from "lucide-react";
import type { PdfViewerApi } from "../hooks/usePdfViewer";
import { isTouchDevice } from "../lib/drawer";
import { TAP_EDIT, pressDelete } from "../lib/touchEdit";

const RELEASE_DELAY = 400;

const SELECTED_OBJECT = ".annotationEditorLayer .selectedEditor, .markup-layer .markup-selection";

function selectedIn(container: HTMLElement | null) {
  const selection = document.getSelection();
  const layer = selection?.anchorNode?.parentElement?.closest(".textLayer") ?? null;
  return !!container && !!selection && !selection.isCollapsed && container.contains(layer) && selection.toString().trim() !== "";
}

function selectionUsed() {
  return new Promise<void>((resolve) => {
    const finish = () => {
      document.removeEventListener("selectionchange", check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => {
      if (document.getSelection()?.isCollapsed) {
        finish();
      }
    };
    const timer = setTimeout(finish, 1500);
    document.addEventListener("selectionchange", check);
  });
}

function BarButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  const press = (event: ReactPointerEvent) => {
    event.preventDefault();
    onPress();
  };
  return (
    <button type="button" className="selection-bar-button" aria-label={label} onPointerDown={press}>
      {children}
      <span>{label}</span>
    </button>
  );
}

export function SelectionBar({ viewer, active }: { viewer: PdfViewerApi; active: boolean }) {
  const [shown, setShown] = useState(false);
  const [held, setHeld] = useState(false);
  const [objectSelected, setObjectSelected] = useState(false);
  const holdUntilReleased = () => {
    const release = () => setTimeout(() => setHeld(false), RELEASE_DELAY);
    setHeld(true);
    window.addEventListener("pointerup", release, { once: true });
    window.addEventListener("pointercancel", release, { once: true });
  };
  const { containerRef } = viewer;

  useEffect(() => {
    if (!isTouchDevice || !active) {
      setShown(false);
      setObjectSelected(false);
      return;
    }
    const container = containerRef.current;
    const update = () => setShown(selectedIn(container));
    const check = () => setObjectSelected(!!container?.querySelector(SELECTED_OBJECT));
    let frame = 0;
    const soon = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(check);
    };
    const watcher = new MutationObserver(soon);
    if (container) {
      watcher.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    }
    check();
    document.addEventListener("selectionchange", update);
    return () => {
      document.removeEventListener("selectionchange", update);
      watcher.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [active, containerRef]);

  if (objectSelected && !shown) {
    const remove = () => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      pressDelete(container);
      if (container.dataset[TAP_EDIT]) {
        delete container.dataset[TAP_EDIT];
        void viewer.setTool("select");
      }
      setObjectSelected(false);
    };
    return (
      <div className="selection-bar" role="toolbar" aria-label="Selected markup" onPointerDownCapture={holdUntilReleased}>
        <BarButton label="Delete" onPress={remove}>
          <Trash2 size={20} />
        </BarButton>
      </div>
    );
  }
  if (!shown && !held) {
    return null;
  }
  const markup = viewer.editorUi?.markup;
  const keepingTool = async (name: "highlightSelection" | "commentSelection") => {
    const selecting = viewer.tool === "select";
    const used = selectionUsed();
    await viewer.editingAction(name);
    if (selecting && name === "highlightSelection") {
      await used;
      await viewer.setTool("select");
    }
  };
  return (
    <div className="selection-bar" role="toolbar" aria-label="Selected text" onPointerDownCapture={holdUntilReleased}>
      <BarButton label="Highlight" onPress={() => void keepingTool("highlightSelection")}>
        <Highlighter size={20} />
      </BarButton>
      <BarButton label="Underline" onPress={() => markup?.applyText("underline")}>
        <Underline size={20} />
      </BarButton>
      <BarButton label="Strike" onPress={() => markup?.applyText("strikeout")}>
        <Strikethrough size={20} />
      </BarButton>
      <BarButton label="Comment" onPress={() => void keepingTool("commentSelection")}>
        <MessageSquare size={20} />
      </BarButton>
    </div>
  );
}
