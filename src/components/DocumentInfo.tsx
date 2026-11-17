import { useEffect } from "react";
import { canSaveAttachments, useAttachments } from "../hooks/useAttachments";
import type { PdfViewerApi } from "../hooks/usePdfViewer";
import type { DocumentSource, PdfSource } from "../lib/platform";
import type { Protection } from "../lib/protection";
import { AttachmentsList } from "./AttachmentsList";
import { LayersList } from "./LayersList";
import { PropertiesPanel } from "./PropertiesPanel";
import "./DocumentInfo.css";

export function useDocumentInfo(viewer: PdfViewerApi, source: PdfSource, protection: Protection | undefined, onOpenSource: (source: DocumentSource) => void) {
  const { attachments, openAttachment, saveAttachment, openData } = useAttachments(viewer.pdfDocument, onOpenSource);
  const { setAttachmentOpener, layers, setLayerVisible, showAllLayers, resetLayers, goToPage } = viewer;

  useEffect(() => {
    setAttachmentOpener(openData);
    return () => setAttachmentOpener(null);
  }, [setAttachmentOpener, openData]);

  const infoPanel = viewer.pdfDocument && (
    <PropertiesPanel
      pdfDocument={viewer.pdfDocument}
      name={source.name}
      path={source.path}
      pageNumber={viewer.pageNumber}
      passwordToOpen={!!protection}
      hasForm={viewer.hasForm}
      attachments={attachments.length}
      layers={layers?.count ?? 0}
    />
  );

  const attachmentsPanel = attachments.length > 0 && (
    <AttachmentsList
      attachments={attachments}
      pageLabels={viewer.pageLabels}
      canSave={canSaveAttachments}
      onOpen={openAttachment}
      onSave={saveAttachment}
      onGoToPage={(pageIndex) => goToPage(pageIndex + 1, true)}
    />
  );

  const layersPanel = layers && <LayersList layers={layers} onToggle={setLayerVisible} onShowAll={showAllLayers} onReset={resetLayers} />;

  return {
    hasAttachments: attachments.length > 0,
    hasLayers: !!layers,
    previewLayers: layers,
    infoPanel,
    attachmentsPanel,
    layersPanel,
  };
}
