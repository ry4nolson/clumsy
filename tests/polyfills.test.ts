import { describe, expect, it } from "vitest";
import { installAbortSignalAny, installIteratorJoin, installStreamIterator, isWebKit, removeDecompressionStream } from "../src/lib/polyfills";

const safari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const edge = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0";
const firefox = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0";

describe("removeDecompressionStream", () => {
  it("recognizes WebKit but not Chromium, Edge, or Firefox", () => {
    expect(isWebKit(safari)).toBe(true);
    expect(isWebKit(chrome)).toBe(false);
    expect(isWebKit(edge)).toBe(false);
    expect(isWebKit(firefox)).toBe(false);
  });

  it("removes DecompressionStream only in WebKit", () => {
    const webkit = { DecompressionStream: class {}, navigator: { userAgent: safari } };
    const chromium = { DecompressionStream: class {}, navigator: { userAgent: chrome } };
    removeDecompressionStream(webkit);
    removeDecompressionStream(chromium);
    expect("DecompressionStream" in webkit).toBe(false);
    expect(chromium.DecompressionStream).toBeTypeOf("function");
  });
});

const iteratorPrototype = () => Object.create(Object.getPrototypeOf(Object.getPrototypeOf([].values())));

type Polyfilled = { values: (this: ReadableStream<number>, options?: { preventCancel?: boolean }) => AsyncGenerator<number> };

function polyfilledValues() {
  const prototype = { getReader() {} } as unknown as Parameters<typeof installStreamIterator>[0] & Polyfilled;
  installStreamIterator(prototype);
  return prototype.values;
}

function counting(limit: number) {
  const state = { cancelled: false };
  let next = 0;
  const stream = new ReadableStream<number>({
    pull(controller) {
      if (next < limit) {
        controller.enqueue(next++);
      } else {
        controller.close();
      }
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { stream, state };
}

describe("installIteratorJoin", () => {
  it("joins what an iterator yields, like Array.prototype.join", () => {
    const prototype = iteratorPrototype();
    installIteratorJoin(prototype);
    const keys = new Map([["‘", "'"], ["½", "1/2"]]).keys();
    expect(prototype.join.call(keys, "")).toBe("‘½");
    expect(prototype.join.call(new Set(["a", "b"]).values())).toBe("a,b");
  });

  it("leaves a native join alone", () => {
    const native = () => "native";
    const prototype = Object.assign(iteratorPrototype(), { join: native });
    installIteratorJoin(prototype);
    expect(prototype.join).toBe(native);
  });

  it("does nothing without an Iterator prototype", () => {
    expect(() => installIteratorJoin(undefined)).not.toThrow();
  });
});

describe("installStreamIterator", () => {
  it("yields every chunk and releases the stream when it ends", async () => {
    const values = polyfilledValues();
    const { stream, state } = counting(3);
    const seen: number[] = [];
    for await (const value of values.call(stream)) {
      seen.push(value);
    }
    expect(seen).toEqual([0, 1, 2]);
    expect(stream.locked).toBe(false);
    expect(state.cancelled).toBe(false);
  });

  it("cancels the stream when the loop exits early", async () => {
    const values = polyfilledValues();
    const { stream, state } = counting(10);
    for await (const value of values.call(stream)) {
      if (value === 1) {
        break;
      }
    }
    expect(state.cancelled).toBe(true);
    expect(stream.locked).toBe(false);
  });

  it("keeps the stream open with preventCancel", async () => {
    const values = polyfilledValues();
    const { stream, state } = counting(10);
    for await (const value of values.call(stream, { preventCancel: true })) {
      if (value === 0) {
        break;
      }
    }
    expect(state.cancelled).toBe(false);
    expect(stream.locked).toBe(false);
  });

  it("leaves a native async iterator alone", () => {
    const native = async function* () {};
    const prototype = { getReader() {}, [Symbol.asyncIterator]: native } as unknown as Parameters<typeof installStreamIterator>[0];
    installStreamIterator(prototype);
    expect(prototype![Symbol.asyncIterator]).toBe(native);
  });
});

describe("installAbortSignalAny", () => {
  const install = () => {
    const target = {} as Parameters<typeof installAbortSignalAny>[0] & { any(signals: Iterable<AbortSignal>): AbortSignal };
    installAbortSignalAny(target);
    return target.any;
  };

  it("aborts when any source aborts, with that source's reason", () => {
    const first = new AbortController();
    const second = new AbortController();
    const signal = install()([first.signal, second.signal]);
    expect(signal.aborted).toBe(false);
    second.abort("second");
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe("second");
    first.abort("first");
    expect(signal.reason).toBe("second");
  });

  it("starts aborted when a source already is", () => {
    const done = new AbortController();
    done.abort("early");
    const signal = install()([new AbortController().signal, done.signal]);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe("early");
  });

  it("removes listeners registered with it once a source aborts", () => {
    const source = new AbortController();
    const target = new EventTarget();
    let hits = 0;
    target.addEventListener("ping", () => hits++, { signal: install()([source.signal]) });
    target.dispatchEvent(new Event("ping"));
    source.abort();
    target.dispatchEvent(new Event("ping"));
    expect(hits).toBe(1);
  });

  it("stops listening to the other sources after aborting", () => {
    const keep = new AbortController();
    const end = new AbortController();
    const added: string[] = [];
    const removed: string[] = [];
    const watch = (signal: AbortSignal, name: string) => {
      const add = signal.addEventListener.bind(signal);
      signal.addEventListener = ((type: string, listener: EventListener, options?: AddEventListenerOptions) => {
        added.push(name);
        options?.signal?.addEventListener("abort", () => removed.push(name));
        add(type, listener, options);
      }) as typeof signal.addEventListener;
      return signal;
    };
    install()([watch(keep.signal, "keep"), watch(end.signal, "end")]);
    end.abort();
    expect(added).toEqual(["keep", "end"]);
    expect(removed).toEqual(["keep", "end"]);
  });
});
