import { useCallback, useRef, useState } from "react";
import type { CommandId } from "../lib/commands";
import { compressLevel, worthApplying, type CompressLevelId, type CompressProgress } from "../lib/compressPlan";
import { WorkerStoppedError, compressPdfOffThread } from "../lib/pageEditWorker";
import { usePersistentState } from "../lib/preferences";
import * as ws from "../lib/workspace";
import type { CapturedVersion, PageEditsApi } from "./usePageEdits";
import type { WorkspaceApi } from "./useWorkspace";

export type CompressStatus =
  | { kind: "working"; progress: CompressProgress | null }
  | { kind: "ready"; before: number; after: number }
  | { kind: "small"; before: number }
  | { kind: "failed"; message: string };

export type CompressRequest = { tabId: string; name: string };

type Run = { tabId: string; controller: AbortController; captured: CapturedVersion | null; bytes: Uint8Array | null };

const SIGNATURE_ACTION = "Compressing this PDF";

export function useCompress({ workspaceRef }: WorkspaceApi, { capture, replaceCaptured }: Pick<PageEditsApi, "capture" | "replaceCaptured">) {
  const [stored, setStored] = usePersistentState<unknown>("clumsy.compressLevel", null);
  const [request, setRequest] = useState<CompressRequest | null>(null);
  const [status, setStatus] = useState<CompressStatus>({ kind: "working", progress: null });
  const run = useRef<Run | null>(null);
  const level = compressLevel(stored);

  const start = async (tabId: string, id: CompressLevelId, captured: CapturedVersion | null) => {
    run.current?.controller.abort();
    const current: Run = { tabId, controller: new AbortController(), captured, bytes: null };
    run.current = current;
    setStatus({ kind: "working", progress: null });
    try {
      current.captured ??= await capture(tabId);
      if (run.current !== current) {
        return;
      }
      if (!current.captured) {
        setStatus({ kind: "failed", message: "This PDF isn't ready yet. Try again in a moment." });
        return;
      }
      const { version } = current.captured;
      const bytes = await compressPdfOffThread(version.bytes.slice(), compressLevel(id), version.protection?.password, {
        signal: current.controller.signal,
        onProgress: (progress) => run.current === current && setStatus({ kind: "working", progress }),
      });
      if (run.current !== current) {
        return;
      }
      const before = version.bytes.byteLength;
      current.bytes = worthApplying(before, bytes.byteLength) ? bytes : null;
      setStatus(current.bytes ? { kind: "ready", before, after: bytes.byteLength } : { kind: "small", before });
    } catch (error) {
      if (run.current === current && !(error instanceof WorkerStoppedError)) {
        setStatus({ kind: "failed", message: error instanceof Error ? error.message : String(error) });
      }
    }
  };

  const close = () => {
    run.current?.controller.abort();
    run.current = null;
    setRequest(null);
  };

  const runCompressCommand = useCallback((id: CommandId) => {
    if (id !== "compressPdf") {
      return false;
    }
    const tab = ws.focusedTab(workspaceRef.current);
    if (tab.kind === "document" && !run.current) {
      setRequest({ tabId: tab.id, name: tab.name });
      start(tab.id, compressLevel(stored).id, null);
    }
    return true;
  }, [stored]);

  const apply = async () => {
    const current = run.current;
    close();
    if (current?.captured && current.bytes) {
      await replaceCaptured(current.tabId, current.captured, current.bytes, SIGNATURE_ACTION);
    }
  };

  return {
    runCompressCommand,
    dialog: {
      request,
      status,
      level: level.id,
      onLevel: (id: CompressLevelId) => {
        setStored(id);
        if (run.current) {
          start(run.current.tabId, id, run.current.captured);
        }
      },
      onCompress: apply,
      onClose: close,
    },
  };
}
