import { writeFileSync } from "node:fs";

const names = [
  "circle-check-big", "circle-x", "circle-alert", "circle-question-mark", "triangle-alert", "octagon-alert", "info", "ban",
  "check", "x", "star", "flag", "thumbs-up", "thumbs-down", "heart", "bookmark",
  "map-pin", "lock", "lock-open", "eye", "eye-off", "search", "clock", "calendar",
  "user", "users", "phone", "mail", "message-square", "pencil", "ruler", "wrench",
  "hammer", "hard-hat", "construction", "door-open", "zap", "plug", "lightbulb", "flame",
  "droplet", "wind", "fan", "thermometer", "camera", "image", "file-text", "clipboard-check",
  "clipboard-list", "list-checks", "trash", "shield-check", "badge-check", "stamp", "dollar-sign", "hash",
  "arrow-up", "arrow-down", "arrow-left", "arrow-right", "move", "circle-dot", "square", "circle", "triangle",
];

const n = (value) => Number(value ?? 0);
const fmt = (value) => String(Math.round(value * 1000) / 1000);
const arc = (rx, ry, x, y) => `A ${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(x)} ${fmt(y)}`;

function rectPath({ x, y, width, height, rx, ry }) {
  const [left, top, w, h] = [n(x), n(y), n(width), n(height)];
  const radiusX = Math.min(n(rx ?? ry), w / 2);
  const radiusY = Math.min(n(ry ?? rx), h / 2);
  if (!radiusX || !radiusY) {
    return `M ${fmt(left)} ${fmt(top)} H ${fmt(left + w)} V ${fmt(top + h)} H ${fmt(left)} Z`;
  }
  return [
    `M ${fmt(left + radiusX)} ${fmt(top)}`,
    `H ${fmt(left + w - radiusX)}`,
    arc(radiusX, radiusY, left + w, top + radiusY),
    `V ${fmt(top + h - radiusY)}`,
    arc(radiusX, radiusY, left + w - radiusX, top + h),
    `H ${fmt(left + radiusX)}`,
    arc(radiusX, radiusY, left, top + h - radiusY),
    `V ${fmt(top + radiusY)}`,
    arc(radiusX, radiusY, left + radiusX, top),
    "Z",
  ].join(" ");
}

const ellipsePath = (cx, cy, rx, ry) =>
  `M ${fmt(cx + rx)} ${fmt(cy)} A ${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx - rx)} ${fmt(cy)} A ${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx + rx)} ${fmt(cy)} Z`;

const argCounts = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

function normalizePath(d) {
  const tokens = [];
  let command = "";
  let index = 0;
  let argument = 0;
  const number = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i;
  while (index < d.length) {
    const char = d[index];
    if (/[\s,]/.test(char)) {
      index++;
    } else if (/[a-z]/i.test(char)) {
      command = char;
      argument = 0;
      tokens.push(char);
      index++;
    } else {
      const position = argument % (argCounts[command.toLowerCase()] || 1);
      const flag = command.toLowerCase() === "a" && (position === 3 || position === 4);
      const match = flag ? [char] : number.exec(d.slice(index));
      if (!match) {
        throw new Error(`Bad path ${d}`);
      }
      tokens.push(match[0]);
      index += match[0].length;
      argument++;
    }
  }
  return tokens.join(" ");
}

function elementPath([tag, attributes]) {
  switch (tag) {
    case "path":
      return normalizePath(attributes.d);
    case "line":
      return `M ${attributes.x1} ${attributes.y1} L ${attributes.x2} ${attributes.y2}`;
    case "polyline":
    case "polygon":
      return `M ${attributes.points.trim().replace(/\s+/g, " ")}${tag === "polygon" ? " Z" : ""}`;
    case "rect":
      return rectPath(attributes);
    case "circle":
      return ellipsePath(n(attributes.cx), n(attributes.cy), n(attributes.r), n(attributes.r));
    case "ellipse":
      return ellipsePath(n(attributes.cx), n(attributes.cy), n(attributes.rx), n(attributes.ry));
    default:
      throw new Error(`Unsupported Lucide element ${tag}`);
  }
}

const icons = await Promise.all(
  names.map(async (name) => {
    const { __iconData } = await import(new URL(`../node_modules/lucide-react/dist/esm/icons/${name}.mjs`, import.meta.url).href);
    return [name, __iconData.node.map(elementPath)];
  }),
);

const lines = icons.map(([name, paths]) => `  ${JSON.stringify(name)}: ${JSON.stringify(paths)},`);
writeFileSync(
  new URL("../src/lib/stampIcons.ts", import.meta.url),
  `export const lucideStampPaths: Record<string, string[]> = {\n${lines.join("\n")}\n};\n`,
);
