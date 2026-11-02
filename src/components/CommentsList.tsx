import { useEffect, useRef } from "react";
import type { CommentEntry } from "../lib/comments";

type CommentsListProps = {
  comments: CommentEntry[];
  selected: string | null;
  pageLabels: string[] | null;
  onSelect: (comment: CommentEntry) => void;
};

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function CommentsList({ comments, selected, pageLabels, onSelect }: CommentsListProps) {
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!comments.length) {
    return <p className="sidebar-empty">No comments yet. Click anywhere on a page to add one, or select a markup and click Comment.</p>;
  }
  return (
    <ol className="changes comments" ref={listRef}>
      {comments.map((comment) => (
        <li key={comment.id}>
          <button
            type="button"
            className="change-row comment-row"
            aria-current={comment.id === selected || undefined}
            style={comment.color ? { background: comment.color } : undefined}
            onClick={() => onSelect(comment)}
          >
            <span className="change-meta">
              {comment.time !== null && <time dateTime={new Date(comment.time).toISOString()}>{dateFormat.format(comment.time)}</time>}
              <span className="change-page">Page {pageLabels?.[comment.pageIndex] ?? comment.pageIndex + 1}</span>
            </span>
            <span className="comment-text">{comment.text}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
