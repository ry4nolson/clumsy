type JoinableIterator = Iterator<unknown> & { join?: (separator?: string) => string };

type StreamPrototype = { getReader(): ReadableStreamDefaultReader<unknown>; [Symbol.asyncIterator]?: unknown };

type AbortSignalStatics = { any(signals: Iterable<AbortSignal>): AbortSignal };

type StreamGlobals = { DecompressionStream?: unknown; navigator?: { userAgent: string } };

export function isWebKit(userAgent: string) {
  return userAgent.includes("AppleWebKit") && !/Chrome|Chromium|Edg\//.test(userAgent);
}

export function removeDecompressionStream(target: StreamGlobals = globalThis as StreamGlobals) {
  if (target.navigator && isWebKit(target.navigator.userAgent)) {
    delete target.DecompressionStream;
  }
}

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

type UpsertPrototype = {
  has(key: unknown): boolean;
  get(key: unknown): unknown;
  set(key: unknown, value: unknown): unknown;
  getOrInsert?: unknown;
  getOrInsertComputed?: unknown;
};

type MathStatics = { sumPrecise?: unknown };

function canBeHeldWeakly(key: unknown) {
  return (typeof key === "object" && key !== null) || typeof key === "function" || (typeof key === "symbol" && Symbol.keyFor(key) === undefined);
}

export function installGetOrInsert(prototype: UpsertPrototype | undefined, weak = false) {
  if (!prototype) {
    return;
  }
  const checkKey = (key: unknown) => {
    if (weak && !canBeHeldWeakly(key)) {
      throw new TypeError("Invalid value used as weak map key");
    }
    return Object.is(key, -0) ? 0 : key;
  };
  const methods = {
    getOrInsert(this: UpsertPrototype, key: unknown, value: unknown) {
      key = checkKey(key);
      if (this.has(key)) {
        return this.get(key);
      }
      this.set(key, value);
      return value;
    },
    getOrInsertComputed(this: UpsertPrototype, key: unknown, callback: (key: unknown) => unknown) {
      if (typeof callback !== "function") {
        throw new TypeError("getOrInsertComputed requires a function");
      }
      key = checkKey(key);
      if (this.has(key)) {
        return this.get(key);
      }
      const value = callback(key);
      this.set(key, value);
      return value;
    },
  };
  for (const [name, value] of Object.entries(methods)) {
    if (typeof prototype[name as keyof typeof methods] !== "function") {
      Object.defineProperty(prototype, name, { configurable: true, writable: true, value });
    }
  }
}

const HALF_LIMIT = 2 ** 1023;
const MAX_ULP = 2 ** 971;

function twoSum(x: number, y: number) {
  const hi = x + y;
  return { hi, lo: y - (hi - x) };
}

function accumulate(values: number[]) {
  const partials: number[] = [];
  let overflow = 0;
  for (let x of values) {
    let used = 0;
    for (let y of partials) {
      if (Math.abs(x) < Math.abs(y)) {
        [x, y] = [y, x];
      }
      let { hi, lo } = twoSum(x, y);
      if (!Number.isFinite(hi)) {
        const sign = hi > 0 ? 1 : -1;
        overflow += sign;
        x = x - sign * HALF_LIMIT - sign * HALF_LIMIT;
        if (Math.abs(x) < Math.abs(y)) {
          [x, y] = [y, x];
        }
        ({ hi, lo } = twoSum(x, y));
      }
      if (lo !== 0) {
        partials[used++] = lo;
      }
      x = hi;
    }
    partials.length = used;
    if (x !== 0) {
      partials.push(x);
    }
  }
  return { partials, overflow };
}

function roundPartials(partials: number[], overflow: number) {
  let n = partials.length - 1;
  let hi = 0;
  let lo = 0;
  if (overflow !== 0) {
    const next = n >= 0 ? partials[n] : 0;
    n--;
    if (Math.abs(overflow) > 1 || (overflow > 0 && next > 0) || (overflow < 0 && next < 0)) {
      return overflow > 0 ? Infinity : -Infinity;
    }
    ({ hi, lo } = twoSum(overflow * HALF_LIMIT, next / 2));
    lo *= 2;
    if (!Number.isFinite(2 * hi)) {
      const sign = hi > 0 ? 1 : -1;
      if (hi === sign * HALF_LIMIT && lo === -sign * (MAX_ULP / 2) && n >= 0 && Math.sign(partials[n]) === -sign) {
        return sign * Number.MAX_VALUE;
      }
      return sign * Infinity;
    }
    if (lo !== 0) {
      partials[++n] = lo;
      lo = 0;
    }
    hi *= 2;
  }
  while (n >= 0) {
    ({ hi, lo } = twoSum(hi, partials[n--]));
    if (lo !== 0) {
      break;
    }
  }
  if (n >= 0 && ((lo < 0 && partials[n] < 0) || (lo > 0 && partials[n] > 0))) {
    const y = lo * 2;
    const x = hi + y;
    if (y === x - hi) {
      hi = x;
    }
  }
  return hi;
}

export function sumPrecise(items: Iterable<unknown>) {
  if (items == null || typeof (items as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== "function") {
    throw new TypeError("Math.sumPrecise requires an iterable");
  }
  const finite: number[] = [];
  let positiveInfinity = false;
  let negativeInfinity = false;
  let notANumber = false;
  let allNegativeZero = true;
  for (const item of items) {
    if (typeof item !== "number") {
      throw new TypeError("Math.sumPrecise only sums numbers");
    }
    if (Number.isNaN(item)) {
      notANumber = true;
    } else if (item === Infinity) {
      positiveInfinity = true;
    } else if (item === -Infinity) {
      negativeInfinity = true;
    } else {
      finite.push(item);
    }
    if (!Object.is(item, -0)) {
      allNegativeZero = false;
    }
  }
  if (notANumber || (positiveInfinity && negativeInfinity)) {
    return NaN;
  }
  if (positiveInfinity) {
    return Infinity;
  }
  if (negativeInfinity) {
    return -Infinity;
  }
  if (allNegativeZero) {
    return -0;
  }
  const { partials, overflow } = accumulate(finite);
  return roundPartials(partials, overflow);
}

export function installSumPrecise(target: MathStatics = Math as MathStatics) {
  if (typeof target.sumPrecise === "function") {
    return;
  }
  Object.defineProperty(target, "sumPrecise", { configurable: true, writable: true, value: sumPrecise });
}

installIteratorJoin();
installStreamIterator();
installAbortSignalAny();
installGetOrInsert(Map.prototype as unknown as UpsertPrototype);
installGetOrInsert(WeakMap.prototype as unknown as UpsertPrototype, true);
installSumPrecise();
