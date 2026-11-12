import { describe, expect, it } from "vitest";
import { MARKUP_KEY_PREFIX } from "../src/lib/markup";
import { trackModified, type ModifiedStorage } from "../src/lib/modifiedState";
import { NOTE_KEY_PREFIX } from "../src/lib/notes";

function fakeStorage() {
  const entries = new Map<string, unknown>();
  let modified = false;
  const storage: ModifiedStorage & { setValue(key: string, value: unknown): void } = {
    onSetModified: null,
    onResetModified: null,
    [Symbol.iterator]: () => entries[Symbol.iterator](),
    has: (key) => entries.has(key),
    setValue(key, value) {
      entries.set(key, value);
      if (!modified) {
        modified = true;
        storage.onSetModified?.();
      }
    },
    remove(key) {
      entries.delete(key);
      if (!entries.size) {
        storage.resetModified();
      }
    },
    resetModified() {
      if (modified) {
        modified = false;
        storage.onResetModified?.();
      }
    },
  };
  return storage;
}

function tracked() {
  const storage = fakeStorage();
  const state = { modified: false };
  const markSaved = trackModified(storage, (modified) => (state.modified = modified));
  return { storage, state, markSaved };
}

describe("trackModified", () => {
  it("reads as modified after a change and clean after a save", () => {
    const { storage, state, markSaved } = tracked();
    storage.setValue(`${NOTE_KEY_PREFIX}a`, {});
    expect(state.modified).toBe(true);
    markSaved();
    expect(state.modified).toBe(false);
  });

  it("goes back to clean when an unsaved entry is undone", () => {
    const { storage, state } = tracked();
    storage.setValue(`${MARKUP_KEY_PREFIX}a`, {});
    storage.remove(`${MARKUP_KEY_PREFIX}a`);
    expect(state.modified).toBe(false);
  });

  it("reads as modified when a saved note or markup is removed", () => {
    for (const key of [`${NOTE_KEY_PREFIX}a`, `${MARKUP_KEY_PREFIX}a`]) {
      const { storage, state, markSaved } = tracked();
      storage.setValue(key, {});
      markSaved();
      storage.remove(key);
      expect(state.modified).toBe(true);
    }
  });

  it("stays modified when a later unsaved change is undone after a saved entry was removed", () => {
    const { storage, state, markSaved } = tracked();
    storage.setValue(`${NOTE_KEY_PREFIX}a`, {});
    markSaved();
    storage.remove(`${NOTE_KEY_PREFIX}a`);
    storage.setValue(`${NOTE_KEY_PREFIX}b`, {});
    storage.remove(`${NOTE_KEY_PREFIX}b`);
    expect(state.modified).toBe(true);
    markSaved();
    expect(state.modified).toBe(false);
  });

  it("ignores entries Clumsy doesn't own", () => {
    const { storage, state, markSaved } = tracked();
    storage.setValue("pdfjs_internal_editor_1", {});
    markSaved();
    storage.remove("pdfjs_internal_editor_1");
    expect(state.modified).toBe(false);
  });
});
