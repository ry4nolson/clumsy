# Measurement plan

Written 2026-11-14 against `main` at v0.16.2. It comes before the document info batch, OCR, and redaction. Two reasons. Construction people at FSG are asking for takeoffs on drawings ("make a Bluebeam knock-off"). And unlike OCR through Apple's Vision framework, this is plain TypeScript and pdf-lib, so it works on Windows the day it ships.

The goal: set a page's scale, then measure lengths, paths, and areas on it. Measurements are real PDF measurement annotations, so they open with their values in other measuring apps. A list sidebar totals them and exports them.

## What's already there

Markup (0.14) did most of the hard part: Clumsy owns its annotations, keeps changes in `annotationStorage` under `clumsy-markup:` keys, draws them in the SVG markup layer, hides the canvas copy of edited ones with `noView`, and writes `/AP` appearance streams in the same pass as sticky notes. Measurements are new markup kinds on that same path. Nothing here needs a new save path.

Gaps today:

- `markupFromDict` skips dimension lines on purpose (`isMeasurement`: `/Measure`, `/IT`, `/Cap true`, `/LL`, `/LLO`), because Clumsy couldn't redraw their captions and leaders. `isClaimedShape` still drops them from pdf.js's annotation layer, and the canvas keeps drawing their `/AP`, so they show but can't be selected.
- There's no polygon or polyline kind. pdf.js reads both (`PolylineAnnotation`, `PolygonAnnotation`, `data.vertices`) and draws their appearance, but Clumsy doesn't claim them.
- pdf.js doesn't read `/Measure` or a page's `/VP` at all (checked in 6.4.299's worker), so scale comes only from Clumsy's own pdf-lib read.

## The PDF side

ISO 32000-1 §12.9 covers this. Clumsy writes what it describes, and doesn't invent its own keys for anything the spec covers.

**Scale lives in a measure dictionary:** `/Type /Measure /Subtype /RL`, with:

- `/R`, the ratio text people see ("1/8 in = 1 ft-0 in", "1:100").
- `/X`, a number format array that converts PDF points to real units.
- `/D` for distances and `/A` for areas.

Each number format is `/Type /NumberFormat /U (ft) /C <factor>`, plus how to show the value. Decimals use `/D 100` (two places). Fractions use `/F /F /D 16` (sixteenths). Chained formats handle feet and inches: the first converts points to feet, and the second converts the leftover fraction of a foot to inches (`/U (in) /C 12`, fractions). Worked example, 1/8" = 1'-0": one point is 1/72 in on paper, so it's (1/72) ÷ (1/8) = 0.1111 ft, and `/X [<< /U (ft) /C 0.1111 ... >> << /U (in) /C 12 /F /F /D 16 >>]`.

**Page scale** goes in the page's `/VP` (viewport array): one viewport whose `/BBox` is the page's crop box, carrying the measure dictionary. That's how the scale survives Save and shows up in other apps for the next measurement. A page with a title block and two details at different scales gets one viewport per detail (phase 2).

**Each measurement** also carries its own copy of `/Measure`, because a reader interprets an annotation's value from the annotation, not the page:

| Tool | Annotation | Keys beyond markup's common ones |
|---|---|---|
| Length | `/Line` | `/IT /LineDimension`, `/Measure`, `/L`, `/LE` (`/OpenArrow` both ends, or ticks), `/Cap true`, `/CP /Top` |
| Path (polylength) | `/PolyLine` | `/IT /PolyLineDimension`, `/Measure`, `/Vertices` |
| Area | `/Polygon` | `/IT /PolygonDimension`, `/Measure`, `/Vertices`, `/IC` when filled |
| Count (phase 2) | `/Circle` or `/Stamp` group | `/IT` not defined; Bluebeam uses its own keys, so check a sample first |

`/Contents` holds the caption text ("24' 6 1/2\"", "312.5 sq ft"), which is what most apps list. A `/Subj` ("Length", "Area", "Perimeter") is what their markup lists group by.

**Appearance.** The `/AP /N` draws the shape and the caption in Helvetica, through `markupAppearance.ts`'s existing writer. Everything needed is in WinAnsi: `'`, `"`, `/`, digits, `²` (0xB2), and `°`. The caption sits on top of the line, centered and turned with it, flipped so it never reads upside down. For areas it sits at the polygon's visual center (pole of inaccessibility, falling back to the centroid when that's inside).

**Leader lines** (`/LL`, `/LLE`, `/LLO`) are what make a line a dimension line in Acrobat and Bluebeam. Clumsy's Length tool doesn't draw leaders in phase 1. A file's existing leadered dimensions are read and listed but stay pdf.js-drawn and read-only, the same rule as today. Phase 2 draws leaders, and only then claims them for editing.

## Model

- `Markup` gains `vertices: number[] | null` (PDF user space, flat x,y pairs) and `measure: MeasureScale | null`.
- `MarkupKind` gains `"measure-length" | "measure-path" | "measure-area"`. `isMeasureKind` sits next to `isLineKind`, and `"measure-length"` counts as a line kind for geometry, handles, and nudging.
- `src/lib/measure.ts` (new, pure, tested): `MeasureScale` (ratio label, points-to-unit factor, unit system, precision), presets, `scaleFromCalibration(pointsLength, realLength, unit)`, `lengthOf`, `pathLengthOf`, `areaOf` (shoelace, absolute), and `formatLength`/`formatArea` for ft-in with fractions, decimal feet, inches, meters, and millimeters. It also has `labelPoint` for the caption position.
- `src/lib/measurePdf.ts` (new): measure dictionary and number format writing and reading, `/VP` read and write, and `measurementFromDict` for Line/PolyLine/Polygon with `/IT`. `markupPdf.ts` (349 lines) calls into it rather than growing past 500.

## Scale

**Pages > Set Scale…** opens a sheet (`ScaleDialog`, an in-window sheet like Page Labels), with two ways in:

- **Preset.** Architectural (1/16" through 3" = 1'-0"), engineering (1" = 10' through 1" = 100'), and metric (1:1 through 1:1000). "Full size (1:1)" is the default when nothing is set.
- **Calibrate.** Click two points on a known dimension, then type its real length ("25'", "25 ft 6 in", "7.62 m"; `parseLength` in `measure.ts`). This is what people use on drawings that were scaled when they were printed to PDF, where the printed ratio is wrong.

Applies to the current page, the selected pages, or all pages. It's a page edit (`{ kind: "scale", pages, scale }`), so it's queued, undoable, and marks the tab edited, like Page Labels. The worker writes `/VP` on each page. It doesn't rewrite existing measurements. They keep their own `/Measure`, which matches how a reader will show them, and the list marks the ones whose scale differs from their page's ("different scale").

The page box (or a small chip beside it) shows the current page's scale, and clicking it opens the sheet. Measuring on a page with no scale asks once: Set Scale or Measure at full size.

## Tools

One toolbar split button, **Measure**, with a dropdown like Shapes. The button uses the last tool. The dropdown has Length, Path, Area, then Set Scale…, units (ft-in, decimal ft, in, m, mm), and precision (1/16", 1/8", 1/4"; 0, 1, or 2 decimals). It also has the same color, thickness, and opacity controls as Shapes, kept in `clumsy.measureParams`.

- **Length:** drag, or click and click. Shift snaps to 0°, 45°, and 90° on the page as you see it, so it follows view rotation.
- **Path and Area:** click each vertex. Double-click, Enter, or clicking the first point finishes; Backspace drops the last vertex; Esc cancels. Shift snaps each segment. A live caption follows the pointer the whole time.
- **Editing:** the markup layer's selection, with a handle on every vertex. Drag a vertex or the whole thing; arrow keys nudge; Delete removes. Alt-click on a segment adds a vertex, and Alt-click on a vertex removes it. Each change is one undoable step and updates the caption.

The Measure tool joins `contextTools` with the SF Symbol `ruler` (added to `SYMBOLS` in `context_menu.rs`). Commands go in `commands.ts`: `measureLength`, `measurePath`, `measureArea`, `setScale`, `showMeasurements`, `exportMeasurements`. None get default shortcuts until there's an obvious free key.

## Measurements sidebar

A **Measurements** tab, shown while a Measure tool is on or the document has any, like Comments and Changes. It lists measurements by page with type, value, and label. Clicking a row goes to it and selects it. Totals by type sit at the top (total length, total area). Leadered dimensions from other apps are listed too, marked read-only.

**Export Measurements…** writes CSV: page, page label, type, value, unit, scale, label, and color. Color is how estimators split takeoffs into trades. Writing a `.csv` needs a new Rust command, `write_text_export`. It's allowlisted like `write_image`: the path comes from a new `pick_csv_save_path`, and only `.csv` is written. **Copy Measurements** puts the same rows on the clipboard as tab-separated text for pasting into a spreadsheet. That needs no new file access, so it can ship first if the Rust half slips.

## Reading other apps' files

- `kindOf` maps `/Line` with `/IT /LineDimension` and no leaders, `/PolyLine` with `/IT /PolyLineDimension`, and `/Polygon` with `/IT /PolygonDimension` to the measure kinds. `isMeasurement` stops excluding those and keeps excluding leadered lines.
- `isClaimedShape` claims Polygon (7) and PolyLine (8) with an `/IT` measure intent, so pdf.js makes no popups or editors for them. Other polygons and polylines stay pdf.js's. Polygon clouds are a separate markup phase 2 item.
- The value comes from the geometry and the annotation's own `/Measure`, never from parsing `/Contents`. That's what keeps a moved vertex and its caption in step. When an annotation has no `/Measure`, it uses the page's `/VP`, then full size, and the list says which.
- Everything else (other `/BS`, `/RC`, `/T`, `/Popup`, custom Bluebeam keys) stays untouched on rewrite, the existing markup rule.

## Spike first

Run this in the container against 6.4.299 and a real Bluebeam takeoff file before building UI:

1. **Measure dictionary semantics,** settled against ISO 32000-1 §12.9 and a Bluebeam-saved file: what `/C` in `/A` converts from (X units squared, or points squared through `/X`), how chained ft-in formats round, and whether Bluebeam writes `/VP`, per-annotation `/Measure`, or both.
2. **A file `measurePdf.ts` writes** reopens in pdf.js with the appearance drawn, and pdf-lib reads every key back.
3. **Claiming Polygon and PolyLine** in the annotation layer wrapper doesn't trip pdf.js's editors when an editing mode starts (same check as `/Clumsy:` stamps), and `noView` hides their canvas copy once edited.
4. **Bluebeam's own keys** on measurements (its `/BSIColumnData` and friends): note which exist, so rewrites keep them and the plan knows what Count needs.

## Tests (Linux container)

- `measure.test.ts`:
  - Every preset's factor, and calibration round trips.
  - `parseLength` on "25'", "25' 6\"", "25 ft 6 1/2 in", "7.62 m", "7620mm", and junk.
  - Formatting at each precision, including carries: 11' 11 31/32" at 1/16" must read 12' 0", not 11' 12".
  - Shoelace on clockwise and counterclockwise and on self-touching shapes.
  - Label points inside concave shapes.
- `measurePdf.test.ts`:
  - Each kind written and reopened in pdf.js: right subtype, `/IT`, `/Measure` keys, `/Vertices`, `/Contents`, and `/AP /BBox` equal to `/Rect`.
  - `/VP` written on the right pages, and the scale page edit undone.
  - A rotated page's caption reads upright.
  - Editing a measurement from another app (a fixture with Bluebeam-style keys) keeps every unknown key.
  - Encrypted fixture: written and re-encrypted on Save.
- Commands and menus: the new commands placed once, `ruler` in the context tools, unknown ids dropped.
- CSV: quoting of labels with commas and quotes, page labels used, units consistent.

## Mac checklist (for the PR)

- Set a scale from a preset and by calibration on a real drawing. Measure a wall you know: Length matches the dimension on the drawing.
- Draw one of each. Save, close, reopen in Clumsy: all there, all editable, values unchanged.
- Open the saved file in Acrobat Reader and Bluebeam Revu (or a Bluebeam user at FSG): measurements show with the same values and appear in each app's markup list. Preview and Chrome show the appearance.
- Open a Bluebeam takeoff in Clumsy: lengths and areas list with Bluebeam's values, edit one, save, reopen in Bluebeam: still a measurement there, with its subject and color.
- Undo and redo every step, including Set Scale.
- View rotation and a `/Rotate 90` page: Shift snapping follows the screen, captions read upright.
- Export and Copy Measurements, paste into Excel and Numbers: columns line up.
- Windows build: all of the above that doesn't need Bluebeam.

## Phase 2

- Snap to the drawing: endpoints, midpoints, and intersections of vector lines. This needs path geometry from pdf.js's operator list per page, cached in a worker. It's the feature that makes takeoffs fast, and the biggest single piece, so it gets its own plan.
- Count tool with numbered markers, and totals by color.
- Angle, radius, and cutouts (area minus a hole: `/Polygon` with a second vertex ring isn't in the spec, so Bluebeam's approach decides it).
- Leader lines on Length (real dimension lines), and claiming leadered ones from other apps.
- Several viewports per page, for sheets with details at different scales.
- Measurement labels and custom columns (trade, room) carried into the CSV.

## Decisions for Ryan

1. **Measure before OCR** (decided 2026-11-14): cross-platform, and asked for by the people already using Clumsy.
2. **No scale set: ask, or measure at full size silently.** Lean: ask once per document. A wrong-but-confident number on a drawing is worse than a question.
3. **Default units and precision:** ft-in to 1/16". Lean: yes, it's who's asking. Metric is one click away.
4. **Leadered dimensions read-only in phase 1.** Lean: yes, the same rule as today, and listed so they still count.
5. **Copy Measurements first if CSV export's Rust command slips.** Lean: yes.

## Done when

Phase 1 merged with all four checks, the Mac checklist passed, and a Bluebeam round trip confirmed by someone who uses Bluebeam. AGENTS.md gets a Measurement section (kinds, measure dictionaries and `/VP`, scale as a page edit, claimed subtypes, CSV export's file access) and updates Markup for the new kinds and `isMeasurement`. CHANGELOG has the entry under Unreleased as Added. The roadmap lists it as shipped.
