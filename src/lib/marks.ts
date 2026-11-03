export type MarkKind = "check" | "cross" | "dot" | "date";

export const markKinds: MarkKind[] = ["check", "cross", "dot", "date"];

type Point = [number, number];

export type MarkShape = {
  lines: { curves: Array<{ points: number[] }>; thickness: number; width: number; height: number };
  description: string;
  heightInPage: number;
};

const BOX = 100;
const SIGNATURE_MARGIN = 3;

function contour(points: Point[], sharp: boolean) {
  const ring = [...points, points[0]];
  return (sharp ? ring.flatMap((point) => [point, point]) : ring).flat();
}

const check: Point[] = [
  [4, 54],
  [18, 40],
  [38, 60],
  [82, 12],
  [96, 26],
  [38, 88],
];

function cross(): Point[] {
  const arm = 10;
  const reach = 50;
  const plus: Point[] = [
    [-arm, -reach],
    [arm, -reach],
    [arm, -arm],
    [reach, -arm],
    [reach, arm],
    [arm, arm],
    [arm, reach],
    [-arm, reach],
    [-arm, arm],
    [-reach, arm],
    [-reach, -arm],
    [-arm, -arm],
  ];
  const turn = Math.SQRT1_2;
  return plus.map(([x, y]) => [BOX / 2 + (x - y) * turn, BOX / 2 + (x + y) * turn]);
}

function dot(): Point[] {
  return Array.from({ length: 24 }, (_, index) => {
    const angle = (index / 24) * Math.PI * 2;
    return [BOX / 2 + Math.cos(angle) * 40, BOX / 2 + Math.sin(angle) * 40];
  });
}

const shapes: Record<Exclude<MarkKind, "date">, { points: () => Point[]; sharp: boolean; description: string; heightInPage: number }> = {
  check: { points: () => check, sharp: true, description: "Checkmark", heightInPage: 11 },
  cross: { points: cross, sharp: true, description: "Cross", heightInPage: 9 },
  dot: { points: dot, sharp: false, description: "Dot", heightInPage: 5 },
};

export function markShape(kind: Exclude<MarkKind, "date">): MarkShape {
  const { points, sharp, description, heightInPage } = shapes[kind];
  return {
    lines: { curves: [{ points: contour(points(), sharp) }], thickness: 0, width: BOX, height: BOX },
    description,
    heightInPage: heightInPage + 2 * SIGNATURE_MARGIN,
  };
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

export function dateLabel(date: Date, locale?: string) {
  const formatted = new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" })
    .format(date)
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "")
    .trim();
  return /\d/.test(formatted) ? formatted : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
