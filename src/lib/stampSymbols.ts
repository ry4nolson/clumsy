import { lucideStampPaths } from "./stampIcons";

export const ELECTRICAL_PREFIX = "elec:";
export const REVIEW_PREFIX = "review:";
export const DEFAULT_STAMP = "review:approved";

const ELECTRICAL_STROKE = 1.5;
const ICON_STROKE = 2;
const REVIEW_STROKE = 2.5;
export const CAP_HEIGHT = 0.72;
const WORD_SIZE = 16;
const DATE_SIZE = 8;
const REVIEW_HEIGHT = 40;

export const ELECTRICAL_CATEGORIES = ["Power", "Lighting", "Switches & Controls", "Low Voltage", "Fire Alarm"] as const;
export type StampCategory = (typeof ELECTRICAL_CATEGORIES)[number];

export type StampShape = { d: string; fill?: boolean; strokeWidth?: number };
export type StampLabel = { text: string; x: number; y: number; size: number };
export type StampDesign = { width: number; height: number; strokeWidth: number; shapes: StampShape[]; labels: StampLabel[] };
export type StampSymbol = { id: string; label: string; category: StampCategory; keywords: string[]; shapes: StampShape[]; labels?: StampLabel[] };
export type ReviewStamp = { id: string; label: string; word: string; color: number[] };

const circle = (cx: number, cy: number, r: number): string => `M ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} Z`;
const rect = (x: number, y: number, width: number, height: number): string => `M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`;
const line = (x1: number, y1: number, x2: number, y2: number): string => `M ${x1} ${y1} L ${x2} ${y2}`;
const polygon = (...points: [number, number][]): string => points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ") + " Z";
const stroke = (d: string): StampShape => ({ d });
const filled = (d: string): StampShape => ({ d, fill: true });
const label = (text: string, x: number, y: number, size: number): StampLabel => ({ text, x, y, size });
const receptacleBody = (cy: number, radius: number, lineOffsets: number[], leftX: number): StampShape[] => {
  const cx = 13;
  return [
    stroke(circle(cx, cy, radius)),
    ...lineOffsets.map((offset) => {
      const halfChord = Math.sqrt(radius * radius - offset * offset);
      return stroke(line(leftX, cy + offset, cx + halfChord, cy + offset));
    }),
  ];
};

const symbol = (id: string, labelText: string, category: StampCategory, keywords: string[], shapes: StampShape[], labels?: StampLabel[]): StampSymbol => ({
  id: `${ELECTRICAL_PREFIX}${id}`,
  label: labelText,
  category,
  keywords,
  shapes,
  labels,
});

const circleBadge = (text: string, size: number, radius = 8.5): [StampShape[], StampLabel[]] => [[stroke(circle(12, 12, radius))], [label(text, 12, 12, size)]];
const boxBadge = (text: string, size: number, x: number, y: number, width: number, height: number): [StampShape[], StampLabel[]] => [
  [stroke(rect(x, y, width, height))],
  [label(text, x + width / 2, y + height / 2, size)],
];
const switchGlyph = (subscript?: string, subscriptSize = 7): StampLabel[] =>
  subscript ? [label("S", 9.5, 11.5, 14), label(subscript, 18.5, 17, subscriptSize)] : [label("S", 12, 12, 14)];

const triangleOutlet = (text?: string, size = 6): [StampShape[], StampLabel[]] => [
  [stroke(polygon([12, 3], [21.5, 20.5], [2.5, 20.5]))],
  text ? [label(text, 12, 15.5, size)] : [],
];

export const electricalStamps: readonly StampSymbol[] = [
  symbol("receptacle-duplex", "Duplex Receptacle", "Power", ["receptacle", "outlet", "duplex", "plug", "power"], receptacleBody(12, 6.5, [-2.25, 2.25], 1.5)),
  symbol("receptacle-single", "Single Receptacle", "Power", ["receptacle", "outlet", "single", "simplex"], receptacleBody(12, 6.5, [0], 1.5)),
  symbol(
    "receptacle-quad",
    "Quadruplex Receptacle",
    "Power",
    ["receptacle", "outlet", "quad", "fourplex", "quadruplex"],
    [
      ...receptacleBody(12, 6.5, [-2.25, 2.25], 1.5),
      stroke(line(10.75, 12 - Math.sqrt(6.5 * 6.5 - 2.25 * 2.25), 10.75, 12 + Math.sqrt(6.5 * 6.5 - 2.25 * 2.25))),
      stroke(line(15.25, 12 - Math.sqrt(6.5 * 6.5 - 2.25 * 2.25), 15.25, 12 + Math.sqrt(6.5 * 6.5 - 2.25 * 2.25))),
    ],
  ),
  symbol("receptacle-gfci", "GFCI Receptacle", "Power", ["receptacle", "outlet", "gfci", "gfi", "ground fault"], receptacleBody(9.5, 5.5, [-2, 2], 2.5), [
    label("GFI", 12, 19.5, 6.5),
  ]),
  symbol(
    "receptacle-wp",
    "Weatherproof Receptacle",
    "Power",
    ["receptacle", "outlet", "weatherproof", "wp", "exterior"],
    receptacleBody(9.5, 5.5, [-2, 2], 2.5),
    [label("WP", 12, 19.5, 6.5)],
  ),
  symbol(
    "receptacle-special",
    "Special-Purpose Receptacle",
    "Power",
    ["receptacle", "outlet", "special", "dedicated", "equipment"],
    [stroke(circle(12, 12, 7.5)), filled(polygon([12, 7.5], [16, 15], [8, 15]))],
  ),
  symbol(
    "receptacle-floor",
    "Floor Receptacle",
    "Power",
    ["receptacle", "outlet", "floor", "floor box"],
    [
      stroke(rect(3, 3, 18, 18)),
      stroke(circle(12, 12, 5.5)),
      stroke(line(4.5, 10, 12 + Math.sqrt(5.5 * 5.5 - 4), 10)),
      stroke(line(4.5, 14, 12 + Math.sqrt(5.5 * 5.5 - 4), 14)),
    ],
  ),
  symbol("junction-box", "Junction Box", "Power", ["junction", "j-box", "jbox", "box"], ...circleBadge("J", 10, 8)),
  symbol(
    "disconnect",
    "Disconnect Switch",
    "Power",
    ["disconnect", "safety switch", "switch"],
    [stroke(rect(4.5, 6, 15, 12)), stroke(line(8, 15, 15.5, 8.5)), filled(circle(8, 15, 1.2))],
  ),
  symbol("motor", "Motor", "Power", ["motor", "mechanical", "equipment"], ...circleBadge("M", 10, 8)),
  symbol("panelboard", "Panelboard", "Power", ["panel", "panelboard", "breaker", "distribution"], [filled(rect(8, 2.5, 8, 19))]),
  symbol("transformer", "Transformer", "Power", ["transformer", "xfmr", "dry type"], ...boxBadge("T", 10, 3.5, 5, 17, 14)),
  symbol("generator", "Generator", "Power", ["generator", "standby", "emergency power"], ...circleBadge("G", 10, 8)),
  symbol("ups", "UPS", "Power", ["ups", "uninterruptible", "battery"], ...boxBadge("UPS", 6.5, 2.5, 6, 19, 12)),
  symbol(
    "ground",
    "Ground",
    "Power",
    ["ground", "grounding", "earth", "bond"],
    [stroke(line(12, 3, 12, 10)), stroke(line(4, 10, 20, 10)), stroke(line(7, 14, 17, 14)), stroke(line(10, 18, 14, 18))],
  ),
  symbol("fixture-troffer", "Recessed Troffer 2x4", "Lighting", ["light", "fixture", "troffer", "2x4", "fluorescent", "led"], [stroke(rect(1.5, 7, 21, 10))]),
  symbol("fixture-2x2", "Recessed Troffer 2x2", "Lighting", ["light", "fixture", "troffer", "2x2", "led"], [stroke(rect(4, 4, 16, 16))]),
  symbol(
    "fixture-downlight",
    "Recessed Downlight",
    "Lighting",
    ["light", "fixture", "downlight", "can", "recessed"],
    [stroke(circle(12, 12, 7.5)), filled(circle(12, 12, 2))],
  ),
  symbol(
    "fixture-surface",
    "Surface Ceiling Fixture",
    "Lighting",
    ["light", "fixture", "surface", "ceiling"],
    [
      stroke(circle(12, 12, 6)),
      stroke(line(16.24, 16.24, 18.72, 18.72)),
      stroke(line(7.76, 7.76, 5.28, 5.28)),
      stroke(line(16.24, 7.76, 18.72, 5.28)),
      stroke(line(7.76, 16.24, 5.28, 18.72)),
    ],
  ),
  symbol(
    "fixture-wall",
    "Wall Sconce",
    "Lighting",
    ["light", "fixture", "wall", "sconce", "wall pack"],
    [stroke(circle(14.5, 12, 5.5)), stroke(line(2, 12, 9, 12))],
  ),
  symbol("fixture-strip", "Strip Fixture", "Lighting", ["light", "fixture", "strip", "linear"], [stroke(rect(1.5, 9.5, 21, 5))]),
  symbol("exit-sign", "Exit Sign", "Lighting", ["exit", "sign", "egress", "life safety"], ...boxBadge("EXIT", 6, 1.5, 7, 21, 10)),
  symbol(
    "emergency-light",
    "Emergency Battery Light",
    "Lighting",
    ["emergency", "battery", "egress", "bug eye", "life safety"],
    [stroke(rect(5, 12, 14, 8.5)), stroke(circle(8.5, 8, 2.75)), stroke(circle(15.5, 8, 2.75))],
  ),
  symbol(
    "pole-light",
    "Pole Light",
    "Lighting",
    ["pole", "site", "parking", "exterior", "light"],
    [stroke(circle(12, 7.5, 5)), stroke(line(12, 12.5, 12, 21)), stroke(line(7.5, 21, 16.5, 21))],
  ),
  symbol("occupancy-sensor", "Ceiling Occupancy Sensor", "Lighting", ["occupancy", "sensor", "vacancy", "motion", "lighting control"], ...circleBadge("OS", 7)),
  symbol("switch", "Single-Pole Switch", "Switches & Controls", ["switch", "single pole", "light switch"], [], switchGlyph()),
  symbol("switch-3way", "3-Way Switch", "Switches & Controls", ["switch", "3-way", "three way", "three-way"], [], switchGlyph("3")),
  symbol("switch-4way", "4-Way Switch", "Switches & Controls", ["switch", "4-way", "four way", "four-way"], [], switchGlyph("4")),
  symbol("switch-dimmer", "Dimmer Switch", "Switches & Controls", ["switch", "dimmer", "dimming"], [], switchGlyph("D")),
  symbol("switch-keyed", "Key Switch", "Switches & Controls", ["switch", "key", "keyed"], [], switchGlyph("K")),
  symbol("switch-timer", "Timer Switch", "Switches & Controls", ["switch", "timer", "time clock"], [], switchGlyph("T")),
  symbol("switch-occupancy", "Occupancy Sensor Switch", "Switches & Controls", ["switch", "occupancy", "vacancy", "sensor"], [], switchGlyph("OS", 6)),
  symbol("photocell", "Photocell", "Switches & Controls", ["photocell", "daylight", "pc", "lighting control"], ...circleBadge("PC", 7)),
  symbol("thermostat", "Thermostat", "Switches & Controls", ["thermostat", "hvac", "temperature"], ...circleBadge("T", 10)),
  symbol("data-outlet", "Data Outlet", "Low Voltage", ["data", "network", "ethernet", "cat6", "outlet"], ...triangleOutlet()),
  symbol("telephone-outlet", "Telephone Outlet", "Low Voltage", ["telephone", "phone", "voice", "outlet"], ...triangleOutlet("T")),
  symbol("voice-data-outlet", "Voice/Data Outlet", "Low Voltage", ["voice", "data", "combination", "outlet"], ...triangleOutlet("VD", 5)),
  symbol("tv-outlet", "TV Outlet", "Low Voltage", ["tv", "television", "catv", "coax", "outlet"], ...triangleOutlet("TV", 5)),
  symbol("wap", "Wireless Access Point", "Low Voltage", ["wireless", "wap", "wifi", "access point"], ...circleBadge("WAP", 5.5)),
  symbol(
    "camera",
    "Security Camera",
    "Low Voltage",
    ["camera", "cctv", "security", "surveillance"],
    [stroke(rect(2.5, 8, 9.5, 8)), stroke(polygon([12, 10.5], [20.5, 6.5], [20.5, 17.5], [12, 13.5]))],
  ),
  symbol("speaker", "Speaker", "Low Voltage", ["speaker", "audio", "paging", "sound"], [stroke(rect(4, 4, 16, 16)), stroke(circle(12, 12, 5))]),
  symbol("card-reader", "Card Reader", "Low Voltage", ["card reader", "access control", "badge", "security"], ...boxBadge("CR", 7, 4, 5, 16, 14)),
  symbol("smoke-detector", "Smoke Detector", "Fire Alarm", ["smoke", "detector", "fire alarm"], ...circleBadge("SD", 7)),
  symbol("heat-detector", "Heat Detector", "Fire Alarm", ["heat", "detector", "fire alarm"], ...circleBadge("HD", 7)),
  symbol("pull-station", "Manual Pull Station", "Fire Alarm", ["pull station", "manual", "fire alarm"], ...boxBadge("F", 10, 4, 4, 16, 16)),
  symbol("horn-strobe", "Horn/Strobe", "Fire Alarm", ["horn", "strobe", "notification", "fire alarm"], ...boxBadge("H/S", 6, 3, 5, 18, 14)),
  symbol("facp", "Fire Alarm Control Panel", "Fire Alarm", ["facp", "fire alarm", "control panel"], ...boxBadge("FACP", 5, 1.5, 6, 21, 12)),
];

export const reviewStamps: ReviewStamp[] = [
  { id: "review:approved", label: "Approved", word: "APPROVED", color: [0.13, 0.55, 0.25] },
  { id: "review:rejected", label: "Rejected", word: "REJECTED", color: [0.8, 0.13, 0.15] },
  { id: "review:reviewed", label: "Reviewed", word: "REVIEWED", color: [0.12, 0.38, 0.75] },
  { id: "review:for-review", label: "For Review", word: "FOR REVIEW", color: [0.12, 0.38, 0.75] },
  { id: "review:draft", label: "Draft", word: "DRAFT", color: [0.85, 0.42, 0.05] },
  { id: "review:confidential", label: "Confidential", word: "CONFIDENTIAL", color: [0.8, 0.13, 0.15] },
  { id: "review:void", label: "Void", word: "VOID", color: [0.8, 0.13, 0.15] },
];

export const iconStamps = Object.keys(lucideStampPaths);

const electricalById = new Map(electricalStamps.map((entry) => [entry.id, entry]));
const reviewById = new Map(reviewStamps.map((entry) => [entry.id, entry]));

export const electricalStamp = (id: string) => electricalById.get(id);
export const reviewStamp = (id: string) => reviewById.get(id);
export const isKnownStamp = (id: string) => electricalById.has(id) || reviewById.has(id) || Object.hasOwn(lucideStampPaths, id);

const titleCase = (value: string) =>
  value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const stampLabel = (id: string) => electricalStamp(id)?.label ?? reviewStamp(id)?.label ?? titleCase(id);

export const electricalByCategory = () =>
  ELECTRICAL_CATEGORIES.map((category) => ({ category, symbols: electricalStamps.filter((entry) => entry.category === category) }));

export function searchStamps(query: string) {
  const needle = query.trim().toLowerCase();
  const matches = (...values: string[]) => !needle || values.some((value) => value.toLowerCase().includes(needle));
  return {
    review: reviewStamps.filter((entry) => matches(entry.label)),
    icons: iconStamps.filter((id) => matches(id.replace(/-/g, " "), id)),
    electrical: electricalStamps.filter((entry) => matches(entry.label, entry.id.slice(ELECTRICAL_PREFIX.length).replace(/-/g, " "), ...entry.keywords)),
  };
}

const BOLD_WIDTHS: Record<string, number> = { I: 0.278, J: 0.556, L: 0.611, M: 0.833, W: 0.944, " ": 0.278, "/": 0.278, "-": 0.333 };
const wordWidth = (text: string, size: number) => [...text].reduce((sum, char) => sum + (BOLD_WIDTHS[char] ?? (/[0-9]/.test(char) ? 0.556 : 0.722)), 0) * size;

export function reviewWidth(word: string) {
  return Math.ceil(Math.max(wordWidth(word, WORD_SIZE), 90) + 24);
}

function reviewDesign(word: string, date: string | null): StampDesign {
  const width = reviewWidth(word);
  const inset = REVIEW_STROKE / 2 + 1;
  const radius = 6;
  const [left, top, right, bottom] = [inset, inset, width - inset, REVIEW_HEIGHT - inset];
  const box = [
    `M ${left + radius} ${top} H ${right - radius} A ${radius} ${radius} 0 0 1 ${right} ${top + radius}`,
    `V ${bottom - radius} A ${radius} ${radius} 0 0 1 ${right - radius} ${bottom}`,
    `H ${left + radius} A ${radius} ${radius} 0 0 1 ${left} ${bottom - radius}`,
    `V ${top + radius} A ${radius} ${radius} 0 0 1 ${left + radius} ${top} Z`,
  ].join(" ");
  const labels = date ? [label(word, width / 2, 16, WORD_SIZE), label(date, width / 2, 31, DATE_SIZE)] : [label(word, width / 2, REVIEW_HEIGHT / 2, WORD_SIZE)];
  return { width, height: REVIEW_HEIGHT, strokeWidth: REVIEW_STROKE, shapes: [{ d: box }], labels };
}

export function stampDesign(id: string, date: string | null = null): StampDesign | null {
  const review = reviewStamp(id);
  if (review) {
    return reviewDesign(review.word, date);
  }
  const electrical = electricalStamp(id);
  if (electrical) {
    return { width: 24, height: 24, strokeWidth: ELECTRICAL_STROKE, shapes: electrical.shapes, labels: electrical.labels ?? [] };
  }
  const paths = Object.hasOwn(lucideStampPaths, id) ? lucideStampPaths[id] : null;
  return paths ? { width: 24, height: 24, strokeWidth: ICON_STROKE, shapes: paths.map((d) => ({ d })), labels: [] } : null;
}

export const stampAspect = (id: string) => {
  const design = stampDesign(id);
  return design ? design.width / design.height : 1;
};
