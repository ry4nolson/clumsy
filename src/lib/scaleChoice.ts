import {
  POINTS_PER_INCH,
  decimalPrecisions,
  defaultFormat,
  fractionPrecisions,
  fullSize,
  isFractional,
  parseLength,
  sameScale,
  scaleFromCalibration,
  scalePresets,
  type LengthUnit,
  type MeasureFormat,
  type MeasureScale,
} from "./measure";
import type { PageScale } from "./measurePdf";

export const FULL_SIZE = "full";
export const CUSTOM = "custom";
export const CALIBRATED = "calibrated";

export type ScaleDraft = { allPages: boolean; unit: LengthUnit; precision: number };
export type Calibration = ScaleDraft & { points: number };

export const unitNames: Record<LengthUnit, string> = {
  "ft-in": "Feet and inches",
  ft: "Decimal feet",
  in: "Inches",
  m: "Meters",
  mm: "Millimeters",
};

export const presetKey = (index: number) => `preset-${index}`;

export function scaleKey(scale: MeasureScale) {
  const named = scalePresets.findIndex((preset) => preset.label === scale.label && sameScale(preset, scale));
  if (named >= 0) {
    return presetKey(named);
  }
  if (sameScale(scale, fullSize)) {
    return FULL_SIZE;
  }
  const index = scalePresets.findIndex((preset) => sameScale(preset, scale));
  return index >= 0 ? presetKey(index) : CUSTOM;
}

export function scaleForKey(key: string): MeasureScale | null {
  if (key === FULL_SIZE) {
    return fullSize;
  }
  const preset = key.startsWith("preset-") ? scalePresets[Number(key.slice("preset-".length))] : undefined;
  return preset ? { label: preset.label, inchesPerPoint: preset.inchesPerPoint } : null;
}

export function customScale(paper: string, real: string, unit: LengthUnit): MeasureScale | null {
  const paperInches = parseLength(paper, "in");
  const realInches = parseLength(real, unit);
  if (!paperInches || !realInches || paperInches <= 0 || realInches <= 0) {
    return null;
  }
  return { label: `${paper.trim()} = ${real.trim()}`, inchesPerPoint: realInches / (paperInches * POINTS_PER_INCH) };
}

export const calibratedScale = (points: number, real: string, format: MeasureFormat) => scaleFromCalibration(points, parseLength(real, format.unit) ?? 0, format);

export function precisionOptions(unit: LengthUnit): Array<[number, string]> {
  if (isFractional(unit)) {
    return fractionPrecisions.map((denominator) => [denominator, `1/${denominator}"`]);
  }
  return decimalPrecisions.map((places) => [places, places ? `0.${"0".repeat(places)}` : "0"]);
}

export function fittedFormat(unit: LengthUnit, precision: number): MeasureFormat {
  const options = precisionOptions(unit).map(([value]) => value);
  return { unit, precision: options.includes(precision) ? precision : isFractional(unit) ? fractionPrecisions[0] : 2 };
}

export function startingScale(scales: Array<PageScale | null>, pages: number[]): PageScale {
  const own = pages.map((page) => scales[page]).find((scale) => scale);
  return own ?? scales.find((scale) => scale) ?? { scale: fullSize, format: defaultFormat };
}

const sameFormat = (a: MeasureFormat, b: MeasureFormat) => a.unit === b.unit && a.precision === b.precision;

export function changesScale(scales: Array<PageScale | null>, pages: number[], next: PageScale | null) {
  return pages.some((page) => {
    const current = scales[page] ?? null;
    if (!current || !next) {
      return current !== next;
    }
    return !sameScale(current.scale, next.scale) || current.scale.label !== next.scale.label || !sameFormat(current.format, next.format);
  });
}
