import { diffByPage, type DiffRequest } from "../lib/textDiff";

self.onmessage = (event: MessageEvent<DiffRequest>) => {
  self.postMessage(diffByPage(event.data));
};
