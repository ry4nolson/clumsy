type Transport = {
  getRenderingIntent(intent: string, ...rest: unknown[]): RenderingIntent;
};

type RenderingIntent = { cacheKey: string; annotationStorageSerializable: { map: Map<string, unknown> | null; hash: string; transfer?: unknown } };

const transportOf = (doc: unknown) => (doc as { _transport?: Transport } | null)?._transport ?? null;

const hidden = new WeakMap<Transport, { ids: Set<string>; version: number }>();

function hideIn(transport: Transport) {
  const original = transport.getRenderingIntent;
  const state = { ids: new Set<string>(), version: 0 };
  hidden.set(transport, state);
  transport.getRenderingIntent = function (intent, ...rest) {
    const result = original.call(this, intent, ...rest);
    if (intent === "print" || !state.ids.size) {
      return result;
    }
    const { map, hash } = result.annotationStorageSerializable;
    const tag = `hidden${state.version}`;
    const entries: Array<[string, unknown]> = [...(map ?? []), ...[...state.ids].map((id): [string, unknown] => [id, { noView: true }])];
    return { ...result, cacheKey: `${result.cacheKey}_${tag}`, annotationStorageSerializable: { map: new Map(entries), hash: `${hash}${tag}`, transfer: undefined } };
  };
  return state;
}

export function hideAnnotations(doc: unknown, ids: Set<string>) {
  const transport = transportOf(doc);
  if (!transport) {
    return false;
  }
  const state = hidden.get(transport) ?? hideIn(transport);
  if (state.ids.size === ids.size && [...ids].every((id) => state.ids.has(id))) {
    return false;
  }
  state.ids = new Set(ids);
  state.version++;
  return true;
}
