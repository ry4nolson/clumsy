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

export const FEATURES = [
  {
    title: "Reading",
    items: [
      "Tabs, split panes, and windows. Drag a tab anywhere, or out of the window.",
      "Thumbnails, outlines, and a Document Map showing where you are.",
      "Find with match case, whole words, regex, and accent-insensitive matching.",
      "Dark pages that invert the text and leave photos alone.",
    ],
  },
  {
    title: "Marking up",
    items: [
      "Highlights, text, freehand drawing, images, and signatures.",
      "Comments on any markup or text, plus sticky notes anywhere on a page.",
      "Fill in forms with Tab, reset them, or flatten them. Paper forms get checkmarks and dates.",
      "Everything saves straight back into the PDF.",
    ],
  },
  {
    title: "Changing pages",
    items: [
      "Reorder by dragging thumbnails. Rotate, delete, or extract.",
      "Insert pages from other PDFs or images, or combine several files.",
      "Make a new PDF from photos.",
      "Every page change can be undone.",
    ],
  },
  {
    title: "Comparing",
    items: [
      "Compare two PDFs side by side, word by word.",
      "Filter changes by added, removed, or changed.",
      "Export a comparison report as a PDF.",
      "Export pages as PNG or JPEG at up to 300 dpi.",
    ],
  },
  {
    title: "Markdown",
    items: [
      "Tables, task lists, footnotes, code highlighting, and local images.",
      "Edit the source with one shortcut and keep your place.",
      "Outline, minimap, find, and zoom.",
      "Reloads on its own when another app changes the file.",
    ],
  },
  {
    title: "Staying out of the way",
    items: [
      "Opens fast. No account, no sign-in, no subscription.",
      "Asks before overwriting a file another app changed.",
      "Updates install from inside the app.",
      "Restarting brings every window and tab back where it was.",
    ],
  },
] as const;

export const SHORTCUTS = [
  { keys: ["⇧", "⌘", "P"], label: "Command Palette", note: "Every command, searchable" },
  { keys: ["⌘", "P"], label: "Go to File", note: "Open tabs, then recent files" },
  { keys: ["⌘", "\\"], label: "Split Right", note: "Two documents, one window" },
  { keys: ["⌥", "⌘", "B"], label: "Document Map", note: "The whole file at a glance" },
  { keys: ["⇧", "⌘", "V"], label: "Markdown Source", note: "Rendered and back" },
  { keys: ["⇧", "⌘", "T"], label: "Reopen Closed Tab", note: "Right page, right zoom" },
  { keys: ["⌃", "-"], label: "Go Back", note: "Through links and searches" },
  { keys: ["Space"], label: "Hand Tool", note: "Hold to drag the page" },
] as const;
