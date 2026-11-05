const P1 = 67108859;
const P2 = 67108837;
const B1 = 40503;
const B2 = 65599;
const SAMPLE = 8;

function toIds(words: string[], ids: Map<string, number>) {
  return Int32Array.from(words, (word) => {
    let id = ids.get(word);
    if (id === undefined) {
      id = ids.size + 1;
      ids.set(word, id);
    }
    return id;
  });
}

function runKeys(sequence: Int32Array, length: number) {
  const keys = new Float64Array(Math.max(0, sequence.length - length + 1));
  for (let start = 0; start < keys.length; start++) {
    let first = 0;
    let second = 0;
    for (let offset = 0; offset < length; offset++) {
      first = (first * B1 + sequence[start + offset]) % P1;
      second = (second * B2 + sequence[start + offset]) % P2;
    }
    keys[start] = first * P2 + second;
  }
  return keys;
}

const sampled = (key: number) => key % SAMPLE === 0;

function onlyOnce(keys: Float64Array) {
  const positions = new Map<number, number>();
  keys.forEach((key, index) => {
    if (sampled(key)) {
      positions.set(key, positions.has(key) ? -1 : index);
    }
  });
  return positions;
}

function sameRun(left: Int32Array, leftStart: number, right: Int32Array, rightStart: number, length: number) {
  for (let offset = 0; offset < length; offset++) {
    if (left[leftStart + offset] !== right[rightStart + offset]) {
      return false;
    }
  }
  return true;
}

export function longestChain(pairs: [number, number][]) {
  const tails: number[] = [];
  const previous = new Int32Array(pairs.length).fill(-1);
  pairs.forEach(([, right], index) => {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (pairs[tails[middle]][1] < right) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    if (low > 0) {
      previous[index] = tails[low - 1];
    }
    tails[low] = index;
  });
  const chain: [number, number][] = [];
  for (let index = tails.at(-1) ?? -1; index >= 0; index = previous[index]) {
    chain.push(pairs[index]);
  }
  return chain.reverse();
}

export function uniqueRuns(left: string[], right: string[], length: number) {
  const ids = new Map<string, number>();
  const leftIds = toIds(left, ids);
  const rightIds = toIds(right, ids);
  const leftKeys = runKeys(leftIds, length);
  const leftOnce = onlyOnce(leftKeys);
  const rightOnce = onlyOnce(runKeys(rightIds, length));
  const pairs: [number, number][] = [];
  leftKeys.forEach((key, index) => {
    if (!sampled(key)) {
      return;
    }
    const match = rightOnce.get(key);
    if (leftOnce.get(key) === index && match !== undefined && match >= 0 && sameRun(leftIds, index, rightIds, match, length)) {
      pairs.push([index, match]);
    }
  });
  return longestChain(pairs);
}
