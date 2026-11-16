import { useEffect, useRef, useState } from "react";
import type { CalibrationPick } from "../lib/calibrationPick";
import type { MarkupTool } from "../lib/markupLayer";
import { defaultFormat, lengthOf } from "../lib/measure";
import type { PageAction } from "./DocumentTab";
import { PageLabelsDialog, type PageLabelsRequest } from "./PageLabelsDialog";
import { PasswordSetDialog } from "./PasswordSetDialog";
import { ScaleDialog, type ScaleRequest } from "./ScaleDialog";

type SheetViewer = { pickLine(): CalibrationPick | null; markupTool: MarkupTool; setMarkupTool(tool: NonNullable<MarkupTool>): Promise<void>; pdfDocument: unknown };

export function usePageSheets(act: (action: PageAction) => void, viewer: SheetViewer) {
  const [labels, setLabels] = useState<PageLabelsRequest | null>(null);
  const [password, setPassword] = useState<{ changing: boolean } | null>(null);
  const [scale, setScale] = useState<ScaleRequest | null>(null);
  const pick = useRef<CalibrationPick | null>(null);
  const resume = useRef<{ tool: NonNullable<MarkupTool>; from: unknown } | null>(null);
  const { pdfDocument, markupTool, setMarkupTool } = viewer;

  useEffect(() => () => pick.current?.cancel(), []);

  useEffect(() => {
    const pending = resume.current;
    if (!pending) {
      return;
    }
    if (pdfDocument && pdfDocument !== pending.from) {
      resume.current = null;
      void setMarkupTool(pending.tool);
    } else if (markupTool?.kind !== "measure") {
      resume.current = null;
    }
  }, [pdfDocument, markupTool, setMarkupTool]);

  const sheets = (
    <>
      <PageLabelsDialog
        request={labels}
        onApply={(from, to, numbering) => {
          setLabels(null);
          act({ kind: "label", from, to, numbering });
        }}
        onClose={() => setLabels(null)}
      />
      <PasswordSetDialog
        request={password}
        onSet={(value) => {
          setPassword(null);
          act({ kind: "protect", password: value });
        }}
        onClose={() => setPassword(null)}
      />
      <ScaleDialog
        request={scale}
        onApply={(pages, next) => {
          setScale(null);
          resume.current = viewer.markupTool?.kind === "measure" ? { tool: viewer.markupTool, from: pdfDocument } : null;
          act({ kind: "scale", pages, scale: next?.scale ?? null, format: next?.format ?? defaultFormat });
        }}
        onCalibrate={(draft) => {
          const current = scale;
          const started = current && viewer.pickLine();
          if (!current || !started) {
            return;
          }
          pick.current = started;
          setScale(null);
          started.result.then((picked) => {
            pick.current = null;
            setScale({ ...current, calibration: picked ? { ...draft, points: lengthOf(picked.line) } : current.calibration });
          });
        }}
        onClose={() => setScale(null)}
      />
    </>
  );

  return { editLabels: setLabels, editPassword: setPassword, editScale: setScale, sheets };
}
