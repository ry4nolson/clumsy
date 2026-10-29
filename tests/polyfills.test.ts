import { describe, expect, it } from "vitest";
import { installIteratorJoin, installStreamIterator } from "../src/lib/polyfills";

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
