import type { ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Toolbox } from "lucide-react";
import type { SelectModifiers } from "../lib/pageSelection";
import { Outline } from "./Outline";
import { SidebarShell } from "./SidebarShell";
import { Thumbnails } from "./Thumbnails";

export type SidebarTab = "thumbnails" | "outline" | "changes" | "comments" | "markups" | "toolChest" | "signatures";

type SidebarProps = {
  tab: SidebarTab;
  onTab: (tab: SidebarTab) => void;
  pdfDocument: PDFDocumentProxy;
  paused: boolean;
  restoreImages: boolean;
  currentPage: number;
  pageLabels: string[] | null;
  selection: number[];
  onSelectPage: (page: number, modifiers: SelectModifiers) => void;
  onMovePages: (page: number, slot: number) => void;
  onPageMenu: (page: number, point: { x: number; y: number }) => void;
  onDeletePages: () => void;
  onNavigate: (dest: unknown) => void;
  onOpenUrl: (url: string) => void;
  changes?: ReactNode;
  comments?: ReactNode;
  markups?: ReactNode;
  toolChest?: ReactNode;
  signatures?: ReactNode;
};

export function Sidebar(props: SidebarProps) {
  const { onTab, pdfDocument, currentPage, onNavigate, onOpenUrl, changes, comments, markups, toolChest, signatures } = props;
  const panels: Partial<Record<SidebarTab, ReactNode>> = { changes, comments, markups, toolChest, signatures };
  const missing = props.tab in panels && !panels[props.tab];
  const tab = missing ? "thumbnails" : props.tab;
  return (
    <SidebarShell>
      <div className="sidebar-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "thumbnails"} onClick={() => onTab("thumbnails")}>
          Pages
        </button>
        <button type="button" role="tab" aria-selected={tab === "outline"} onClick={() => onTab("outline")}>
          Outline
        </button>
        {changes && (
          <button type="button" role="tab" aria-selected={tab === "changes"} onClick={() => onTab("changes")}>
            Changes
          </button>
        )}
        {comments && (
          <button type="button" role="tab" aria-selected={tab === "comments"} onClick={() => onTab("comments")}>
            Comments
          </button>
        )}
        {markups && (
          <button type="button" role="tab" aria-selected={tab === "markups"} onClick={() => onTab("markups")}>
            Markups
          </button>
        )}
        {toolChest && (
          <button type="button" role="tab" className="icon-tab" aria-selected={tab === "toolChest"} title="Tool Chest" aria-label="Tool Chest" onClick={() => onTab("toolChest")}>
            <Toolbox size={15} />
          </button>
        )}
        {signatures && (
          <button type="button" role="tab" aria-selected={tab === "signatures"} onClick={() => onTab("signatures")}>
            Signatures
          </button>
        )}
      </div>
      <div className="sidebar-content">
        {tab in panels ? (
          panels[tab]
        ) : tab === "thumbnails" ? (
          <Thumbnails
            pdfDocument={pdfDocument}
            paused={props.paused}
            restoreImages={props.restoreImages}
            currentPage={currentPage}
            pageLabels={props.pageLabels}
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
    </SidebarShell>
  );
}
