import { useEffect, useMemo, useState } from "react";
import type { MarkupList } from "../lib/markupList";
import { emptyFilter, filterRows, groupRows, sortRows, type GroupBy, type MarkupRow, type RowFilter, type SortKey } from "../lib/markupRows";
import { usePersistentState } from "../lib/preferences";

type ListView = { group: GroupBy; sort: SortKey; descending: boolean };

const defaultView: ListView = { group: "subject", sort: "page", descending: false };

export function useMarkupRows(list: MarkupList | null, version: number, visible: boolean, pageLabels: string[] | null) {
  const [rows, setRows] = useState<MarkupRow[] | null>(null);
  const [filter, setFilter] = useState<RowFilter>(emptyFilter);
  const [view, setView] = usePersistentState<ListView>("clumsy.markupListView", defaultView);

  useEffect(() => {
    list?.watch(visible);
    return () => list?.watch(false);
  }, [list, visible]);

  useEffect(() => {
    if (!list || !visible) {
      return;
    }
    let current = true;
    list.collect(pageLabels).then((collected) => {
      if (current && collected) {
        setRows(collected);
      }
    });
    return () => {
      current = false;
    };
  }, [list, version, visible, pageLabels]);

  const shown = useMemo(() => (rows ? sortRows(filterRows(rows, filter), view.sort, view.descending) : null), [rows, filter, view.sort, view.descending]);
  const groups = useMemo(() => (shown ? groupRows(shown, view.group) : null), [shown, view.group]);

  useEffect(() => {
    if (!list || !shown) {
      return;
    }
    list.showing(() => shown);
    return () => list.showing(null);
  }, [list, shown]);

  return { rows, shown, groups, filter, setFilter, view, setView };
}
