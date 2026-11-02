import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { placeCommentDialog } from "../lib/comments";
import type { CommentRequest } from "../lib/commentManager";

type CommentDialogProps = {
  request: CommentRequest | null;
  dialogRef: (element: HTMLDialogElement | null) => void;
  onDone: (text: string | null) => void;
};

export function CommentDialog({ request, dialogRef, onDone }: CommentDialogProps) {
  const elementRef = useRef<HTMLDialogElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [text, setText] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    const dialog = elementRef.current;
    if (request && dialog && !dialog.open) {
      setText(request.text);
      dialog.showModal();
      const { width, height } = dialog.getBoundingClientRect();
      setPosition(placeCommentDialog(request, width, height, { width: innerWidth, height: innerHeight }));
    } else if (!request && dialog?.open) {
      dialog.close();
    }
  }, [request]);

  useEffect(() => {
    if (request) {
      inputRef.current?.focus();
    }
  }, [request]);

  const startDrag = (event: PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX - position.x, y: event.clientY - position.y };
  };

  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    if (drag.current) {
      setPosition({ x: event.clientX - drag.current.x, y: event.clientY - drag.current.y });
    }
  };

  const editing = !!request?.text;
  return (
    <dialog
      ref={(element) => {
        elementRef.current = element;
        dialogRef(element);
      }}
      className="dialog comment-dialog"
      style={{ left: position.x, top: position.y, ...(request?.color && { background: request.color }) }}
      onCancel={(event) => {
        event.preventDefault();
        onDone(null);
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onDone(text);
        }}
      >
        <h2 className="comment-dialog-title" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => (drag.current = null)}>
          {editing ? "Edit Comment" : "Add Comment"}
        </h2>
        <textarea
          ref={inputRef}
          className="text-input comment-input"
          value={text}
          placeholder="Start typing…"
          style={request?.height ? { height: request.height } : undefined}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && text !== request?.text) {
              event.preventDefault();
              onDone(text);
            }
          }}
        />
        <div className="dialog-actions">
          <span className="spacer" />
          <button type="button" className="button" onClick={() => onDone(null)}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={text === request?.text}>
            {editing ? "Update" : "Add"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
