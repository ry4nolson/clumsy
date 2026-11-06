import { PDFHexString, PDFObjectParser, type PDFObject, type PDFRef } from "@cantoo/pdf-lib";

type StringParser = { cryptoFactory?: unknown; parseString(ref?: PDFRef): PDFObject; [installed]?: true };

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
