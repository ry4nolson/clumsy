import { useCallback, useEffect, useState } from "react";
import { imageStampFrom } from "../lib/customStampImage";
import { CUSTOM_STAMPS_KEY, readLibrary, refusalMessage, renamedStamp, setLibrary, withoutStamp, writeLibrary, type CustomStamp } from "../lib/customStamps";
import { confirmDeleteStamp, pickImage } from "../lib/imageFiles";
import { showError } from "../lib/platform";

function loadLibrary() {
  const list = readLibrary();
  setLibrary(list);
  return list;
}

export function useCustomStamps() {
  const [stamps, setStamps] = useState(loadLibrary);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => (event.key === CUSTOM_STAMPS_KEY || event.key === null) && setStamps(loadLibrary());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const save = useCallback((next: CustomStamp[]) => {
    const problem = writeLibrary(next);
    if (problem) {
      void showError(refusalMessage(problem), "Couldn't save the stamp");
      return false;
    }
    setLibrary(next);
    setStamps(next);
    return true;
  }, []);

  const add = useCallback((stamp: CustomStamp) => (save([...readLibrary(), stamp]) ? stamp : null), [save]);

  const addImage = useCallback(async () => {
    const file = await pickImage();
    if (!file) {
      return null;
    }
    try {
      return add(await imageStampFrom(file));
    } catch (error) {
      void showError(error instanceof Error ? error.message : String(error), "Couldn't add the stamp");
      return null;
    }
  }, [add]);

  const rename = useCallback((id: string, name: string) => save(renamedStamp(readLibrary(), id, name)), [save]);

  const remove = useCallback(
    async (stamp: CustomStamp) => {
      if (await confirmDeleteStamp(stamp.name)) {
        save(withoutStamp(readLibrary(), stamp.id));
      }
    },
    [save],
  );

  return { stamps, add, addImage, rename, remove };
}

export type CustomStampsApi = ReturnType<typeof useCustomStamps>;
