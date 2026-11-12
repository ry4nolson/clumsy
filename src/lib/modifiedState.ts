import { MARKUP_KEY_PREFIX } from "./markup";
import { NOTE_KEY_PREFIX } from "./notes";

export type ModifiedStorage = Iterable<[string, unknown]> & {
  has(key: string): boolean;
  remove(key: string): void;
  resetModified(): void;
  onSetModified: (() => void) | null;
  onResetModified: (() => void) | null;
};

const owned = (key: string) => key.startsWith(NOTE_KEY_PREFIX) || key.startsWith(MARKUP_KEY_PREFIX);

export function trackModified(storage: ModifiedStorage, setModified: (modified: boolean) => void) {
  const saved = new Set<string>();
  const remove = storage.remove.bind(storage);
  const lostSavedEntry = () => [...saved].some((key) => !storage.has(key));
  Object.assign(storage, {
    onSetModified: () => setModified(true),
    onResetModified: () => setModified(lostSavedEntry()),
    remove: (key: string) => {
      remove(key);
      if (saved.has(key)) {
        setModified(true);
      }
    },
  });
  return () => {
    saved.clear();
    for (const [key] of storage) {
      if (owned(key)) {
        saved.add(key);
      }
    }
    storage.resetModified();
    setModified(false);
  };
}
