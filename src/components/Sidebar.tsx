import { useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Outline } from "./Outline";
import { Thumbnails } from "./Thumbnails";

type SidebarProps = {
  pdfDocument: PDFDocumentProxy;
  currentPage: number;
  onSelectPage: (page: number) => void;
  onNavigate: (dest: unknown) => void;
  onOpenUrl: (url: string) => void;
};

export function Sidebar({ pdfDocument, currentPage, onSelectPage, onNavigate, onOpenUrl }: SidebarProps) {
  const [tab, setTab] = useState<"thumbnails" | "outline">("thumbnails");

  return (
    <aside className="sidebar">
      <div className="sidebar-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "thumbnails"} onClick={() => setTab("thumbnails")}>
          Pages
        </button>
        <button type="button" role="tab" aria-selected={tab === "outline"} onClick={() => setTab("outline")}>
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
