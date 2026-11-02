import { X } from "lucide-react";
import type { EditorManagers, EditorUiState } from "../lib/editorManagers";
import { AltTextDialog } from "./AltTextDialog";
import { CommentDialog } from "./CommentDialog";
import { SignatureDescriptionDialog, SignatureDialog } from "./SignatureDialog";
import "./Editing.css";

type EditorSheetsProps = { editorUi: EditorManagers | null; state: EditorUiState };

export function EditorSheets({ editorUi, state }: EditorSheetsProps) {
  return (
    <>
      <AltTextDialog request={state.altText} onDone={(result) => editorUi?.finishAltText(result)} />
      <SignatureDialog request={state.signature} onDone={(result) => editorUi?.finishSignature(result)} />
      <SignatureDescriptionDialog request={state.description} onDone={(description) => editorUi?.finishDescription(description)} />
      <CommentDialog request={state.comment} dialogRef={(element) => editorUi?.setCommentDialog(element)} onDone={(text) => editorUi?.finishComment(text)} />
    </>
  );
}

export function EditorUndoBar({ editorUi, removed, onUndo }: { editorUi: EditorManagers | null; removed: string | null; onUndo: () => void }) {
  if (!removed || !editorUi) {
    return null;
  }
  return (
    <div className="editor-undo-bar" role="status">
      <span>{removed}</span>
      <button type="button" className="button small primary" onClick={onUndo}>
        Undo
      </button>
      <button type="button" className="icon-button" title="Close" aria-label="Close" onClick={editorUi.dismissRemoval}>
        <X size={14} />
      </button>
    </div>
  );
}
