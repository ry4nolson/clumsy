export type LengthUnit = "ft-in" | "ft" | "in" | "m" | "mm";

export type MeasureScale = { label: string; inchesPerPoint: number };

export type MeasureFormat = { unit: LengthUnit; precision: number };

export type MeasureKind = "measure-length" | "measure-path" | "measure-area";

export const measureKinds: MeasureKind[] = ["measure-length", "measure-path", "measure-area"];

export type ScaleGroup = "Architectural" | "Engineering" | "Metric";

export type ScalePreset = MeasureScale & { group: ScaleGroup };

export const POINTS_PER_INCH = 72;
const MM_PER_INCH = 25.4;

export const lengthUnits: LengthUnit[] = ["ft-in", "ft", "in", "m", "mm"];

export const isFractional = (unit: LengthUnit) => unit === "ft-in" || unit === "in";

export const fractionPrecisions = [16, 8, 4];
export const decimalPrecisions = [0, 1, 2];

export const defaultFormat: MeasureFormat = { unit: "ft-in", precision: 16 };

export const fullSize: MeasureScale = { label: "Full size (1:1)", inchesPerPoint: 1 / POINTS_PER_INCH };

const architectural = ["1/16", "3/32", "1/8", "3/16", "1/4", "3/8", "1/2", "3/4", "1", "1 1/2", "3"];
const engineering = [10, 20, 30, 40, 50, 60, 100];
const metric = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

function fractionValue(text: string) {
  return text.split(" ").reduce((sum, part) => {
    const [top, bottom] = part.split("/").map(Number);
    return sum + (bottom ? top / bottom : top);
  }, 0);
}

export const scalePresets: ScalePreset[] = [
  ...architectural.map((paper) => ({
    group: "Architectural" as const,
    label: `${paper}" = 1'-0"`,
    inchesPerPoint: 12 / (fractionValue(paper) * POINTS_PER_INCH),
  })),
  ...engineering.map((feet) => ({ group: "Engineering" as const, label: `1" = ${feet}'`, inchesPerPoint: (feet * 12) / POINTS_PER_INCH })),
  ...metric.map((ratio) => ({ group: "Metric" as const, label: `1:${ratio}`, inchesPerPoint: ratio / POINTS_PER_INCH })),
];

export const sameScale = (a: MeasureScale, b: MeasureScale) => Math.abs(a.inchesPerPoint - b.inchesPerPoint) <= 1e-9 * Math.max(a.inchesPerPoint, b.inchesPerPoint);

const unitInches: Record<string, number> = { ft: 12, in: 1, m: 1000 / MM_PER_INCH, cm: 10 / MM_PER_INCH, mm: 1 / MM_PER_INCH };

const unitPattern =
  /^(feet|foot|ft|'|inches|inch|in|"|millimeters?|millimetres?|mm|centimeters?|centimetres?|cm|meters?|metres?|m)(?![a-z])/;
const numberPattern = /^(?:(\d+)\/(\d+)|(\d+(?:\.\d+)?|\.\d+)(?:(?:\s+|\s*-\s*)(\d+)\/(\d+))?)/;

function unitOf(token: string) {
  if (token === "'" || token.startsWith("f")) {
    return "ft";
  }
  if (token === '"' || token.startsWith("i")) {
    return "in";
  }
  if (token.startsWith("mm") || token.startsWith("milli")) {
    return "mm";
  }
  if (token.startsWith("c")) {
    return "cm";
  }
  return "m";
}

const defaultParseUnit = (unit: LengthUnit) => (unit === "ft-in" ? "ft" : unit);

export function parseLength(text: string, fallback: LengthUnit = "ft-in"): number | null {
  let rest = text
    .toLowerCase()
    .replace(/[‘’′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/''/g, '"')
    .trim();
  const parts: { value: number; unit: string | null }[] = [];
  while (rest) {
    const number = numberPattern.exec(rest);
    if (!number) {
      return null;
    }
    const value = number[1] ? Number(number[1]) / Number(number[2]) : Number(number[3]) + (number[4] ? Number(number[4]) / Number(number[5]) : 0);
    if (!Number.isFinite(value)) {
      return null;
    }
    rest = rest.slice(number[0].length).trimStart();
    const unit = unitPattern.exec(rest);
    if (unit) {
      rest = rest.slice(unit[0].length);
    }
    parts.push({ value, unit: unit ? unitOf(unit[1]) : null });
    rest = rest.replace(/^[\s,-]+/, "");
  }
  if (!parts.length) {
    return null;
  }
  if (parts.length > 1 && !parts.at(-1)!.unit && parts.at(-2)!.unit === "ft") {
    parts.at(-1)!.unit = "in";
  }
  if (parts.length === 1 && !parts[0].unit) {
    parts[0].unit = defaultParseUnit(fallback);
  }
  const units = parts.map((part) => part.unit);
  if (units.some((unit) => !unit) || new Set(units).size !== units.length) {
    return null;
  }
  const inches = parts.reduce((sum, part) => sum + part.value * unitInches[part.unit!], 0);
  return inches > 0 ? inches : null;
}

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function decimal(value: number, places: number) {
  const [whole, fraction] = value.toFixed(places).split(".");
  return fraction ? `${group(whole)}.${fraction}` : group(whole);
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

function fraction(count: number, denominator: number) {
  const divisor = gcd(count, denominator);
  return `${count / divisor}/${denominator / divisor}`;
}

function wholeAndFraction(units: number, denominator: number) {
  const whole = Math.floor(units / denominator);
  const rest = units - whole * denominator;
  if (!rest) {
    return group(String(whole));
  }
  return whole ? `${group(String(whole))} ${fraction(rest, denominator)}` : fraction(rest, denominator);
}

export function formatInches(inches: number, { unit, precision }: MeasureFormat) {
  if (unit === "ft-in") {
    const steps = Math.round(inches * precision);
    const perFoot = 12 * precision;
    const feet = Math.floor(steps / perFoot);
    return `${group(String(feet))}' ${wholeAndFraction(steps - feet * perFoot, precision)}"`;
  }
  if (unit === "in") {
    return `${wholeAndFraction(Math.round(inches * precision), precision)}"`;
  }
  if (unit === "ft") {
    return `${decimal(inches / 12, precision)} ft`;
  }
  return `${decimal((inches * MM_PER_INCH) / (unit === "m" ? 1000 : 1), precision)} ${unit}`;
}

export const formatLength = (points: number, scale: MeasureScale, format: MeasureFormat) => formatInches(points * scale.inchesPerPoint, format);

const AREA_DECIMALS = 2;

export const areaPlaces = ({ unit, precision }: MeasureFormat) => (isFractional(unit) ? AREA_DECIMALS : precision);

export function formatArea(squarePoints: number, scale: MeasureScale, format: MeasureFormat) {
  const { unit } = format;
  const squareInches = squarePoints * scale.inchesPerPoint ** 2;
  const places = areaPlaces(format);
  if (unit === "ft-in" || unit === "ft") {
    return `${decimal(squareInches / 144, places)} sq ft`;
  }
  if (unit === "in") {
    return `${decimal(squareInches, places)} sq in`;
  }
  const perInch = unit === "m" ? MM_PER_INCH / 1000 : MM_PER_INCH;
  return `${decimal(squareInches * perInch ** 2, places)} ${unit}²`;
}

export function scaleFromCalibration(points: number, inches: number, format: MeasureFormat): MeasureScale | null {
  if (!(points > 0) || !(inches > 0)) {
    return null;
  }
  const inchesPerPoint = inches / points;
  const ratio = inchesPerPoint * POINTS_PER_INCH;
  if (unitIsMetric(format.unit)) {
    return { label: `1:${Number(ratio.toPrecision(4))}`, inchesPerPoint };
  }
  return { label: `1" = ${formatInches(ratio, format)}`, inchesPerPoint };
}

export const unitIsMetric = (unit: LengthUnit) => unit === "m" || unit === "mm";

export const lengthOf = ([x1, y1, x2, y2]: number[]) => Math.hypot(x2 - x1, y2 - y1);

export function pathLengthOf(vertices: number[]) {
  let total = 0;
  for (let index = 2; index + 1 < vertices.length; index += 2) {
    total += Math.hypot(vertices[index] - vertices[index - 2], vertices[index + 1] - vertices[index - 1]);
  }
  return total;
}

function signedArea(vertices: number[]) {
  let sum = 0;
  const count = vertices.length;
  for (let index = 0; index + 1 < count; index += 2) {
    const next = (index + 2) % count;
    sum += vertices[index] * vertices[next + 1] - vertices[next] * vertices[index + 1];
  }
  return sum / 2;
}

export const areaOf = (vertices: number[]) => (vertices.length < 6 ? 0 : Math.abs(signedArea(vertices)));

export function measureCaption(kind: MeasureKind, points: number[], scale: MeasureScale, format: MeasureFormat) {
  if (kind === "measure-area") {
    return formatArea(areaOf(points), scale, format);
  }
  return formatLength(kind === "measure-length" ? lengthOf(points) : pathLengthOf(points), scale, format);
}

export function uprightAngle(angle: number, pageRotation = 0) {
  const onScreen = angle - (pageRotation * Math.PI) / 180;
  const normalized = Math.atan2(Math.sin(onScreen), Math.cos(onScreen));
  const turned = normalized > Math.PI / 2 + 1e-9 || normalized <= -Math.PI / 2 + 1e-9 ? angle + Math.PI : angle;
  return Math.atan2(Math.sin(turned), Math.cos(turned));
}

export type Caption = { x: number; y: number; angle: number };

export function lineCaption([x1, y1, x2, y2]: number[], pageRotation = 0): Caption {
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2, angle: uprightAngle(Math.atan2(y2 - y1, x2 - x1), pageRotation) };
}

export function pathCaption(vertices: number[], pageRotation = 0): Caption {
  let longest: number[] | undefined;
  let longestLength = 0;
  for (let index = 2; index + 1 < vertices.length; index += 2) {
    const segment = vertices.slice(index - 2, index + 2);
    const length = Math.hypot(segment[2] - segment[0], segment[3] - segment[1]);
    if (length > longestLength) {
      [longest, longestLength] = [segment, length];
    }
  }
  if (!longest) {
    return { x: vertices[0] ?? 0, y: vertices[1] ?? 0, angle: 0 };
  }
  const [x1, y1, x2, y2] = longest;
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2, angle: uprightAngle(Math.atan2(y2 - y1, x2 - x1), pageRotation) };
}

export function snapPoint([x1, y1]: number[], [x2, y2]: number[]) {
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(y2 - y1, x2 - x1) / step) * step;
  const reach = (x2 - x1) * Math.cos(angle) + (y2 - y1) * Math.sin(angle);
  return [x1 + reach * Math.cos(angle), y1 + reach * Math.sin(angle)];
}

function distanceToEdges(x: number, y: number, vertices: number[]) {
  let inside = false;
  let nearest = Infinity;
  const count = vertices.length;
  for (let index = 0, previous = count - 2; index < count; previous = index, index += 2) {
    const [ax, ay, bx, by] = [vertices[index], vertices[index + 1], vertices[previous], vertices[previous + 1]];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) {
      inside = !inside;
    }
    const dx = bx - ax;
    const dy = by - ay;
    const span = dx * dx + dy * dy;
    const t = span ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / span)) : 0;
    nearest = Math.min(nearest, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return inside ? nearest : -nearest;
}

export const insidePolygon = (x: number, y: number, vertices: number[]) => distanceToEdges(x, y, vertices) > 0;

function centroid(vertices: number[]) {
  const area = signedArea(vertices);
  const count = vertices.length;
  if (!area) {
    const pairs = count / 2;
    let sx = 0;
    let sy = 0;
    for (let index = 0; index + 1 < count; index += 2) {
      sx += vertices[index];
      sy += vertices[index + 1];
    }
    return [sx / pairs, sy / pairs];
  }
  let cx = 0;
  let cy = 0;
  for (let index = 0; index + 1 < count; index += 2) {
    const next = (index + 2) % count;
    const cross = vertices[index] * vertices[next + 1] - vertices[next] * vertices[index + 1];
    cx += (vertices[index] + vertices[next]) * cross;
    cy += (vertices[index + 1] + vertices[next + 1]) * cross;
  }
  return [cx / (6 * area), cy / (6 * area)];
}

type Cell = { x: number; y: number; half: number; distance: number; best: number };

const cellAt = (x: number, y: number, half: number, vertices: number[]): Cell => {
  const distance = distanceToEdges(x, y, vertices);
  return { x, y, half, distance, best: distance + half * Math.SQRT2 };
};

const MAX_CELLS = 5000;

export function labelPoint(vertices: number[], precision = 0.5): number[] {
  if (vertices.length < 6) {
    return centroid(vertices);
  }
  const xs = vertices.filter((_, index) => index % 2 === 0);
  const ys = vertices.filter((_, index) => index % 2 === 1);
  const [minX, minY, maxX, maxY] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const size = Math.min(maxX - minX, maxY - minY);
  const [cx, cy] = centroid(vertices);
  if (!size) {
    return [cx, cy];
  }
  let best = cellAt(cx, cy, 0, vertices);
  const middle = cellAt(minX + (maxX - minX) / 2, minY + (maxY - minY) / 2, 0, vertices);
  if (middle.distance > best.distance) {
    best = middle;
  }
  const queue: Cell[] = [];
  const half = size / 2;
  for (let x = minX; x < maxX; x += size) {
    for (let y = minY; y < maxY; y += size) {
      queue.push(cellAt(x + half, y + half, half, vertices));
    }
  }
  let examined = 0;
  while (queue.length && examined < MAX_CELLS) {
    queue.sort((a, b) => a.best - b.best);
    const cell = queue.pop()!;
    examined += 1;
    if (cell.distance > best.distance) {
      best = cell;
    }
    if (cell.best - best.distance <= precision) {
      continue;
    }
    const quarter = cell.half / 2;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      queue.push(cellAt(cell.x + dx * quarter, cell.y + dy * quarter, quarter, vertices));
    }
  }
  return [best.x, best.y];
}
