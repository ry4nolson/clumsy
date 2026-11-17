export type Attachment = {
  key: string;
  contentId: string | null;
  filename: string;
  description: string;
  page: number | null;
};

export type CatalogEntry = { filename?: unknown; description?: unknown };

export type AttachmentAnnotation = { id?: unknown; pageIndex?: unknown; fileId?: unknown; file?: CatalogEntry | null };

const text = (value: unknown) => (typeof value === "string" ? value : "");

export function safeFileName(name: string) {
  const last = name.split(/[\\/]/).pop() ?? "";
  const cleaned = last.replace(/[\u0000-\u001f\u007f<>:"|?*]+/g, "").trim();
  return cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : "attachment";
}

export function listAttachments(catalog: Map<string, CatalogEntry> | null, annotations: AttachmentAnnotation[]): Attachment[] {
  const named = [...(catalog ?? [])].map(([id, entry]) => ({
    key: `name:${id}`,
    contentId: id,
    filename: safeFileName(text(entry.filename) || id),
    description: text(entry.description).trim(),
    page: null,
  }));
  const onPages = annotations
    .filter((annotation) => annotation.file)
    .map((annotation, index) => ({
      key: `annotation:${text(annotation.id) || index}`,
      contentId: text(annotation.fileId) || null,
      filename: safeFileName(text(annotation.file?.filename)),
      description: text(annotation.file?.description).trim(),
      page: typeof annotation.pageIndex === "number" ? annotation.pageIndex : null,
    }))
    .sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
  const byName = (a: Attachment, b: Attachment) => a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: "base" });
  return [...named.sort(byName), ...onPages];
}

export type AttachmentKind = "pdf" | "markdown" | "other";

export function attachmentKind(filename: string, content?: Uint8Array): AttachmentKind {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return "markdown";
  }
  if (lower.endsWith(".pdf")) {
    return "pdf";
  }
  return content && startsWithPdfHeader(content) ? "pdf" : "other";
}

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d];
const HEADER_WINDOW = 1024;

function startsWithPdfHeader(bytes: Uint8Array) {
  const end = Math.min(bytes.length - PDF_HEADER.length, HEADER_WINDOW);
  for (let at = 0; at <= end; at += 1) {
    if (PDF_HEADER.every((byte, offset) => bytes[at + offset] === byte)) {
      return true;
    }
  }
  return false;
}

export function pdfNameFor(filename: string) {
  return /\.pdf$/i.test(filename) ? filename : `${filename}.pdf`;
}
