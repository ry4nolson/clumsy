import { useCallback, useRef, useState, type RefObject } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { EventBus, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import { forgetPageCanvases } from "../lib/pageCanvases";
import { changedLayers, countLayers, layerIds, layerTree, restoreLayers, type LayerGroup, type LayerNode, type OrderItem, type SavedLayer } from "../lib/layers";

type LayerParts = { eventBus: EventBus; viewer: PDFViewer };

type ContentConfig = {
  getOrder(): OrderItem[] | null;
  getGroup(id: string): LayerGroup | null;
  getHash(): string;
  setVisibility(id: string, visible: boolean): void;
  [Symbol.iterator](): IterableIterator<[string, LayerGroup]>;
};

export type ViewerLayers = { nodes: LayerNode[]; count: number; hash: string; config: Promise<unknown> };

type Loaded = { doc: PDFDocumentProxy; config: ContentConfig; initial: Map<string, boolean>; controller: AbortController };

const visibilityOf = (config: ContentConfig) => new Map([...config].map(([id, group]) => [id, group.visible]));

export function useViewerLayers(partsRef: RefObject<LayerParts | null>) {
  const [layers, setLayers] = useState<ViewerLayers | null>(null);
  const loadedRef = useRef<Loaded | null>(null);

  const show = useCallback((config: ContentConfig) => {
    const nodes = layerTree(config.getOrder(), (id) => config.getGroup(id));
    const count = countLayers(nodes);
    const hash = config.getHash();
    setLayers((previous) => (!count ? null : previous?.hash === hash ? previous : { nodes, count, hash, config: Promise.resolve(config) }));
  }, []);

  const apply = useCallback((config: ContentConfig) => {
    const viewer = partsRef.current?.viewer;
    if (viewer?.pdfDocument && loadedRef.current) {
      loadedRef.current.config = config;
      forgetPageCanvases(viewer.pdfDocument);
      (viewer as unknown as { optionalContentConfigPromise: Promise<unknown> }).optionalContentConfigPromise = Promise.resolve(config);
    }
  }, [partsRef]);

  const loadLayers = useCallback(
    (doc: PDFDocumentProxy | null, saved?: SavedLayer[]) => {
      loadedRef.current?.controller.abort();
      loadedRef.current = null;
      setLayers(null);
      const parts = partsRef.current;
      if (!doc || !parts) {
        return;
      }
      const controller = new AbortController();
      const current = () => partsRef.current?.viewer.pdfDocument === doc && !controller.signal.aborted;
      parts.eventBus.on(
        "pagesinit",
        async () => {
          const config = (await parts.viewer.optionalContentConfigPromise) as unknown as ContentConfig | null;
          if (!config || !current()) {
            return;
          }
          loadedRef.current = { doc, config, initial: visibilityOf(config), controller };
          const restored = restoreLayers(saved, config);
          if (restored.length) {
            restored.forEach(([id, visible]) => config.setVisibility(id, visible));
            apply(config);
          }
          show(config);
        },
        { once: true, signal: controller.signal },
      );
      parts.eventBus.on(
        "optionalcontentconfigchanged",
        async ({ promise }: { promise: Promise<unknown> }) => {
          const config = (await promise) as ContentConfig;
          if (current() && loadedRef.current) {
            loadedRef.current.config = config;
            forgetPageCanvases(doc);
            show(config);
          }
        },
        { signal: controller.signal },
      );
    },
    [partsRef, apply, show],
  );

  const setLayerVisible = useCallback(
    (ids: string[], visible: boolean) => {
      const loaded = loadedRef.current;
      if (!loaded) {
        return;
      }
      ids.forEach((id) => loaded.config.setVisibility(id, visible));
      apply(loaded.config);
    },
    [apply],
  );

  const showAllLayers = useCallback(
    (visible: boolean) => {
      if (layers) {
        setLayerVisible(layerIds(layers.nodes), visible);
      }
    },
    [layers, setLayerVisible],
  );

  const resetLayers = useCallback(async () => {
    const loaded = loadedRef.current;
    if (!loaded) {
      return;
    }
    const fresh = (await loaded.doc.getOptionalContentConfig({ intent: "display" })) as unknown as ContentConfig;
    if (loadedRef.current === loaded) {
      apply(fresh);
    }
  }, [apply]);

  const savedLayers = useCallback(() => {
    const loaded = loadedRef.current;
    if (!loaded) {
      return undefined;
    }
    const changed = changedLayers(loaded.initial, loaded.config);
    return changed.length ? changed : undefined;
  }, []);

  return { layers, loadLayers, setLayerVisible, showAllLayers, resetLayers, savedLayers };
}
