import { useCallback, useEffect, useState, type RefObject } from "react";
import { FindState, type EventBus } from "pdfjs-dist/web/pdf_viewer.mjs";
import { compileFindPattern } from "../lib/findPattern";
import type { PatternFindController } from "../lib/patternFindController";

export type FindStatus = {
  state: "idle" | "found" | "notFound" | "pending" | "wrapped";
  current: number;
  total: number;
};

export type FindMatches = { positions: number[][]; lengths: number[][]; selected: { pageIdx: number; matchIdx: number } };

export type FindQuery = {
  query: string;
  caseSensitive: boolean;
  entireWord: boolean;
  matchDiacritics: boolean;
  regex: boolean;
};

export type FindType = "" | "again" | "casesensitivitychange" | "entirewordchange" | "diacriticmatchingchange";

const findStates: Record<number, FindStatus["state"]> = {
  [FindState.FOUND]: "found",
  [FindState.NOT_FOUND]: "notFound",
  [FindState.PENDING]: "pending",
  [FindState.WRAPPED]: "wrapped",
};

const idle: FindStatus = { state: "idle", current: 0, total: 0 };

type FindParts = { eventBus: EventBus; findController: PatternFindController };

export function useViewerFind(partsRef: RefObject<FindParts | null>) {
  const [findStatus, setFindStatus] = useState<FindStatus>(idle);

  useEffect(() => {
    const eventBus = partsRef.current?.eventBus;
    if (!eventBus) {
      return;
    }
    const onFindUpdate = ({ state, matchesCount }: { state?: number; matchesCount: { current: number; total: number } }) => {
      setFindStatus((previous) => ({
        state: state === undefined ? previous.state : (findStates[state] ?? "idle"),
        current: matchesCount.current,
        total: matchesCount.total,
      }));
    };
    eventBus.on("updatefindcontrolstate", onFindUpdate);
    eventBus.on("updatefindmatchescount", onFindUpdate);
    return () => {
      eventBus.off("updatefindcontrolstate", onFindUpdate);
      eventBus.off("updatefindmatchescount", onFindUpdate);
    };
  }, [partsRef]);

  const find = useCallback(
    (query: FindQuery, type: FindType, findPrevious = false) => {
      const parts = partsRef.current;
      if (!parts) {
        return;
      }
      const pattern = query.regex ? compileFindPattern(query.query, query.caseSensitive, query.matchDiacritics) : null;
      if (query.regex && query.query && !pattern) {
        parts.eventBus.dispatch("findbarclose", { source: null });
        return;
      }
      parts.findController.pattern = pattern;
      parts.findController.patternEntireWord = query.entireWord;
      parts.findController.patternMatchDiacritics = query.matchDiacritics;
      parts.eventBus.dispatch("find", {
        source: null,
        type,
        query: query.query,
        caseSensitive: query.caseSensitive,
        entireWord: query.entireWord,
        highlightAll: true,
        findPrevious,
        matchDiacritics: query.matchDiacritics,
      });
    },
    [partsRef],
  );

  const findMatches = useCallback((): FindMatches | null => {
    const controller = partsRef.current?.findController;
    if (!controller?.highlightMatches || !controller.pageMatches) {
      return null;
    }
    return { positions: controller.pageMatches, lengths: controller.pageMatchesLength ?? [], selected: controller.selected ?? { pageIdx: -1, matchIdx: -1 } };
  }, [partsRef]);

  const closeFind = useCallback(() => {
    partsRef.current?.eventBus.dispatch("findbarclose", { source: null });
    setFindStatus(idle);
  }, [partsRef]);

  const resetFind = useCallback(() => setFindStatus(idle), []);

  return { findStatus, find, findMatches, closeFind, resetFind };
}
