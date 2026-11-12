import type { PageEdit } from "./pageEditPlan";
import type { ByteRange, PdfSignature, SignatureScan, SignatureVerdict, VerifyItem } from "./signatureTypes";

const EOF_MARKER = [0x25, 0x25, 0x45, 0x4f, 0x46];
const BYTE_RANGE_KEY = [0x2f, 0x42, 0x79, 0x74, 0x65, 0x52, 0x61, 0x6e, 0x67, 0x65];
const CONTENTS_KEY = /\/Contents\s*$/;
const LOOKBEHIND = 32;

const latin1 = new TextDecoder("latin1");

function indexOfBytes(bytes: Uint8Array, needle: number[], from = 0) {
  const first = needle[0];
  for (let at = bytes.indexOf(first, from); at >= 0 && at <= bytes.length - needle.length; at = bytes.indexOf(first, at + 1)) {
    let index = 1;
    while (index < needle.length && bytes[at + index] === needle[index]) {
      index += 1;
    }
    if (index === needle.length) {
      return at;
    }
  }
  return -1;
}

export const mayHaveSignatures = (bytes: Uint8Array) => indexOfBytes(bytes, BYTE_RANGE_KEY) >= 0;

export type RevisionEnd = { marker: number; end: number };

export function revisionEnds(bytes: Uint8Array): RevisionEnd[] {
  const ends: RevisionEnd[] = [];
  for (let at = indexOfBytes(bytes, EOF_MARKER); at >= 0; at = indexOfBytes(bytes, EOF_MARKER, at + EOF_MARKER.length)) {
    let end = at + EOF_MARKER.length;
    if (bytes[end] === 0x0d) {
      end += 1;
    }
    if (bytes[end] === 0x0a) {
      end += 1;
    }
    ends.push({ marker: at, end });
  }
  return ends;
}

export const endsRevision = (ends: RevisionEnd[], offset: number) => ends.some(({ marker, end }) => offset >= marker + EOF_MARKER.length && offset <= end);

export const laterRevisionCount = (ends: RevisionEnd[], offset: number) => ends.filter(({ marker }) => marker >= offset).length;

const isWhitespace = (byte: number) => byte === 0x00 || byte === 0x09 || byte === 0x0a || byte === 0x0c || byte === 0x0d || byte === 0x20;

export function onlyWhitespaceAfter(bytes: Uint8Array, offset: number) {
  for (let index = offset; index < bytes.length; index += 1) {
    if (!isWhitespace(bytes[index])) {
      return false;
    }
  }
  return true;
}

export const contentsGap = (range: ByteRange) => ({ at: range[0] + range[1], length: range[2] - range[0] - range[1] });

const isHexDigit = (byte: number) => (byte >= 0x30 && byte <= 0x39) || (byte >= 0x41 && byte <= 0x46) || (byte >= 0x61 && byte <= 0x66);

export function hexStringAt(bytes: Uint8Array, at: number, length: number) {
  if (length < 2 || bytes[at] !== 0x3c || bytes[at + length - 1] !== 0x3e) {
    return false;
  }
  for (let index = at + 1; index < at + length - 1; index += 1) {
    if (!isHexDigit(bytes[index])) {
      return false;
    }
  }
  return true;
}

export function gapBytes(bytes: Uint8Array, range: ByteRange) {
  const { at, length } = contentsGap(range);
  const hex = bytes.subarray(at + 1, at + length - 1);
  const out = new Uint8Array(Math.ceil(hex.length / 2));
  const digit = (byte: number) => (byte <= 0x39 ? byte - 0x30 : (byte | 0x20) - 0x57);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = (digit(hex[index * 2]) << 4) | (hex[index * 2 + 1] === undefined ? 0 : digit(hex[index * 2 + 1]));
  }
  return out;
}

export function trimZeroPadding(der: Uint8Array) {
  let end = der.length;
  while (end > 0 && der[end - 1] === 0) {
    end -= 1;
  }
  return der.subarray(0, end);
}

export function parseByteRange(values: Array<number | undefined> | null): { range: ByteRange; problems: string[] } {
  if (!values) {
    return { range: [0, 0, 0, 0], problems: ["The signature has no byte range."] };
  }
  const numbers = values.map((value) => value ?? NaN);
  const range = [0, 1, 2, 3].map((index) => (Number.isFinite(numbers[index]) ? numbers[index] : 0)) as ByteRange;
  const whole = numbers.length === 4 && numbers.every((value) => Number.isInteger(value) && value >= 0);
  return { range, problems: whole ? [] : ["The byte range isn't four whole numbers."] };
}

export type ByteRangeCheck = { ok: boolean; problems: string[]; revisionEnd: number; coversWholeFile: boolean; laterRevisions: number };

export function checkByteRange(bytes: Uint8Array, range: ByteRange, ends = revisionEnds(bytes), parseProblems: string[] = []): ByteRangeCheck {
  const fatal = [...parseProblems];
  const notes: string[] = [];
  const [start, firstLength, second, secondLength] = range;
  const end = second + secondLength;
  if (!fatal.length) {
    const { at, length } = contentsGap(range);
    if (start !== 0) {
      fatal.push("The signed bytes don't start at the beginning of the file.");
    }
    if (firstLength <= 0 || length < 2) {
      fatal.push("The byte range leaves no room for the signature.");
    } else if (end > bytes.length) {
      fatal.push("The byte range runs past the end of the file.");
    } else if (!hexStringAt(bytes, at, length)) {
      fatal.push("The gap in the signed bytes isn't exactly the signature's contents.");
    } else if (!CONTENTS_KEY.test(latin1.decode(bytes.subarray(Math.max(0, at - LOOKBEHIND), at)))) {
      fatal.push("The gap in the signed bytes isn't a /Contents entry.");
    }
  }
  const ok = !fatal.length;
  if (ok && !endsRevision(ends, end)) {
    notes.push("The signed bytes don't end at the end of a saved version of the file.");
  }
  const revisionEnd = ok ? end : 0;
  return {
    ok,
    problems: [...fatal, ...notes],
    revisionEnd,
    coversWholeFile: ok && onlyWhitespaceAfter(bytes, end),
    laterRevisions: ok ? laterRevisionCount(ends, end) : 0,
  };
}

const DATE = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:([Zz])|([+-])(\d{2})'?(\d{2})?'?)?/;

export function pdfDateToIso(value: string | null | undefined) {
  const match = value ? DATE.exec(value.trim().startsWith("D:") ? value.trim() : `D:${value.trim()}`) : null;
  if (!match) {
    return null;
  }
  const [, year, month = "01", day = "01", hour = "00", minute = "00", second = "00", zulu, sign, offsetHours, offsetMinutes = "00"] = match;
  const parts = [Number(month), Number(day), Number(hour), Number(minute), Number(second)];
  if (parts[0] < 1 || parts[0] > 12 || parts[1] < 1 || parts[1] > 31 || parts[2] > 23 || parts[3] > 59 || parts[4] > 60) {
    return null;
  }
  const zone = sign && !zulu ? `${sign}${offsetHours}:${offsetMinutes}` : "Z";
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${zone}`;
}

export const intactSignatures = (scan: SignatureScan | null) => scan?.signatures.filter((signature) => signature.byteRangeOk).length ?? 0;

export const verifyItemsOf = (scan: SignatureScan): VerifyItem[] =>
  scan.signatures
    .filter((signature) => signature.byteRangeOk)
    .map(({ id, byteRange, subFilter, claimedTime }) => ({ id, byteRange, subFilter, claimedTime }));

export const malformedVerdict = (signature: PdfSignature): SignatureVerdict => ({
  id: signature.id,
  status: "invalid",
  integrity: "malformed",
  signer: null,
  chain: [],
  trusted: false,
  signingTime: signature.claimedTime ? { time: signature.claimedTime, source: "claimed", authority: null } : null,
  revocation: "not-checked",
  revocationSource: null,
  digestAlgorithm: "",
  signatureAlgorithm: "",
  level: null,
  problems: signature.problems,
});

export function mergeVerdicts(scan: SignatureScan, verified: SignatureVerdict[]) {
  const byId = new Map(verified.map((verdict) => [verdict.id, verdict]));
  return scan.signatures.flatMap((signature) => {
    const verdict = signature.byteRangeOk ? byId.get(signature.id) : malformedVerdict(signature);
    return verdict ? [verdict] : [];
  });
}

export function rewriteAction(edit: PageEdit, protectedBefore: boolean) {
  switch (edit.kind) {
    case "move":
      return "Moving pages";
    case "delete":
      return "Deleting pages";
    case "rotate":
      return "Rotating pages";
    case "insert":
      return "Inserting pages";
    case "label":
      return "Changing page labels";
    case "flatten":
      return "Flattening the form";
    case "protect":
      return edit.password ? (protectedBefore ? "Changing the password" : "Setting a password") : "Removing the password";
  }
}

export const ANNOTATIONS_REWRITE_ACTION = "Saving these comments and markup";

export function signatureWarning(count: number, action: string) {
  if (count <= 0) {
    return null;
  }
  return count === 1
    ? `This document has a digital signature. ${action} removes it.`
    : `This document has ${count} digital signatures. ${action} removes them.`;
}
