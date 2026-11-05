import { answerPageEditJob } from "../lib/pageEdits";
import type { PageEditJob } from "../lib/pageEditMessages";

self.onmessage = async (event: MessageEvent<PageEditJob>) => {
  const [response, transfer] = await answerPageEditJob(event.data);
  (self as unknown as Worker).postMessage(response, transfer);
};
