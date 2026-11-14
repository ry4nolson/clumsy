import { answerPageEditJob } from "../lib/pageEdits";
import type { PageEditJob, PageEditResponse } from "../lib/pageEditMessages";

self.onmessage = async (event: MessageEvent<PageEditJob>) => {
  const post = (response: PageEditResponse, transfer: ArrayBuffer[] = []) => (self as unknown as Worker).postMessage(response, transfer);
  post(...(await answerPageEditJob(event.data, (progress) => post({ progress }))));
};
