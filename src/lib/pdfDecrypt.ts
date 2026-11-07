import {
  PDFArray,
  PDFCatalog,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFInvalidObject,
  PDFName,
  PDFObjectParser,
  PDFPageLeaf,
  PDFPageTree,
  PDFParser,
  PDFRef,
  PDFStream,
  PDFString,
  type LoadOptions,
  type PDFContext,
  type PDFObject,
} from "@cantoo/pdf-lib";

type StringParser = { cryptoFactory?: unknown; parseString(ref?: PDFRef): PDFObject; [installed]?: true };

type KeyFactory = { dict: PDFDict; encryptionKey?: Uint8Array };

type KeyFactoryClass = new (dict: PDFDict, fileId: Uint8Array, password?: string) => KeyFactory;

type KeyMethods = {
  decodeUserPassword(...args: unknown[]): Uint8Array;
  createEncryptionKey20(...args: unknown[]): Uint8Array | null;
};

type Capture = { trailer?: PDFContext["trailerInfo"]; factory?: KeyFactory };

export type PasswordRole = "user" | "owner";

const installed = Symbol("decryptedStrings");

const rawBytes = (text: string) => Uint8Array.from(text, (character) => character.charCodeAt(0));

export function installDecryptedStrings(prototype = PDFObjectParser.prototype as unknown as StringParser) {
  if (prototype[installed]) {
    return;
  }
  prototype[installed] = true;
  const parseString = prototype.parseString;
  prototype.parseString = function (this: StringParser, ref?: PDFRef) {
    const parsed = parseString.call(this, ref);
    return this.cryptoFactory && ref ? PDFHexString.fromBytes(rawBytes((parsed as unknown as { value: string }).value)) : parsed;
  };
}

let capture: Capture | null = null;

const forBytes = PDFParser.forBytesWithOptions;
PDFParser.forBytesWithOptions = (...args: Parameters<typeof forBytes>) => {
  const parser = forBytes(...args);
  const current = capture;
  const factory = args[5] as KeyFactory | undefined;
  if (current && factory) {
    current.factory = factory;
  } else if (current) {
    const parse = parser.parseDocument.bind(parser);
    parser.parseDocument = async () => {
      const context = await parse();
      current.trailer ??= context.trailerInfo;
      return context;
    };
  }
  return parser;
};

async function loadCapturing(bytes: Uint8Array, options: LoadOptions) {
  const current: Capture = {};
  capture = current;
  try {
    return { doc: await PDFDocument.load(bytes, options), ...current };
  } finally {
    if (capture === current) {
      capture = null;
    }
  }
}

export async function loadDecrypting(bytes: Uint8Array, options: LoadOptions) {
  const { doc, trailer } = await loadCapturing(bytes, options);
  const info = trailer?.Info;
  if (doc.context.isDecrypted && !doc.context.trailerInfo.Info && info instanceof PDFRef && doc.context.lookup(info) instanceof PDFDict) {
    doc.context.trailerInfo.Info = info;
  }
  return doc;
}

function firstFileId(trailer: PDFContext["trailerInfo"] | undefined) {
  const ids = trailer?.ID;
  const first = ids instanceof PDFArray ? ids.get(0) : undefined;
  return first instanceof PDFHexString || first instanceof PDFString ? first.asBytes() : null;
}

export async function passwordRole(bytes: Uint8Array, password: string): Promise<PasswordRole | null> {
  const { doc, trailer, factory } = await loadCapturing(bytes, { password, updateMetadata: false });
  const fileId = firstFileId(trailer);
  if (!doc.context.isDecrypted || !factory || !fileId) {
    return null;
  }
  const Factory = factory.constructor as KeyFactoryClass;
  class UserOnly extends Factory {}
  const methods = Factory.prototype as unknown as KeyMethods;
  Object.assign(UserOnly.prototype, {
    decodeUserPassword: (...args: unknown[]) => new Uint8Array((args[0] as Uint8Array | undefined)?.length ?? 32).fill(0xff),
    createEncryptionKey20(this: KeyMethods, ...args: unknown[]) {
      const owner = args[2] as Uint8Array;
      return methods.createEncryptionKey20.apply(this, [...args.slice(0, 2), new Uint8Array(owner.length), ...args.slice(3)]);
    },
  });
  try {
    new UserOnly(factory.dict, fileId, password);
    return "user";
  } catch {
    return "owner";
  }
}

function encryptStrings(value: PDFObject, encrypt: (bytes: Uint8Array) => Uint8Array, skip?: PDFName): PDFObject {
  if (value instanceof PDFString || value instanceof PDFHexString) {
    return PDFHexString.fromBytes(encrypt(value.asBytes()));
  }
  if (value instanceof PDFDict) {
    value.entries().forEach(([key, entry]) => key !== skip && value.set(key, encryptStrings(entry, encrypt)));
  } else if (value instanceof PDFArray) {
    value.asArray().forEach((entry, index) => value.set(index, encryptStrings(entry, encrypt)));
  }
  return value;
}

const isSignature = (object: PDFObject) => object instanceof PDFDict && object.lookup(PDFName.of("Type")) === PDFName.of("Sig");

const writtenOutsideObjectStreams = (ref: PDFRef, object: PDFObject) =>
  object instanceof PDFCatalog || object instanceof PDFPageTree || object instanceof PDFPageLeaf || ref.generationNumber !== 0 || isSignature(object);

export function encryptUncompressedStrings(doc: PDFDocument) {
  const { security, trailerInfo } = doc.context;
  if (!security) {
    return;
  }
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (ref === trailerInfo.Encrypt || object instanceof PDFInvalidObject) {
      continue;
    }
    const encrypt = () => security.getEncryptFn(ref.objectNumber, ref.generationNumber);
    if (object instanceof PDFStream) {
      encryptStrings(object.dict, encrypt());
    } else if (writtenOutsideObjectStreams(ref, object)) {
      encryptStrings(object, encrypt(), isSignature(object) ? PDFName.of("Contents") : undefined);
    }
  }
}
