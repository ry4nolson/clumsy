type JoinableIterator = Iterator<unknown> & { join?: (separator?: string) => string };

type StreamPrototype = { getReader(): ReadableStreamDefaultReader<unknown>; [Symbol.asyncIterator]?: unknown };

type AbortSignalStatics = { any(signals: Iterable<AbortSignal>): AbortSignal };

export function installIteratorJoin(prototype: JoinableIterator | undefined = Object.getPrototypeOf(Object.getPrototypeOf([].values()))) {
  if (!prototype || typeof prototype.join === "function") {
    return;
  }
  Object.defineProperty(prototype, "join", {
    configurable: true,
    writable: true,
    value(this: Iterable<unknown>, separator = ",") {
      return Array.from(this).join(separator);
    },
  });
}

export function installStreamIterator(prototype: StreamPrototype | undefined = globalThis.ReadableStream?.prototype) {
  if (!prototype || typeof prototype[Symbol.asyncIterator] === "function") {
    return;
  }
  async function* values(this: StreamPrototype, { preventCancel = false } = {}) {
    const reader = this.getReader();
    let finished = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          finished = true;
          return;
        }
        yield value;
      }
    } finally {
      if (!finished && !preventCancel) {
        await reader.cancel();
      }
      reader.releaseLock();
    }
  }
  for (const key of ["values", Symbol.asyncIterator]) {
    Object.defineProperty(prototype, key, { configurable: true, writable: true, value: values });
  }
}

export function installAbortSignalAny(target: AbortSignalStatics | undefined = globalThis.AbortSignal) {
  if (!target) {
    return;
  }
  Object.defineProperty(target, "any", {
    configurable: true,
    writable: true,
    value(signals: Iterable<AbortSignal>) {
      const combined = new AbortController();
      const detach = new AbortController();
      const abort = (reason: unknown) => {
        combined.abort(reason);
        detach.abort();
      };
      for (const signal of signals) {
        if (signal.aborted) {
          abort(signal.reason);
          break;
        }
        signal.addEventListener("abort", () => abort(signal.reason), { once: true, signal: detach.signal });
      }
      return combined.signal;
    },
  });
}

installIteratorJoin();
installStreamIterator();
installAbortSignalAny();
