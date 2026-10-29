type JoinableIterator = Iterator<unknown> & { join?: (separator?: string) => string };

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

installIteratorJoin();
