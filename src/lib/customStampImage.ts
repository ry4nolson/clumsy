import { MAX_IMAGE_CHARS, fitSize, nameFromFile, newCustomId, type CustomStamp, type ImageStamp } from "./customStamps";
import type { FileStamp, PixelStamp } from "./customStampPdf";

const LONGEST = 1024;
const SMALLEST = 16;
const JPEG_QUALITY = 0.9;
const FALLBACK_SIZE = 512;

const isSvg = (file: File) => file.type === "image/svg+xml" || /\.svg$/i.test(file.name);

async function loadImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Clumsy couldn't prepare that image.");
  }
  return { canvas, context };
}

function hasTransparency(context: CanvasRenderingContext2D, width: number, height: number) {
  const pixels = context.getImageData(0, 0, width, height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] < 255) {
      return true;
    }
  }
  return false;
}

const base64Of = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1);

export async function imageStampFrom(file: File): Promise<ImageStamp> {
  const image = await loadImage(file).catch(() => {
    throw new Error(`Clumsy couldn't read “${file.name}” as an image.`);
  });
  const naturalWidth = image.naturalWidth || FALLBACK_SIZE;
  const naturalHeight = image.naturalHeight || FALLBACK_SIZE;
  let size = fitSize(naturalWidth, naturalHeight, LONGEST, isSvg(file));
  let transparent: boolean | null = null;
  for (;;) {
    const { canvas, context } = canvasOf(size.width, size.height);
    context.drawImage(image, 0, 0, size.width, size.height);
    transparent ??= hasTransparency(context, size.width, size.height);
    const mime = transparent ? "image/png" : "image/jpeg";
    const data = base64Of(canvas.toDataURL(mime, JPEG_QUALITY));
    if (data.length <= MAX_IMAGE_CHARS) {
      return { id: newCustomId(), name: nameFromFile(file.name), kind: "image", mime, data, ...size };
    }
    if (Math.max(size.width, size.height) <= SMALLEST) {
      throw new Error(`“${file.name}” is too large to use as a stamp.`);
    }
    size = fitSize(size.width, size.height, Math.max(size.width, size.height) * 0.75, false);
  }
}

function imageStampFromPixels(stamp: PixelStamp): ImageStamp | null {
  try {
    const { canvas, context } = canvasOf(stamp.width, stamp.height);
    context.putImageData(new ImageData(new Uint8ClampedArray(stamp.rgba), stamp.width, stamp.height), 0, 0);
    return { id: stamp.id, name: stamp.name, kind: "image", mime: "image/png", data: base64Of(canvas.toDataURL("image/png")), width: stamp.width, height: stamp.height };
  } catch {
    return null;
  }
}

export const customStampsFrom = (stamps: FileStamp[]): CustomStamp[] =>
  stamps.flatMap((stamp) => (stamp.kind === "pixels" ? (imageStampFromPixels(stamp) ?? []) : [stamp]));
