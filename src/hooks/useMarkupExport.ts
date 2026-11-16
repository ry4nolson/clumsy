import type { CommandId } from "../lib/commands";
import { downloadCsv } from "../lib/download";
import { markupsCsv, markupsTsv, summaryCsv, summaryTsv, type MarkupRow } from "../lib/markupRows";
import { copyPlainText, pickCsvSavePath, writeTextExport } from "../lib/measureFiles";
import { isDesktop, showError, showMessage } from "../lib/platform";
import type { PdfViewerApi } from "./usePdfViewer";

const baseName = (name: string) => name.replace(/\.pdf$/i, "");

type Export = { title: string; suffix: string; csv: (rows: MarkupRow[]) => string; tsv: (rows: MarkupRow[]) => string };

const exports: Partial<Record<CommandId, Export & { copy: boolean }>> = {
  copyMarkups: { title: "Copy Markups", suffix: "markups", csv: markupsCsv, tsv: markupsTsv, copy: true },
  copyMarkupSummary: { title: "Copy Markup Summary", suffix: "summary", csv: summaryCsv, tsv: summaryTsv, copy: true },
  exportMarkups: { title: "Export Markups", suffix: "markups", csv: markupsCsv, tsv: markupsTsv, copy: false },
  exportMarkupSummary: { title: "Export Markup Summary", suffix: "summary", csv: summaryCsv, tsv: summaryTsv, copy: false },
};

export function useMarkupExport(activeViewer: () => PdfViewerApi | undefined, documentName: () => string) {
  const run = async ({ title, suffix, csv, tsv, copy }: Export & { copy: boolean }) => {
    const viewer = activeViewer();
    const rows = (await viewer?.editorUi?.markupList?.exportRows(viewer.pageLabels ?? null)) ?? [];
    if (!rows.length) {
      await showMessage("There's no markup to list. Add some, or clear the Markups tab's filters.", title);
      return;
    }
    if (copy) {
      if (!(await copyPlainText(tsv(rows)))) {
        await showError("Clumsy couldn't copy the markup list.");
      }
      return;
    }
    const name = `${baseName(documentName())} - ${suffix}.csv`;
    if (!isDesktop) {
      downloadCsv(name, csv(rows));
      return;
    }
    const path = await pickCsvSavePath(name);
    if (path) {
      await writeTextExport(path, csv(rows)).catch((error) => showError(`Clumsy couldn't save the markup list. ${error}`));
    }
  };

  const runExportCommand = (id: CommandId) => {
    const found = exports[id];
    if (found) {
      void run(found);
    }
    return !!found;
  };

  return { runExportCommand };
}
