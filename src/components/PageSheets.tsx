import { useEffect, useRef, useState } from "react";
import type { CalibrationPick } from "../lib/calibrationPick";
import { defaultFormat, lengthOf } from "../lib/measure";
import type { PageAction } from "./DocumentTab";
import { PageLabelsDialog, type PageLabelsRequest } from "./PageLabelsDialog";
import { PasswordSetDialog } from "./PasswordSetDialog";
import { ScaleDialog, type ScaleRequest } from "./ScaleDialog";

export function usePageSheets(act: (action: PageAction) => void, pickLine: () => CalibrationPick | null) {
  const [labels, setLabels] = useState<PageLabelsRequest | null>(null);
  const [password, setPassword] = useState<{ changing: boolean } | null>(null);
  const [scale, setScale] = useState<ScaleRequest | null>(null);
  const pick = useRef<CalibrationPick | null>(null);

  useEffect(() => () => pick.current?.cancel(), []);

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
          act({ kind: "scale", pages, scale: next?.scale ?? null, format: next?.format ?? defaultFormat });
        }}
        onCalibrate={(draft) => {
          const current = scale;
          const started = current && pickLine();
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
