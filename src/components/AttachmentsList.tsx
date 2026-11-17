import { Download, FileText, Paperclip } from "lucide-react";
import { attachmentKind, type Attachment } from "../lib/attachments";

type AttachmentsListProps = {
  attachments: Attachment[];
  pageLabels: string[] | null;
  canSave: boolean;
  onOpen: (attachment: Attachment) => void;
  onSave: (attachment: Attachment) => void;
  onGoToPage: (pageIndex: number) => void;
};

export function AttachmentsList({ attachments, pageLabels, canSave, onOpen, onSave, onGoToPage }: AttachmentsListProps) {
  if (!attachments.length) {
    return <p className="sidebar-empty">This document has no attachments.</p>;
  }
  return (
    <ol className="changes attachments">
      {attachments.map((attachment) => {
        const opens = attachmentKind(attachment.filename) !== "other";
        const action = opens ? `Open ${attachment.filename} in a new tab` : `Save ${attachment.filename}`;
        return (
          <li key={attachment.key} className="attachment-item">
            <button
              type="button"
              className="change-row attachment-row"
              title={attachment.description || action}
              onClick={() => attachment.page !== null && onGoToPage(attachment.page)}
              onDoubleClick={() => (opens || canSave) && onOpen(attachment)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (opens || canSave)) {
                  event.preventDefault();
                  onOpen(attachment);
                }
              }}
            >
              <span className="attachment-name">
                {opens ? <FileText size={14} aria-hidden="true" /> : <Paperclip size={14} aria-hidden="true" />}
                <span>{attachment.filename}</span>
              </span>
              {(attachment.description || attachment.page !== null) && (
                <span className="change-meta">
                  {attachment.description && <span className="attachment-description">{attachment.description}</span>}
                  {attachment.page !== null && <span className="change-page">Page {pageLabels?.[attachment.page] ?? attachment.page + 1}</span>}
                </span>
              )}
            </button>
            <span className="attachment-actions">
              {opens && (
                <button type="button" className="attachment-action" onClick={() => onOpen(attachment)}>
                  Open
                </button>
              )}
              {canSave && (
                <button type="button" className="attachment-action icon" title={`Save ${attachment.filename}…`} aria-label={`Save ${attachment.filename}…`} onClick={() => onSave(attachment)}>
                  <Download size={14} />
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
