import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { OutlineTree } from "./OutlineTree";

type OutlineNode = Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>[number];

type OutlineProps = {
  pdfDocument: PDFDocumentProxy;
  onNavigate: (dest: unknown) => void;
  onOpenUrl: (url: string) => void;
};

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
    <OutlineTree
      nodes={outline}
      onActivate={(node) => {
        if (node.dest) {
          onNavigate(node.dest);
        } else if (node.url) {
          onOpenUrl(node.url);
        }
      }}
    />
  );
}
