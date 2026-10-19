import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";

type OutlineNode = Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>[number];

type OutlineProps = {
  pdfDocument: PDFDocumentProxy;
  onNavigate: (dest: unknown) => void;
  onOpenUrl: (url: string) => void;
};

function OutlineItem({ node, depth, onNavigate, onOpenUrl }: { node: OutlineNode; depth: number } & Omit<OutlineProps, "pdfDocument">) {
  const [expanded, setExpanded] = useState(depth === 0 && node.items.length <= 12);
  const hasChildren = node.items.length > 0;

  const activate = () => {
    if (node.dest) {
      onNavigate(node.dest);
    } else if (node.url) {
      onOpenUrl(node.url);
    }
  };

  return (
    <li>
      <div className="outline-row" style={{ paddingLeft: depth * 14 }}>
        {hasChildren ? (
          <button
            type="button"
            className={`outline-toggle${expanded ? " expanded" : ""}`}
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            <ChevronRight size={14} />
          </button>
        ) : (
          <span className="outline-toggle" />
        )}
        <button
          type="button"
          className="outline-title"
          onClick={activate}
          style={{ fontWeight: node.bold ? 600 : undefined, fontStyle: node.italic ? "italic" : undefined }}
          title={node.title}
        >
          {node.title}
        </button>
      </div>
      {hasChildren && expanded && (
        <ul>
          {node.items.map((child, index) => (
            <OutlineItem key={index} node={child} depth={depth + 1} onNavigate={onNavigate} onOpenUrl={onOpenUrl} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function Outline({ pdfDocument, onNavigate, onOpenUrl }: OutlineProps) {
  const [outline, setOutline] = useState<OutlineNode[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOutline(null);
    pdfDocument.getOutline().then((nodes) => {
      if (!cancelled) {
        setOutline(nodes ?? []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pdfDocument]);

  if (!outline) {
    return null;
  }
  if (!outline.length) {
    return <p className="sidebar-empty">This document has no outline.</p>;
  }
  return (
    <ul className="outline">
      {outline.map((node, index) => (
        <OutlineItem key={index} node={node} depth={0} onNavigate={onNavigate} onOpenUrl={onOpenUrl} />
      ))}
    </ul>
  );
}
