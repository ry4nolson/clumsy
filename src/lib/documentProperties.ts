export type FormKind = "none" | "fillable" | "xfa";

export type PropertiesInput = {
  name: string;
  path: string | null;
  size: number | null;
  title: string | null;
  author: string | null;
  subject: string | null;
  keywords: string | null;
  created: Date | null;
  modified: Date | null;
  creator: string | null;
  producer: string | null;
  version: string | null;
  pageCount: number;
  pageNumber: number;
  pageSize: { width: number; height: number } | null;
  language: string | null;
  tagged: boolean;
  linearized: boolean;
  passwordToOpen: boolean;
  restricted: boolean;
  form: FormKind;
  signed: boolean;
  attachments: number;
  layers: number;
};

export type PropertySection = { title: string; rows: Array<[string, string]> };

const POINTS_PER_INCH = 72;
const MM_PER_INCH = 25.4;
const SIZE_TOLERANCE = 2;

const paperSizes: Array<[string, number, number]> = [
  ["Letter", 612, 792],
  ["Legal", 612, 1008],
  ["Tabloid", 792, 1224],
  ["Executive", 522, 756],
  ["ANSI C", 1224, 1584],
  ["ANSI D", 1584, 2448],
  ["ANSI E", 2448, 3168],
  ["ARCH A", 648, 864],
  ["ARCH B", 864, 1296],
  ["ARCH C", 1296, 1728],
  ["ARCH D", 1728, 2592],
  ["ARCH E1", 2160, 3024],
  ["ARCH E", 2592, 3456],
  ["A5", 420, 595],
  ["A4", 595, 842],
  ["A3", 842, 1191],
  ["A2", 1191, 1684],
  ["A1", 1684, 2384],
  ["A0", 2384, 3370],
  ["B5", 499, 709],
  ["B4", 709, 1001],
];

const imperialRegions = new Set(["US", "LR", "MM"]);

export function usesInches(locale: string) {
  try {
    const region = new Intl.Locale(locale).maximize().region;
    return !!region && imperialRegions.has(region);
  } catch {
    return false;
  }
}

export function paperName(width: number, height: number) {
  const [short, long] = width <= height ? [width, height] : [height, width];
  return paperSizes.find(([, w, h]) => Math.abs(w - short) <= SIZE_TOLERANCE && Math.abs(h - long) <= SIZE_TOLERANCE)?.[0] ?? null;
}

const trimmed = (value: number, digits: number) => String(Number(value.toFixed(digits)));

export function formatPageSize(width: number, height: number, locale: string) {
  const inches = usesInches(locale);
  const convert = (points: number) => (inches ? trimmed(points / POINTS_PER_INCH, 2) : trimmed((points / POINTS_PER_INCH) * MM_PER_INCH, 0));
  const measured = `${convert(width)} × ${convert(height)} ${inches ? "in" : "mm"}`;
  const name = paperName(width, height);
  const orientation = width > height ? "Landscape" : "Portrait";
  return `${measured} (${name ? `${name}, ` : ""}${orientation})`;
}

export function formatFileSize(bytes: number, locale: string) {
  const exact = `${new Intl.NumberFormat(locale).format(bytes)} bytes`;
  if (bytes < 1000) {
    return exact;
  }
  const [unit, divisor] = bytes < 1e6 ? (["kilobyte", 1e3] as const) : bytes < 1e9 ? (["megabyte", 1e6] as const) : (["gigabyte", 1e9] as const);
  const rounded = new Intl.NumberFormat(locale, { style: "unit", unit, maximumFractionDigits: 1 }).format(bytes / divisor);
  return `${rounded} (${exact})`;
}

export function folderOf(path: string | null) {
  if (!path || path.startsWith("content://")) {
    return null;
  }
  const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return at > 0 ? path.slice(0, at) : null;
}

const formDescriptions: Record<FormKind, string | null> = {
  none: null,
  fillable: "Fillable form",
  xfa: "XFA form. If the page only says to wait, Clumsy can't show this kind of form yet.",
};

function security({ passwordToOpen, restricted }: PropertiesInput) {
  if (passwordToOpen) {
    return "Needs a password to open";
  }
  return restricted ? "Restrictions set, no password to open" : null;
}

const yesNo = (value: boolean) => (value ? "Yes" : "No");

export function propertySections(input: PropertiesInput, locale: string): PropertySection[] {
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const count = (value: number, one: string, many: string) => (value ? `${new Intl.NumberFormat(locale).format(value)} ${value === 1 ? one : many}` : null);
  const sections: Array<{ title: string; rows: Array<[string, string | null]> }> = [
    {
      title: "File",
      rows: [
        ["Name", input.name],
        ["Location", folderOf(input.path)],
        ["Size", input.size === null ? null : formatFileSize(input.size, locale)],
      ],
    },
    {
      title: "Description",
      rows: [
        ["Title", input.title],
        ["Author", input.author],
        ["Subject", input.subject],
        ["Keywords", input.keywords],
      ],
    },
    {
      title: "Origin",
      rows: [
        ["Created", input.created && date.format(input.created)],
        ["Modified", input.modified && date.format(input.modified)],
        ["Application", input.creator],
        ["PDF producer", input.producer],
      ],
    },
    {
      title: "Document",
      rows: [
        ["PDF version", input.version],
        ["Pages", new Intl.NumberFormat(locale).format(input.pageCount)],
        [input.pageCount > 1 ? `Page size (page ${input.pageNumber})` : "Page size", input.pageSize && formatPageSize(input.pageSize.width, input.pageSize.height, locale)],
        ["Language", input.language],
        ["Tagged", yesNo(input.tagged)],
        ["Fast web view", yesNo(input.linearized)],
      ],
    },
    {
      title: "Contents",
      rows: [
        ["Security", security(input)],
        ["Form", formDescriptions[input.form]],
        ["Signatures", input.signed ? "Digitally signed" : null],
        ["Attachments", count(input.attachments, "file", "files")],
        ["Layers", count(input.layers, "layer", "layers")],
      ],
    },
  ];
  return sections
    .map(({ title, rows }) => ({ title, rows: rows.filter((row): row is [string, string] => !!row[1]?.trim()) }))
    .filter((section) => section.rows.length > 0);
}

export function cleanText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s{2,}/g, " ").trim();
  return text || null;
}

export function pageBoxSize(view: number[], rotate: number, userUnit = 1) {
  const [x1, y1, x2, y2] = view;
  const width = Math.abs(x2 - x1) * userUnit;
  const height = Math.abs(y2 - y1) * userUnit;
  return ((rotate % 180) + 180) % 180 === 90 ? { width: height, height: width } : { width, height };
}
