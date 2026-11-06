import { describe, expect, it } from "vitest";
import { installAbortSignalAny, installGetOrInsert, installIteratorJoin, installStreamIterator, installSumPrecise, isWebKit, removeDecompressionStream, sumPrecise } from "../src/lib/polyfills";

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

type Upsert<K, V> = { getOrInsert(key: K, value: V): V; getOrInsertComputed(key: K, callback: (key: K) => V): V };

function upsertMap<K, V>(map: Map<K, V>) {
  const prototype = Object.create(Map.prototype);
  installGetOrInsert(prototype);
  Object.setPrototypeOf(map, prototype);
  return map as Map<K, V> & Upsert<K, V>;
}

function upsertWeakMap<K extends WeakKey, V>(map: WeakMap<K, V>) {
  const prototype = Object.create(WeakMap.prototype);
  installGetOrInsert(prototype, true);
  Object.setPrototypeOf(map, prototype);
  return map as WeakMap<K, V> & Upsert<K, V>;
}

describe("installGetOrInsert", () => {
  it("returns an existing value without inserting or calling back", () => {
    const map = upsertMap(new Map([["a", 1]]));
    let calls = 0;
    expect(map.getOrInsert("a", 2)).toBe(1);
    expect(map.getOrInsertComputed("a", () => ++calls)).toBe(1);
    expect(calls).toBe(0);
    expect(map.get("a")).toBe(1);
  });

  it("inserts a missing value and returns it", () => {
    const map = upsertMap(new Map<string, number[]>());
    map.getOrInsertComputed("pages", () => []).push(1);
    map.getOrInsertComputed("pages", () => []).push(2);
    expect(map.get("pages")).toEqual([1, 2]);
    expect(map.getOrInsert("other", [3])).toEqual([3]);
    expect(map.size).toBe(2);
  });

  it("passes the key to the callback with -0 normalized", () => {
    const map = upsertMap(new Map<number, string>());
    let seen: number | undefined;
    map.getOrInsertComputed(-0, (key) => {
      seen = key;
      return "zero";
    });
    expect(Object.is(seen, 0)).toBe(true);
    expect(map.get(0)).toBe("zero");
  });

  it("keeps the callback's value over anything the callback inserted", () => {
    const map = upsertMap(new Map<string, number>());
    expect(map.getOrInsertComputed("a", () => {
      map.set("a", 1);
      return 2;
    })).toBe(2);
    expect(map.get("a")).toBe(2);
  });

  it("rejects a callback that isn't a function before touching the map", () => {
    const map = upsertMap(new Map<string, number>());
    expect(() => map.getOrInsertComputed("a", 1 as unknown as () => number)).toThrow(TypeError);
    expect(map.size).toBe(0);
  });

  it("works on weak maps and rejects keys they can't hold before calling back", () => {
    const map = upsertWeakMap(new WeakMap<object, number>());
    const key = {};
    expect(map.getOrInsertComputed(key, () => 1)).toBe(1);
    expect(map.getOrInsert(key, 2)).toBe(1);
    let calls = 0;
    expect(() => map.getOrInsertComputed("a" as unknown as object, () => ++calls)).toThrow(TypeError);
    expect(calls).toBe(0);
  });

  it("leaves native methods alone", () => {
    const native = () => "native";
    const prototype = { has: () => false, get: () => undefined, set: () => undefined, getOrInsert: native, getOrInsertComputed: native };
    installGetOrInsert(prototype);
    expect(prototype.getOrInsert).toBe(native);
    expect(prototype.getOrInsertComputed).toBe(native);
  });
});

function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

const SCALE = 2n ** 100n;

function exactReference(values: number[]) {
  const total = values.reduce((sum, value) => sum + (Number.isInteger(value) ? BigInt(value) * SCALE : BigInt(value * 2 ** 100)), 0n);
  return total % SCALE === 0n ? Number(total / SCALE) : Number(total) / 2 ** 100;
}

function randomDouble(next: () => number, minExponent: number, maxExponent: number) {
  const mantissa = Math.floor(next() * 2 ** 20) * 2 ** 32 + Math.floor(next() * 2 ** 32);
  const exponent = minExponent + Math.floor(next() * (maxExponent - minExponent + 1));
  const value = (mantissa + 2 ** 52) * 2 ** (exponent - 52);
  return next() < 0.5 ? -value : value;
}

describe("sumPrecise", () => {
  it("sums exactly where adding in order loses precision", () => {
    expect(sumPrecise([1e20, 0.1, -1e20])).toBe(0.1);
    expect(sumPrecise([0.1, 0.2, 0.3])).toBe(0.6);
    expect(sumPrecise([2 ** 53, 1, 1])).toBe(2 ** 53 + 2);
    expect(sumPrecise([1, 2 ** -53, 2 ** -106])).toBe(1 + 2 ** -52);
  });

  it("matches an exact BigInt sum on random inputs", () => {
    const next = random(1);
    for (let round = 0; round < 400; round++) {
      const count = 1 + Math.floor(next() * 12);
      const values = Array.from({ length: count }, () => randomDouble(next, -40, next() < 0.5 ? 60 : 900));
      if (next() < 0.3) {
        values.push(-values[0]);
      }
      expect(sumPrecise(values)).toBe(exactReference(values));
    }
  });

  it("handles sums that overflow along the way", () => {
    const max = Number.MAX_VALUE;
    expect(sumPrecise([max, max, -max])).toBe(max);
    expect(sumPrecise([max, max, max, -max, -max, -max, 1])).toBe(1);
    expect(sumPrecise([max, max])).toBe(Infinity);
    expect(sumPrecise([-max, -max])).toBe(-Infinity);
    expect(sumPrecise([max, 2 ** 970])).toBe(Infinity);
    expect(sumPrecise([max, 2 ** 970, -(2 ** 918)])).toBe(max);
    expect(sumPrecise([max, 2 ** 970, -1])).toBe(max);
    expect(sumPrecise([-max, -(2 ** 970), 1])).toBe(-max);
    const next = random(2);
    for (let round = 0; round < 200; round++) {
      const values = Array.from({ length: 2 + Math.floor(next() * 8) }, () => randomDouble(next, 1015, 1023));
      expect(sumPrecise(values)).toBe(exactReference(values));
    }
  });

  it("follows the spec for zeros, infinities, and NaN", () => {
    expect(Object.is(sumPrecise([]), -0)).toBe(true);
    expect(Object.is(sumPrecise([-0, -0]), -0)).toBe(true);
    expect(Object.is(sumPrecise([-0, 0]), 0)).toBe(true);
    expect(Object.is(sumPrecise([1, -1]), 0)).toBe(true);
    expect(sumPrecise([Infinity, 1])).toBe(Infinity);
    expect(sumPrecise([-Infinity, Number.MAX_VALUE])).toBe(-Infinity);
    expect(sumPrecise([Infinity, -Infinity])).toBeNaN();
    expect(sumPrecise([1, NaN])).toBeNaN();
  });

  it("accepts any iterable of numbers and rejects anything else", () => {
    expect(sumPrecise(new Set([1, 2, 3]))).toBe(6);
    expect(sumPrecise([1, 2].values())).toBe(3);
    expect(() => sumPrecise([1, "2"])).toThrow(TypeError);
    expect(() => sumPrecise(5 as unknown as Iterable<number>)).toThrow(TypeError);
  });

  it("installs only when Math has no sumPrecise", () => {
    const target: { sumPrecise?: unknown } = {};
    installSumPrecise(target);
    expect(target.sumPrecise).toBe(sumPrecise);
    const native = () => 0;
    const existing = { sumPrecise: native };
    installSumPrecise(existing);
    expect(existing.sumPrecise).toBe(native);
  });
});
