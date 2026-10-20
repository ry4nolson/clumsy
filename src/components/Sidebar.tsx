import type { PDFDocumentProxy } from "pdfjs-dist";
import type { SelectModifiers } from "../lib/pageSelection";
import { Outline } from "./Outline";
import { Thumbnails } from "./Thumbnails";

export type SidebarTab = "thumbnails" | "outline";

type SidebarProps = {
  tab: SidebarTab;
  onTab: (tab: SidebarTab) => void;
  pdfDocument: PDFDocumentProxy;
  currentPage: number;
  selection: number[];
  onSelectPage: (page: number, modifiers: SelectModifiers) => void;
  onMovePages: (page: number, slot: number) => void;
  onPageMenu: (page: number) => void;
  onDeletePages: () => void;
  onNavigate: (dest: unknown) => void;
  onOpenUrl: (url: string) => void;
};

export function Sidebar(props: SidebarProps) {
  const { tab, onTab, pdfDocument, currentPage, onNavigate, onOpenUrl } = props;
  return (
    <aside className="sidebar">
      <div className="sidebar-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "thumbnails"} onClick={() => onTab("thumbnails")}>
          Pages
        </button>
        <button type="button" role="tab" aria-selected={tab === "outline"} onClick={() => onTab("outline")}>
          Outline
        </button>
      </div>
      <div className="sidebar-content">
        {tab === "thumbnails" ? (
          <Thumbnails
            pdfDocument={pdfDocument}
            currentPage={currentPage}
            selection={props.selection}
            onSelect={props.onSelectPage}
            onMove={props.onMovePages}
            onContextMenu={props.onPageMenu}
            onDelete={props.onDeletePages}
          />
        ) : (
          <Outline pdfDocument={pdfDocument} onNavigate={onNavigate} onOpenUrl={onOpenUrl} />
        )}
      </div>
    </aside>
  );
}
