import { useCallback, useEffect, useRef, type RefObject } from "react";
import { imageTypeOf } from "../lib/imageFiles";
import { localImagePath } from "../lib/markdownLinks";
import { readLinkedImage } from "../lib/platform";

export function useLinkedImages(path: RefObject<string | null>) {
  const images = useRef(new Map<string, Promise<string | null>>());

  useEffect(() => {
    const loaded = images.current;
    return () => loaded.forEach((url) => url.then((value) => value && URL.revokeObjectURL(value)));
  }, []);

  return useCallback(
    (root: HTMLElement) => {
      const document = path.current;
      const loading = [...root.querySelectorAll<HTMLImageElement>("img[data-local-src]")].map((image) => {
        const src = image.dataset.localSrc!;
        const fallback = () => {
          const missing = window.document.createElement("span");
          missing.className = "missing-image";
          missing.textContent = image.alt || src;
          image.replaceWith(missing);
        };
        if (!document) {
          fallback();
          return Promise.resolve();
        }
        const key = `${document}\n${src}`;
        let url = images.current.get(key);
        if (!url) {
          const file = localImagePath(src);
          url = readLinkedImage(document, file)
            .then((bytes) => URL.createObjectURL(new Blob([bytes as BlobPart], { type: imageTypeOf(file) })))
            .catch(() => null);
          images.current.set(key, url);
        }
        return url.then((value) => (value ? (image.src = value) : fallback()));
      });
      return Promise.all(loading);
    },
    [path],
  );
}
