import { QuickJSSandbox } from "pdfjs-dist/build/pdf.sandbox.mjs";
import { QUESTIONS_PER_EVENT, questionUrl, type SandboxUpdate, type ScriptingReply, type ScriptingRequest } from "../lib/scriptEvents";

const scope = self as unknown as { window?: unknown; postMessage(reply: ScriptingReply): void };
const reply = (message: ScriptingReply) => scope.postMessage(message);

let askUrl: string | null = null;
let questionsLeft = 0;

const fromTimer = (run: () => void) => () => {
  questionsLeft = 0;
  run();
};

function ask(message: string) {
  if (!askUrl || questionsLeft <= 0) {
    return false;
  }
  questionsLeft -= 1;
  reply({ type: "asking" });
  try {
    const request = new XMLHttpRequest();
    request.open("GET", questionUrl(askUrl, message), false);
    request.send();
    return request.status === 200 && request.responseText === "yes";
  } catch {
    return false;
  } finally {
    reply({ type: "asked" });
  }
}

scope.window = {
  setTimeout: (run: () => void, delay: number) => setTimeout(fromTimer(run), delay),
  clearTimeout: (id: number) => clearTimeout(id),
  setInterval: (run: () => void, delay: number) => setInterval(fromTimer(run), delay),
  clearInterval: (id: number) => clearInterval(id),
  alert: (message: string) => reply({ type: "alert", message }),
  confirm: (message: string) => ask(message),
  prompt: () => null,
  URL,
  CustomEvent: class {
    detail: unknown;
    constructor(_type: string, init: { detail: unknown }) {
      this.detail = init.detail;
    }
  },
  dispatchEvent: (event: { detail: SandboxUpdate }) => reply({ type: "update", detail: event.detail }),
  console,
};

let sandbox: Awaited<ReturnType<typeof QuickJSSandbox>> | null = null;

async function answer(data: Exclude<ScriptingRequest, { op: "ping" }>) {
  if (data.op === "event") {
    questionsLeft = QUESTIONS_PER_EVENT;
    sandbox?.dispatchEvent(data.event);
    if (data.ack !== undefined) {
      reply({ type: "done", ack: data.ack });
    }
    return;
  }
  try {
    askUrl = data.askUrl;
    sandbox = await QuickJSSandbox(data.wasmUrl);
    sandbox.create(data.data);
    reply({ type: "ready" });
  } catch (error) {
    reply({ type: "failed", message: String(error) });
  }
}

let queue = Promise.resolve();

self.onmessage = ({ data }: MessageEvent<ScriptingRequest>) => {
  if (data.op === "ping") {
    reply({ type: "pong" });
  } else {
    queue = queue.then(() => answer(data));
  }
};
