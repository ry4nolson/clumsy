# Custom stamps plan

Written 2026-11-16 against `main` at v0.20.0. Adds your own stamps to the Stamps picker: an image (PNG, JPEG, or SVG) or a word in a color, like the review stamps. They place, resize, save, and reopen exactly like the built-in stamps, and they're independent of the Tool chest (ry4nolson/clumsy#38).

## What a custom stamp is

```ts
type CustomStamp =
  | { id: string; name: string; kind: "text"; text: string; color: number[]; date: boolean }
  | { id: string; name: string; kind: "image"; mime: "image/png" | "image/jpeg"; data: string; width: number; height: number };
```

- **Ids** are `custom:<uuid>`, made once when the stamp is created and never changed or reused. Like every stamp id they're saved state: a placed stamp writes `/Name /Clumsy:custom:<uuid>`. Renaming changes only `name`.
- **Text stamps** draw like a review stamp (outlined rounded box, Helvetica Bold word, optional date line under it) in their own color. The text is limited to 40 characters and to WinAnsi (anything else becomes `?`, as review labels do), since the appearance uses the standard Helvetica Bold without embedding a font.
- **Image stamps** are normalized once, when added, in the webview: decoded through an `<img>` (which also rasterizes SVG and applies JPEG orientation), drawn into a canvas no larger than 1024 px on its longest side (SVGs are drawn at that size, rasters are never enlarged), and stored as PNG when any pixel is transparent, otherwise JPEG at 0.9. If the encoded image is still over 600,000 base64 characters it's scaled down by a quarter until it fits. `data` is base64 without the `data:` prefix. SVGs become raster images: pdf-lib can only draw path data, and arbitrary SVG (text, gradients, CSS) can't be turned into PDF operators faithfully.

## Storage

- **`clumsy.customStamps`** in localStorage, a JSON array, like `clumsy.signatures`. Every window reads it on start and on the `storage` event, so a stamp added, renamed, or deleted in one window shows in the others. Parsing drops anything malformed.
- **Caps**: at most 50 stamps and 2,000,000 characters of JSON in all (localStorage is about 5 MB per origin and shared with every other preference). Adding past either cap is refused with a message saying to delete some first; a failed `setItem` (quota) is reported the same way and changes nothing.
- **A registry** (`src/lib/customStamps.ts`) holds every custom stamp this JS realm has seen: the library's, plus ones read from open documents. `stampDesign`, `stampLabel`, `stampAspect`, and `searchStamps` in `stampSymbols.ts` consult it, so the markup layer, drafts, the picker, the Markups list, and the writer all keep using one lookup. Deleting a stamp removes it from the library (the picker and Recently Used) but not from the registry, so stamps already placed in open documents keep drawing and still save.

## Writing

- The page-edit worker has no localStorage, so `viewer.save()` passes the custom stamps its markup changes reference (`stampsFor(markup)`) to the `annotations` job, which registers them in the worker before writing.
- **Text stamps** write like review stamps (`/ClumsyDate` when dated) plus `/ClumsyStampText` (the word, as a text string), so any Clumsy can redraw them.
- **Image stamps** embed the image as an image XObject (pdf-lib's `PngEmbedder`/`JpegEmbedder`: JPEG bytes as `DCTDecode`, PNG as Flate RGB with an `/SMask`), referenced from the form XObject's `/Resources /XObject`, and drawn with `stampMatrix` then `[W 0 0 -H 0 H]` so it fills the stamp's box upright on a rotated page. Opacity comes from the same `GS` ExtGState (`ca` applies to images). The annotation also gets `/ClumsyStampImage` pointing at that image XObject. One image XObject is shared by every placement of the same stamp: within a save through a per-id map, and across saves by reusing the `/ClumsyStampImage` of any annotation already in the file with the same `/Name`. So placing a logo 40 times stores it once.
- `/Subj` defaults to the stamp's name, as it does for built-in stamps.

## Opening a file with a custom stamp you don't have

- **It always draws.** The appearance stream is complete and self-contained, so pdf.js (and Preview, Acrobat, browsers) draw it from `/AP` like any stamp; Clumsy claims it as markup (it has `/Name /Clumsy:`), so it's selectable.
- **It's reconstructed, not lost.** `readMarkup` also returns the custom stamps the file's markup uses: text stamps from `/ClumsyStampText` and `/C`, image stamps from the XObject `/ClumsyStampImage` points at (a `DCTDecode` stream is the JPEG itself; a Flate RGB or gray image with an optional 8-bit `/SMask` is decoded to RGBA in the worker and turned into a PNG by a canvas on the main thread). The name comes from `/Subj`. These are registered as document stamps: drawn when moved or resized, rewritten with a fresh appearance on save, but not added to the picker. Adding a document's stamp to your own library is a follow-up.
- **If it can't be reconstructed** (another app rewrote it, or an image format Clumsy didn't write), the existing rule for unknown stamps applies: the writer keeps the annotation's own `/AP` and only updates `/Rect`, so a move or resize is kept (readers map the appearance's `/BBox` onto the new `/Rect`) and the stamp is never dropped. On screen it's hidden while it has unsaved changes, as today.

## Picker

- A **Custom** section after Recently Used, always shown (even when empty) outside a search, with **New Text Stamp…** and **New Image Stamp…** and an **Edit** toggle. Custom stamps also appear in Recently Used and in search (by name and text).
- **New Image Stamp…** picks through `pickImage()` (Rust's `pick_image`: PNG, JPEG, WebP, GIF, SVG, allowlisted read-only), so no new file access. The browser build uses a file input.
- **New Text Stamp…** swaps the sheet's body for a small form: text, color, Add today's date, and a live preview. The name is the text.
- **Edit** turns each custom stamp into a row with its preview, a name field (rename on Enter or blur), and Delete.
- Image stamps place at 96 pt on their longest side; text stamps at the review stamps' 40 pt height. Drag sizes either, keeping the aspect.

## Code

- `src/lib/customStamps.ts` (pure, tested): the type, parsing and caps, the library read/write, the registry, `stampsFor`.
- `src/lib/customStampImage.ts` (DOM): normalizing a picked file, and RGBA → PNG for reconstructed images.
- `src/lib/customStampPdf.ts`: embedding and reusing image XObjects, and reading custom stamps back from a file.
- `stampSymbols.ts`, `markupAppearance.ts`, `markupPdf.ts`, `markupSvg.ts`, `markupDraft.ts`: the image design and the registry lookups.
- `StampPicker.tsx` with `CustomStampForm.tsx` and `useCustomStamps.ts`.

## Follow-ups

- A saved tool in the Tool chest (#38) can reference a custom stamp by its id once both land; nothing here depends on it.
- Add a document's custom stamp to your library.
- Import and export the library as a file, for sharing a company's stamps.
- Vector SVG stamps (paths only), if raster logos turn out not to be enough.
