import { useState } from "react";
import { defaultFormat } from "../lib/measure";
import type { PageAction } from "./DocumentTab";
import { PageLabelsDialog, type PageLabelsRequest } from "./PageLabelsDialog";
import { PasswordSetDialog } from "./PasswordSetDialog";
import { ScaleDialog, type ScaleRequest } from "./ScaleDialog";

export function usePageSheets(act: (action: PageAction) => void) {
  const [labels, setLabels] = useState<PageLabelsRequest | null>(null);
  const [password, setPassword] = useState<{ changing: boolean } | null>(null);
  const [scale, setScale] = useState<ScaleRequest | null>(null);

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
        onClose={() => setScale(null)}
      />
    </>
  );

  return { editLabels: setLabels, editPassword: setPassword, editScale: setScale, sheets };
}
