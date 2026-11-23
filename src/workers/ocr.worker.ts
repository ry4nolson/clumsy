import { createOCREngine, layoutFlags, supportsFastBuild, type OCREngine } from "tesseract-wasm";
import fastWasm from "../../node_modules/tesseract-wasm/dist/tesseract-core.wasm?url";
import fallbackWasm from "../../node_modules/tesseract-wasm/dist/tesseract-core-fallback.wasm?url";
import type { RecognizedWord } from "../lib/ocr";

export type OcrJob = { id: number; image: ImageData; model?: ArrayBuffer };
export type OcrAnswer = { id: number; words: RecognizedWord[] } | { id: number; failure: string };

let engine: Promise<OCREngine> | null = null;

async function loadEngine() {
  const response = await fetch(supportsFastBuild() ? fastWasm : fallbackWasm);
  if (!response.ok) {
    throw new Error("The text recognition engine couldn't be loaded.");
  }
  return createOCREngine({ wasmBinary: await response.arrayBuffer() });
}

self.onmessage = async ({ data }: MessageEvent<OcrJob>) => {
  const post = (answer: OcrAnswer) => (self as unknown as Worker).postMessage(answer);
  try {
    const ocr = await (engine ??= loadEngine());
    if (data.model) {
      ocr.loadModel(data.model);
    }
    ocr.loadImage(data.image);
    const words = ocr.getTextBoxes("word").map(({ text, confidence, rect, flags }) => ({ text, confidence, rect, lineEnd: (flags & layoutFlags.EndOfLine) !== 0 }));
    ocr.clearImage();
    post({ id: data.id, words });
  } catch (error) {
    post({ id: data.id, failure: error instanceof Error ? error.message : String(error) });
  }
};
