export type Rect = { x: number; y: number; width: number; height: number };

export function placeOverWindow(owner: Rect, workArea: Rect, size: { width: number; height: number }): Rect {
  const width = Math.min(size.width, workArea.width);
  const height = Math.min(size.height, workArea.height);
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  return {
    x: Math.round(clamp(owner.x + (owner.width - width) / 2, workArea.x, workArea.x + workArea.width - width)),
    y: Math.round(clamp(owner.y + (owner.height - height) / 2, workArea.y, workArea.y + workArea.height - height)),
    width,
    height,
  };
}
