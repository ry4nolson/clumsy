import type { CommandId } from "../lib/commands";
import { measurementRows, measurementsCsv, measurementsTsv } from "../lib/measurements";
import { downloadCsv } from "../lib/download";
import { copyPlainText, pickCsvSavePath, writeTextExport } from "../lib/measureFiles";
import { isDesktop, showError, showMessage } from "../lib/platform";
import type { PdfViewerApi } from "./usePdfViewer";

const baseName = (name: string) => name.replace(/\.pdf$/i, "");

export function useMeasurementExport(activeViewer: () => PdfViewerApi | undefined, documentName: () => string) {
  const rows = () => {
    const viewer = activeViewer();
    const list = viewer?.editorUi?.getState().measurements ?? [];
    return measurementRows(list, viewer?.pageLabels ?? null);
  };

  const copyMeasurements = async () => {
    const list = rows();
    if (!list.length) {
      await showMessage("This document has no measurements yet.", "Copy Measurements");
    } else if (!(await copyPlainText(measurementsTsv(list)))) {
      await showError("Clumsy couldn't copy the measurements.");
    }
  };

  const exportMeasurements = async () => {
    const list = rows();
    if (!list.length) {
      await showMessage("This document has no measurements yet.", "Export Measurements");
      return;
    }
    const name = `${baseName(documentName())} - measurements.csv`;
    const text = measurementsCsv(list);
    if (!isDesktop) {
      downloadCsv(name, text);
      return;
    }
    const path = await pickCsvSavePath(name);
    if (path) {
      await writeTextExport(path, text).catch((error) => showError(`Clumsy couldn't save the measurements. ${error}`));
    }
  };

  const runMeasurementCommand = (id: CommandId) => {
    if (id === "copyMeasurements") {
      void copyMeasurements();
    } else if (id === "exportMeasurements") {
      void exportMeasurements();
    } else {
      return false;
    }
    return true;
  };

  return { copyMeasurements, exportMeasurements, runMeasurementCommand };
}
