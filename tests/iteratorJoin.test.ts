import { describe, expect, it } from "vitest";
import { installIteratorJoin } from "../src/lib/iteratorJoin";

const iteratorPrototype = () => Object.create(Object.getPrototypeOf(Object.getPrototypeOf([].values())));

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
