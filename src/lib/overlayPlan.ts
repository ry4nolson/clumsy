import type { Matrix } from "./contentPlacements";
import type { OverlayPair } from "./overlayPairs";

export type Rgb = [number, number, number];

export type OverlayColorsId = "red-blue" | "red-green" | "magenta-green";

export type OverlayColors = { id: OverlayColorsId; label: string; previousName: string; currentName: string; previous: Rgb; current: Rgb };

export const overlayColorChoices: OverlayColors[] = [
  { id: "red-blue", label: "Red and blue", previousName: "red", currentName: "blue", previous: [1, 0, 0], current: [0, 0.2, 1] },
  { id: "red-green", label: "Red and green", previousName: "red", currentName: "green", previous: [1, 0, 0], current: [0, 0.7, 0.15] },
  { id: "magenta-green", label: "Magenta and green", previousName: "magenta", currentName: "green", previous: [1, 0, 1], current: [0, 0.7, 0.15] },
];

export const overlayColors = (value: unknown) => overlayColorChoices.find((choice) => choice.id === value) ?? overlayColorChoices[0];

export const cssColor = ([red, green, blue]: Rgb) => `rgb(${Math.round(red * 255)} ${Math.round(green * 255)} ${Math.round(blue * 255)})`;

export type ChangeBox = { left: number; bottom: number; right: number; top: number };

export type OverlaySheet = OverlayPair & { label: string; alignment?: Matrix; changes?: ChangeBox[] };

export type OverlayOptions = {
  sheets: OverlaySheet[];
  previous: Rgb;
  current: Rgb;
  previousName: string;
  currentName: string;
};

export const CHANGE_SUBJECT = "Overlay change";
export const PREVIOUS_LAYER = "Previous";
export const CURRENT_LAYER = "Current";

export const layerName = (side: string, file: string) => `${side}: ${file.replace(/\.pdf$/i, "")}`;
