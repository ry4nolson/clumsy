# Overlay plan

Written 2026-11-14 against `main` after the measurement, tool chest, and markup list plans. Roadmap item 4. FSG's Bluebeam seats are mostly Core, and "overlay and compare drawings" is one of the three things Bobby Graham named that the license pays for.

Overlay lays two revisions of a drawing on top of each other: the old one tinted red, the new one tinted blue. Lines that didn't change print dark, because both colors multiply to near black. Anything that moved, appeared, or disappeared shows up in red or blue. Clumsy's compare (0.3) only sees text, so a drawing where a wall moved 2 feet shows no changes at all. Overlay is the drawing-side answer, and it's pure TypeScript and pdf-lib, so it works on Windows too.

## The call: an overlay is a new PDF, not a view mode

Bluebeam's Overlay Pages makes a new document, and that's the right shape here too. Clumsy builds a new unsaved PDF where each page is the two source pages drawn on top of each other with PDF blend modes, and opens it as a tab (`carriedChanges`, named "A-201 rev 3 vs rev 4.pdf"). Everything Clumsy already does then works on the overlay for free: zoom, the Document Map, markup and stamps (circle the change, add a cloud), measurement, print, Save, and sending it to someone. No new viewer mode, and nothing new for page edits, undo, or restart sessions.

## How the tint works, in vector

Each source page is embedded as a form XObject (pdf-lib's `embedPage`, the same kind of copying `combinePdfs` does) and drawn in its own transparency group:

1. Draw the page.
2. Fill the page box with white using blend mode `Saturation`. A gray source has zero saturation, so this turns the page grayscale and keeps a colored drawing from mixing into the wrong colors.
3. Fill the page box with the layer's color (red) using blend mode `Lighten`. Black lines become red, white stays white, and gray lines become light red.

The two groups are then drawn with blend mode `Multiply`. Where both have a line it's dark, where only one does it's that layer's color, and white stays white. Everything stays vector. Lines stay sharp at any zoom, file sizes stay small, and scanned drawings work the same way, since an image is just more content to tint.

Each group is wrapped in its own optional content group (OCG, "Previous" and "Current"), so either layer can be hidden in any viewer that shows layers, including Clumsy once it has a layers control.

pdf.js draws transparency groups and blend modes through canvas composite operations, and `saturation`, `lighten`, and `multiply` all exist there. Whether pdf.js, PDFKit (print), Preview, and Acrobat all render this the same is the spike's first question.

## Pairing pages

- **One page against one page:** the current page of each document, or ones picked in the sheet.
- **A whole set:** pair sheets by page label when both files have labels ("A-201" with "A-201"). This is where title-block page labels pay off, since drawing sets usually have them. Otherwise pair by page number. Unpaired sheets go at the end, drawn in their own color alone, so added and removed sheets show too.
- The sheet shows the pairing as a list you can correct before building.

## Alignment

Revisions are often shifted, rescaled, or re-cropped when they're re-plotted, so pages drawn corner to corner would show everything as changed.

- **Default:** align the page boxes (crop boxes, centered, same scale). This is right for most CAD exports from the same title block.
- **Align by points:** click the same two points on each page, like two grid line intersections or two corners of the title block. `src/lib/alignment.ts` (pure, tested) solves the similarity transform (move, scale, rotate) from the two pairs, and the second page is drawn through that matrix. Three points give a full affine transform for skewed scans. The picking happens in a sheet with both pages side by side, using the same coordinate conversion as markup (`convertToPdfPoint`).
- **One alignment for the whole set** by default, since a re-plot usually shifts every sheet the same way. It can be overridden per pair.
- **Auto-align** (phase 2): find the offset by cross-correlating low-resolution renders of both pages. It's worth it once people use overlay often. Two-point picking covers it until then.

## The sheet

**Overlay Drawings…** goes in the File menu next to Compare With File… and in the palette. It's available on any PDF tab, and the current tab is the "Previous" side by default.

- Previous: this tab. Current: another open tab, or a file picked through Rust's existing `pick_pdf`. Swap button.
- Pages: current page, all pages paired by label, or all pages paired by number, with the pairing list.
- Colors: red and blue by default, with a choice of red/green and magenta/green (`clumsy.overlayColors`), since red/green is the one pairing colorblind users can't tell apart.
- Alignment: page boxes, or Align by Points…
- Build: runs in the page-edit worker (`overlay` job) with progress and Cancel, like Compress, and opens the result as a new tab beside the current one.

## Optional: changed regions

To make changes easy to find on a big sheet, the overlay can also get clouds around the changes. Render both aligned pages at about 75 dpi in the worker (`OffscreenCanvas`, already used by Compress), threshold each to ink and no ink, compute the difference mask, dilate and cluster it into boxes, drop tiny ones, and add a revision cloud markup per box, tagged with subject "Overlay change". They're ordinary Clumsy markup, so they show up in the markup list and can be deleted or restyled. Off by default; decision 3. This is the pixel diff compare phase 2 describes, reused.

## Code

- `src/lib/overlayPdf.ts` (new): builds the overlay document with `embedPage`, the two tint groups (`ExtGState` `/BM /Saturation`, `/Lighten`, `/Multiply`), the OCGs, and page labels "A-201 (overlay)". It runs as the worker's `overlay` job.
- `src/lib/alignment.ts` (new, pure): two-point similarity and three-point affine solving, and composing them with page box offsets and `/Rotate`.
- `src/lib/overlayPairs.ts` (new, pure): pairing by label and by number, plus unpaired sheets.
- `src/lib/overlayChanges.ts` (new): mask diffing and box clustering for the changed-region clouds, using `markupPdf` to write them.
- `src/components/OverlayDialog.tsx` and `AlignPointsDialog.tsx`: the sheets. `src/hooks/useOverlay.ts`: capture both documents' bytes (through `usePageEdits.capture`, so unsaved markup is included), run the job, open the tab.
- `commands.ts` / `menu.ts`: `overlayDrawings`.
- A small layers toggle on the overlay tab (Previous, Current) through pdf.js's `optionalContentConfig.setVisibility`. That's a first piece of the document info batch's Layers tab, built so the full tab can reuse it.

## Spike first

1. **Rendering the blend group:** a two-page overlay built with pdf-lib renders correctly in pdf.js (Clumsy), PDFKit print and Save as PDF, Preview, Chrome, and Acrobat. That means red-only lines, blue-only lines, dark shared lines, and white background, on a vector drawing, a colored drawing, and a scanned one. If one viewer gets the `Saturation` step wrong, try a grayscale image mask instead, or drop to rasterized overlays for that case.
2. **Speed:** a 60-sheet set builds in reasonable time in the worker, and the overlay tab scrolls smoothly. Blend groups make pdf.js composite offscreen, so compare render times against the plain pages in `docs/perf-baseline.md`.
3. **`embedPage` on hostile fixtures:** looping page trees and inherited resources, through the flattened page tree helpers page edits already use.

## Tests (Linux container)

- `alignment.test.ts`: two-point solutions for pure moves, scales, and rotations, three-point affine, degenerate input (the same point twice), composing with `/Rotate 90`.
- `overlayPairs.test.ts`: label pairing with missing, duplicate, and reordered sheets, number fallback, unpaired at the end.
- `overlayPdf.test.ts`: the output reopens in pdf.js with the right page count and labels, each page has both groups with the right blend modes and OCGs, and a render of a fixture pair shows red, blue, and dark pixels where expected.
- `overlayChanges.test.ts`: boxes found around a moved line and none for identical pages, with tiny noise dropped.
- Commands placed once.

## Mac checklist

- Two revisions of a real FSG drawing: changes are red and blue, unchanged linework is dark, and text that didn't change doesn't double up.
- Align by points on a re-plotted sheet: the shift disappears.
- A set with added and removed sheets: they come out in their own color.
- Hide each layer, mark up the overlay, print it, Save, and open it in Acrobat and Preview: it looks the same.
- Colorblind palette: magenta/green builds right.
- Windows build: the same, minus print.

## Phase 2

- Auto-align by cross-correlation.
- Overlay a page against a page in the same file (revision sheets bound into one set).
- Update an overlay when either source changes, instead of rebuilding.
- Slip sheets: replace sheets in a set with a newer revision by label. Bluebeam's Batch Slip Sheet is in Complete and uses the same pairing code.

## Decisions for Ryan

1. **The overlay is a new PDF tab, not a mode on the compare view.** Lean: yes. It gets markup, print, Save, and sharing for free, and it's what Bluebeam users expect.
2. **Red and blue by default,** with red/green and magenta/green as choices. Lean: yes.
3. **Changed-region clouds are off by default.** Lean: off. They're a guess, and a wrong cloud on a sheet sent to an architect is worse than none. Turn them on in the sheet when wanted.
4. **Build the Layers toggle now for the overlay,** ahead of the document info batch. Lean: yes, small, and reused there.

## Done when

Merged with the four checks and the Mac checklist. AGENTS.md gets an Overlay section (the tint groups and blend modes, OCGs, pairing, alignment, the worker job, changed-region clouds). CHANGELOG under Unreleased as Added. The roadmap lists it as shipped, and compare's phase 2 notes that its visual diff came with overlay.
