import { reviewStatuses, type ReviewStatus } from "./markupRows";
import { NOTE_SIZE, type StickyNote } from "./notes";

export type StateReply = { parent: string; state: string; time: number | null };

export { isStateReply, stateText, type AnnotationReplyData } from "./notes";

const asStatus = (state: string) => reviewStatuses.find((status) => status.toLowerCase() === state.toLowerCase()) ?? null;

export function latestStatuses(file: StateReply[], changes: StickyNote[]): Map<string, ReviewStatus> {
  const fresh = changes.filter((note) => note.fresh && !note.deleted && note.reply).map((note) => ({ parent: note.reply!.to, state: note.reply!.state, time: Infinity }));
  const latest = new Map<string, { status: ReviewStatus; time: number }>();
  for (const reply of [...file, ...fresh]) {
    const status = asStatus(reply.state);
    const time = reply.time ?? -Infinity;
    const current = latest.get(reply.parent);
    if (status && (!current || time >= current.time)) {
      latest.set(reply.parent, { status, time });
    }
  }
  return new Map([...latest].map(([parent, { status }]) => [parent, status]));
}

export function stateReplyNote(id: string, parent: { id: string; pageIndex: number; rect: number[] }, state: ReviewStatus, author: string, date: string): StickyNote {
  const [left, , , top] = parent.rect;
  return {
    id,
    pageIndex: parent.pageIndex,
    rect: [left, top - NOTE_SIZE, left + NOTE_SIZE, top],
    text: author ? `${state} set by ${author}` : state,
    color: null,
    date,
    fresh: true,
    deleted: false,
    author: author || null,
    reply: { to: parent.id, state },
  };
}
