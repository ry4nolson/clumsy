import type { PDFDocumentProxy } from "pdfjs-dist";
import { Outline } from "./Outline";
import { Thumbnails } from "./Thumbnails";

export type SidebarTab = "thumbnails" | "outline";

type SidebarProps = {
  tab: SidebarTab;
  onTab: (tab: SidebarTab) => void;
  pdfDocument: PDFDocumentProxy;
  currentPage: number;
  onSelectPage: (page: number) => void;
  onNavigate: (dest: unknown) => void;
  onOpenUrl: (url: string) => void;
};

export function Sidebar({ tab, onTab, pdfDocument, currentPage, onSelectPage, onNavigate, onOpenUrl }: SidebarProps) {
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
          <Thumbnails pdfDocument={pdfDocument} currentPage={currentPage} onSelect={onSelectPage} />
        ) : (
          <Outline pdfDocument={pdfDocument} onNavigate={onNavigate} onOpenUrl={onOpenUrl} />
        )}
      </div>
    </aside>
  );
}
