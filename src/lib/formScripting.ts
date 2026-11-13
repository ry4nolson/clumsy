import type { PDFDocumentProxy } from "pdfjs-dist";
import { RenderingStates, type EventBus, type PDFScriptingManager, type PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import { readFields, type FieldEntry } from "./formFields";
import { assetsUrl } from "./pdfjs";
import { isDesktop } from "./platform";
import {
  ACTION_TIMEOUT_MS,
  PING_INTERVAL_MS,
  SCRIPT_COMMAND_EVENT,
  alertText,
  commitEvent,
  passThrough,
  scriptRequest,
  stoppedAnswering,
  updateTargets,
  viewCommand,
  type DocumentAction,
  type SandboxEvent,
  type SandboxUpdate,
  type ScriptingReply,
  type ScriptingRequest,
  type ViewCommand,
} from "./scriptEvents";

type Hooks = { alert(message: string): Promise<unknown>; stopped(): void };

type ModifiedStorage = {
  onSetModified: (() => void) | null;
  resetModified(): void;
  setValue(id: string, value: object): void;
  getRawValue(id: string): FieldEntry | undefined;
};

type FieldObjects = Parameters<typeof readFields>[0];

const SCRIPTS_KEY = "clumsy.formScripts";
const askUrl = !isDesktop ? null : navigator.userAgent.includes("Windows") ? "http://formask.localhost/" : "formask://localhost/";
const live = new Set<(enabled: boolean) => void>();

function scriptsEnabled() {
  try {
    return localStorage.getItem(SCRIPTS_KEY) !== "false";
  } catch {
    return true;
  }
}

export const applyFormScripts = (enabled: boolean) => live.forEach((apply) => apply(enabled));

type Session = {
  doc: PDFDocumentProxy;
  worker: Worker;
  listeners: AbortController;
  ready: boolean;
  asking: boolean;
  missedPings: number;
  acks: Map<number, () => void>;
  watchdog: number;
  pages: Map<number, Promise<void> | null>;
  waitingPages: Set<number>;
};

const spawn = () => new Worker(new URL("../workers/scripting.worker.ts", import.meta.url), { type: "module" });

async function documentInfo(doc: PDFDocumentProxy) {
  const { info, metadata, contentLength } = (await doc.getMetadata()) as Awaited<ReturnType<PDFDocumentProxy["getMetadata"]>> & { contentLength?: number };
  return {
    ...info,
    baseURL: "",
    filesize: contentLength || (await doc.getDownloadInfo()).length,
    filename: "",
    metadata: metadata?.getRaw(),
    authors: metadata?.get("dc:creator"),
    numPages: doc.numPages,
    URL: "",
  };
}

export function createFormScripting(eventBus: EventBus, hooks: Hooks) {
  let viewer: PDFViewer | null = null;
  let current: PDFDocumentProxy | null = null;
  let session: Session | null = null;
  let fieldIds = new Set<string>();
  let fieldObjects: FieldObjects = null;
  let nextAck = 0;
  let touched = false;
  let alertAllowed = true;
  let alertOpen = false;
  let waitingToShow: MutationObserver | null = null;

  const whenShown = (show: () => void) => {
    const tab = viewer?.container.closest(".document-tab");
    if (!tab?.hasAttribute("inert")) {
      show();
      return;
    }
    waitingToShow?.disconnect();
    waitingToShow = new MutationObserver(() => {
      if (!tab.hasAttribute("inert")) {
        waitingToShow?.disconnect();
        waitingToShow = null;
        show();
      }
    });
    waitingToShow.observe(tab, { attributes: true, attributeFilter: ["inert"] });
  };

  const end = () => {
    const ended = session;
    session = null;
    if (ended) {
      ended.listeners.abort();
      window.clearInterval(ended.watchdog);
      ended.worker.terminate();
      ended.acks.forEach((finish) => finish());
    }
  };

  const post = (active: Session, request: ScriptingRequest) => active.worker.postMessage(request);

  const dispatch = (event: SandboxEvent) => {
    if (session) {
      post(session, { op: "event", event });
    }
  };

  const runAction = (name: DocumentAction) => {
    const active = session;
    if (!active?.ready) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const ack = (nextAck += 1);
      const finish = () => {
        window.clearTimeout(timer);
        active.acks.delete(ack);
        resolve();
      };
      const timer = window.setTimeout(finish, ACTION_TIMEOUT_MS);
      active.acks.set(ack, finish);
      post(active, { op: "event", event: { id: "doc", name }, ack });
    });
  };

  const withoutMarkingEdited = (storage: ModifiedStorage, apply: () => void) => {
    if (touched) {
      apply();
      return;
    }
    const notify = storage.onSetModified;
    let marked = false;
    storage.onSetModified = () => {
      marked = true;
    };
    try {
      apply();
    } finally {
      storage.onSetModified = notify;
    }
    if (marked && Object.hasOwn(storage, "resetModified")) {
      notify?.();
    } else if (marked) {
      storage.resetModified();
    }
  };

  const run = (command: ViewCommand) => {
    if (!viewer) {
      return;
    }
    switch (command.kind) {
      case "page":
        viewer.currentPageNumber = Math.min(command.page, viewer.pagesCount);
        break;
      case "first":
        viewer.currentPageNumber = 1;
        break;
      case "last":
        viewer.currentPageNumber = viewer.pagesCount;
        break;
      case "next":
        viewer.nextPage();
        break;
      case "previous":
        viewer.previousPage();
        break;
      case "zoom":
        viewer.currentScaleValue = command.value;
        break;
      case "zoomIn":
        viewer.increaseScale();
        break;
      case "zoomOut":
        viewer.decreaseScale();
        break;
    }
  };

  const update = (doc: PDFDocumentProxy, detail: SandboxUpdate) => {
    const command = viewCommand(detail);
    if (command) {
      run(command);
    }
    const request = scriptRequest(detail);
    if (request && touched) {
      viewer?.container.dispatchEvent(new CustomEvent(SCRIPT_COMMAND_EVENT, { detail: request, bubbles: true }));
    }
    const targets = updateTargets(detail, fieldIds);
    if (!targets.length || !viewer) {
      return;
    }
    const { id: _id, siblings: _siblings, ...change } = detail;
    const storage = doc.annotationStorage as unknown as ModifiedStorage;
    const root = viewer.viewer as HTMLElement;
    withoutMarkingEdited(storage, () => {
      for (const target of targets) {
        const element = root.querySelector(`[data-element-id="${CSS.escape(target)}"]`);
        if (element) {
          element.dispatchEvent(new CustomEvent("updatefromsandbox", { detail: change }));
        } else {
          storage.setValue(target, change);
        }
      }
    });
  };

  const showAlert = (message: string) => {
    const text = alertText(message);
    if (!text || alertOpen || !alertAllowed) {
      return;
    }
    alertAllowed = false;
    alertOpen = true;
    whenShown(() => {
      void hooks.alert(text).finally(() => {
        alertOpen = false;
      });
    });
  };

  const openPage = (active: Session, pageNumber: number) => {
    const pageView = viewer?.getPageView(pageNumber - 1) as { renderingState?: number; pdfPage?: { getJSActions(): Promise<unknown> } } | undefined;
    if (pageView?.renderingState !== RenderingStates.FINISHED) {
      active.waitingPages.add(pageNumber);
      return;
    }
    active.waitingPages.delete(pageNumber);
    const visited = active.pages.has(pageNumber);
    active.pages.set(
      pageNumber,
      (async () => {
        const actions = visited ? null : await pageView.pdfPage?.getJSActions().catch(() => null);
        if (session === active) {
          post(active, { op: "event", event: { id: "page", name: "PageOpen", pageNumber, actions } });
        }
      })(),
    );
  };

  const closePage = async (active: Session, pageNumber: number) => {
    const opened = active.pages.get(pageNumber);
    if (active.waitingPages.has(pageNumber) || !opened) {
      return;
    }
    active.pages.set(pageNumber, null);
    await opened;
    if (session === active) {
      post(active, { op: "event", event: { id: "page", name: "PageClose", pageNumber } });
    }
  };

  const sendStoredValues = (active: Session) => {
    const storage = active.doc.annotationStorage as unknown as ModifiedStorage;
    for (const field of readFields(fieldObjects)) {
      const value = storage.getRawValue(field.id)?.value;
      if (value !== undefined) {
        post(active, { op: "event", event: commitEvent(field, value) });
      }
    }
  };

  const listen = (active: Session) => {
    const { signal } = active.listeners;
    const container = viewer!.container;
    container.addEventListener(
      "focusout",
      (event) => {
        const field = event.target instanceof HTMLElement && event.target.closest(".annotationLayer") ? event.target : null;
        if (field?.hasAttribute("data-element-id") && !event.relatedTarget) {
          field.dispatchEvent(new FocusEvent("blur", { relatedTarget: container }));
        }
      },
      { signal },
    );
    eventBus.on(
      "pagechanging",
      ({ pageNumber, previous }: { pageNumber: number; previous: number }) => {
        if (active.ready && pageNumber !== previous) {
          void closePage(active, previous);
          openPage(active, pageNumber);
        }
      },
      { signal },
    );
    eventBus.on(
      "pagerendered",
      ({ pageNumber }: { pageNumber: number }) => {
        if (active.ready && active.waitingPages.has(pageNumber) && pageNumber === viewer?.currentPageNumber) {
          openPage(active, pageNumber);
        }
      },
      { signal },
    );
  };

  const start = (doc: PDFDocumentProxy, data: object) => {
    const worker = spawn();
    const active: Session = {
      doc,
      worker,
      listeners: new AbortController(),
      ready: false,
      asking: false,
      missedPings: 0,
      acks: new Map(),
      watchdog: 0,
      pages: new Map(),
      waitingPages: new Set(),
    };
    session = active;
    worker.onmessage = ({ data: reply }: MessageEvent<ScriptingReply>) => {
      if (session !== active) {
        return;
      }
      if (reply.type === "pong") {
        active.missedPings = 0;
      } else if (reply.type === "asking" || reply.type === "asked") {
        active.asking = reply.type === "asking";
        active.missedPings = 0;
      } else if (reply.type === "done") {
        active.acks.get(reply.ack)?.();
      } else if (reply.type === "update") {
        update(active.doc, reply.detail);
      } else if (reply.type === "alert") {
        showAlert(reply.message);
      } else if (reply.type === "failed") {
        console.error("Form scripts couldn't start:", reply.message);
        end();
      } else {
        active.ready = true;
        post(active, { op: "event", event: { id: "doc", name: "Open" } });
        sendStoredValues(active);
        openPage(active, viewer?.currentPageNumber ?? 1);
      }
    };
    worker.onerror = () => {
      if (session === active) {
        end();
      }
    };
    active.watchdog = window.setInterval(() => {
      if (session !== active || active.asking) {
        return;
      }
      if (stoppedAnswering(active.missedPings)) {
        end();
        whenShown(hooks.stopped);
        return;
      }
      active.missedPings += 1;
      post(active, { op: "ping" });
    }, PING_INTERVAL_MS);
    listen(active);
    post(active, { op: "create", wasmUrl: `${assetsUrl}wasm/`, askUrl, data });
  };

  const load = async (doc: PDFDocumentProxy, enabled: boolean) => {
    try {
      if (!(await doc.hasJSActions())) {
        return;
      }
      const [objects, calculationOrder, actions, info] = await Promise.all([doc.getFieldObjects(), doc.getCalculationOrderIds(), doc.getJSActions(), documentInfo(doc)]);
      if (doc !== current || session || (!objects && !actions)) {
        return;
      }
      fieldObjects = objects as FieldObjects;
      fieldIds = new Set(readFields(fieldObjects).map(({ id }) => id));
      if (!enabled) {
        return;
      }
      start(doc, {
        objects,
        calculationOrder,
        appInfo: { platform: navigator.platform, language: navigator.language },
        docInfo: { ...info, actions },
      });
    } catch (error) {
      if (doc === current) {
        console.error("Form scripts couldn't start:", error);
        end();
      }
    }
  };

  const setDocument = async (doc: PDFDocumentProxy | null) => {
    end();
    waitingToShow?.disconnect();
    waitingToShow = null;
    alertOpen = false;
    current = doc;
    fieldIds = new Set();
    fieldObjects = null;
    touched = false;
    alertAllowed = true;
    if (doc && viewer) {
      await load(doc, scriptsEnabled());
    }
  };

  const apply = (enabled: boolean) => {
    if (!enabled) {
      end();
    } else if (current && !session) {
      void load(current, true);
    }
  };

  const attach = (attached: PDFViewer) => {
    viewer = attached;
    live.add(apply);
    const interacted = () => {
      touched = true;
      alertAllowed = true;
    };
    for (const type of ["keydown", "pointerdown", "input", "change"]) {
      attached.container.addEventListener(type, interacted, { capture: true });
    }
    eventBus.on("dispatcheventinsandbox", ({ detail }: { detail: SandboxEvent }) => {
      const echo = session || !current ? null : passThrough(detail);
      if (session) {
        post(session, { op: "event", event: detail });
      } else if (echo && current) {
        update(current, echo);
      }
    });
  };

  return {
    manager: {
      setDocument,
      get ready() {
        return !!session?.ready;
      },
      destroyPromise: null,
    } as unknown as PDFScriptingManager,
    attachViewer: attach,
    dispatch,
    runAction,
    get running() {
      return !!session;
    },
    dispose() {
      live.delete(apply);
      waitingToShow?.disconnect();
      end();
      current = null;
      viewer = null;
    },
  };
}

export type FormScripting = ReturnType<typeof createFormScripting>;
