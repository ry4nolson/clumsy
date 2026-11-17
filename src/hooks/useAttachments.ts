import { useCallback, useEffect, useState } from "react";
import { AnnotationType, type PDFDocumentProxy } from "pdfjs-dist";
import { saveAttachmentFile } from "../lib/attachmentFiles";
import { attachmentKind, listAttachments, pdfNameFor, safeFileName, type Attachment, type AttachmentAnnotation, type CatalogEntry } from "../lib/attachments";
import { isMobile, markdownSource, showError, type DocumentSource } from "../lib/platform";

const SCAN_DELAY = 1200;

export const canSaveAttachments = !isMobile;

export function useAttachments(doc: PDFDocumentProxy | null, onOpenSource: (source: DocumentSource) => void) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    setAttachments([]);
    if (!doc) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      Promise.all([
        doc.getAttachments().catch(() => null),
        doc.getAnnotationsByType(new Set([AnnotationType.FILEATTACHMENT]), new Set()).catch(() => []),
      ]).then(([catalog, annotations]) => {
        if (!cancelled) {
          setAttachments(listAttachments(catalog as Map<string, CatalogEntry> | null, annotations as AttachmentAnnotation[]));
        }
      });
    }, SCAN_DELAY);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [doc]);

  const save = useCallback(async (filename: string, bytes: Uint8Array) => {
    if (!canSaveAttachments) {
      return;
    }
    try {
      await saveAttachmentFile(safeFileName(filename), bytes);
    } catch (error) {
      await showError(`Could not save “${filename}”.\n\n${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);

  const openData = useCallback(
    (bytes: Uint8Array, filename: string) => {
      const kind = attachmentKind(filename, bytes);
      if (kind === "pdf") {
        onOpenSource({ name: pdfNameFor(safeFileName(filename)), path: null, data: bytes.slice() });
        return;
      }
      if (kind === "markdown") {
        try {
          onOpenSource(markdownSource(safeFileName(filename), null, bytes));
          return;
        } catch {
          void save(filename, bytes);
          return;
        }
      }
      void save(filename, bytes);
    },
    [onOpenSource, save],
  );

  const contentOf = useCallback(
    async (attachment: Attachment) => {
      const content = attachment.contentId && doc ? await doc.getAttachmentContent(attachment.contentId).catch(() => null) : null;
      if (!content) {
        await showError(`“${attachment.filename}” is empty or damaged, so it can't be opened.`);
      }
      return content;
    },
    [doc],
  );

  const openAttachment = useCallback(
    async (attachment: Attachment) => {
      const content = await contentOf(attachment);
      if (content) {
        openData(content, attachment.filename);
      }
    },
    [contentOf, openData],
  );

  const saveAttachment = useCallback(
    async (attachment: Attachment) => {
      const content = await contentOf(attachment);
      if (content) {
        await save(attachment.filename, content);
      }
    },
    [contentOf, save],
  );

  return { attachments, openAttachment, saveAttachment, openData };
}
