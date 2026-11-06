export const SCREENS = [
  {
    id: "compare",
    label: "Compare",
    image: "compare",
    width: 1300,
    height: 960,
    caption:
      "Two versions side by side. Every changed, added, and removed word is highlighted on both, with a list of changes and linked scrolling.",
  },
  {
    id: "sign",
    label: "Sign",
    image: "sign",
    width: 1220,
    height: 960,
    caption:
      "Type, draw, or snap a photo of your signature. It goes on as sharp vector ink, and up to five stay saved for next time.",
  },
  {
    id: "markdown",
    label: "Markdown",
    image: "markdown",
    width: 1220,
    height: 960,
    caption:
      "Markdown files open formatted, with an outline and a minimap. ⇧⌘V flips to the source and back without losing your place.",
  },
  {
    id: "photos",
    label: "Photos to PDF",
    image: "photos",
    width: 1220,
    height: 960,
    caption:
      "Drop photos on the window and each one becomes a page. Phone photos land right side up, and JPEGs keep their original quality.",
  },
] as const;

export type ScreenId = (typeof SCREENS)[number]["id"];
