import { removeDecompressionStream } from "./polyfills";
import "pdfjs-dist/build/pdf.worker.min.mjs";

removeDecompressionStream();
