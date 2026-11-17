import type { PDFDocumentProxy } from "pdfjs-dist";
import type { ViewStart } from "../hooks/usePdfViewer";
import type { ViewState } from "./documentWindows";
import { getRecentFiles } from "./platform";
import { documentView, type DocumentSidebar, type ViewModes } from "./viewModes";

type StartWithSidebar = ViewStart & { sidebar?: DocumentSidebar };

export async function viewStart(doc: PDFDocumentProxy, path: string | null, view: ViewState | undefined, modes: ViewModes): Promise<StartWithSidebar> {
  if (view) {
    return { view, modes };
  }
  const recent = path ? await getRecentFiles().catch(() => null) : null;
  if (recent?.some((entry) => entry.path === path)) {
    return { modes };
  }
  const [pageMode, pageLayout, openAction] = await Promise.all([
    doc.getPageMode().catch(() => null),
    doc.getPageLayout().catch(() => null),
    doc.getOpenAction().catch(() => null),
  ]);
  const { sidebar, ...documentModes } = documentView(pageMode, pageLayout);
  const dest: unknown = openAction?.get("dest");
  const destination = Array.isArray(dest) ? dest : null;
  return { modes: { ...modes, ...documentModes }, destination, sidebar };
}
