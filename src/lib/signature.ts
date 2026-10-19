const STORAGE_KEY = "pdf-viewer.signature";

export function loadSavedSignature() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeSignature(dataUrl: string | null) {
  try {
    if (dataUrl) {
      localStorage.setItem(STORAGE_KEY, dataUrl);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    return;
  }
}

export function inkBounds(data: Uint8ClampedArray, width: number, height: number) {
  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export function trimmedSignature(canvas: HTMLCanvasElement, padding = 8) {
  const context = canvas.getContext("2d")!;
  const bounds = inkBounds(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  if (!bounds) {
    return null;
  }
  const output = document.createElement("canvas");
  output.width = bounds.width + padding * 2;
  output.height = bounds.height + padding * 2;
  output.getContext("2d")!.drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, padding, padding, bounds.width, bounds.height);
  return output.toDataURL("image/png");
}

export async function dataUrlToFile(dataUrl: string, name: string) {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type });
}
