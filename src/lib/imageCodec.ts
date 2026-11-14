import type { ImageCodec } from "./pdfCompress";

export const canvasCodec: ImageCodec = async (source, size, quality) => {
  const bitmap =
    source.kind === "jpeg"
      ? await createImageBitmap(new Blob([source.bytes as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }), { colorSpaceConversion: "none" })
      : await createImageBitmap(new ImageData(source.rgba as Uint8ClampedArray<ArrayBuffer>, source.width, source.height));
  try {
    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      return null;
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    return blob.type === "image/jpeg" ? new Uint8Array(await blob.arrayBuffer()) : null;
  } finally {
    bitmap.close();
  }
};
