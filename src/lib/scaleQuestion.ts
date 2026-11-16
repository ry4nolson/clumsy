import { SET_SCALE_EVENT } from "./measure";
import type { MarkupStore } from "./markupStore";

type QuestionDeps = {
  store: MarkupStore;
  container: HTMLElement;
  measuring(): boolean;
  currentPage(): number;
  ask(): Promise<boolean>;
  cancel(): void;
};

export function createScaleQuestion({ store, container, measuring, currentPage, ask, cancel }: QuestionDeps) {
  let asked = false;

  const needed = (pageIndex: number) => measuring() && !asked && store.scalesReady() && !store.scaleOf(pageIndex);

  const put = async (pageIndex: number) => {
    asked = true;
    cancel();
    if (await ask()) {
      container.dispatchEvent(new CustomEvent(SET_SCALE_EVENT, { detail: { pages: [pageIndex] }, bubbles: true }));
    }
  };

  return {
    check() {
      const pageIndex = currentPage();
      void store.loadScales().then(() => {
        if (needed(pageIndex) && !store.isStale()) {
          void put(pageIndex);
        }
      });
    },
    blocks(pageIndex: number) {
      if (!store.scalesReady()) {
        return true;
      }
      if (!needed(pageIndex)) {
        return false;
      }
      void put(pageIndex);
      return true;
    },
  };
}
