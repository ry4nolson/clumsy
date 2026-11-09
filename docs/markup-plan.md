# Markup plan

Written 2026-11-07 against `main` at v0.13.1. Adds the markup pdf.js can't make: shapes, revision clouds, lines and arrows, strikethrough and underline, and stamps. Everything saves into the file as real PDF annotations with appearance streams, so it looks the same in Preview, Acrobat, and browsers, and Acrobat can still select and move it.

## Where it comes from

Adam's drawing markup in FSG's constructionlab (`src/features/drawings/`, okayed for reuse) already does most of the PDF side with pdf-lib:

- `addNativePdfAnnotation` (`DrawingsAlpha.tsx:577`, ~90 lines) writes `/Square` and `/Circle` (outlined, or filled at 30%), clouds as `/Square` with `/BE << /S /C /I 1.5 >>` and `/RD`, arrows as `/Line` with `/LE [/None /OpenArrow]`, ink, and typewriter `/FreeText`.
- `drawPdfAnnotation` draws the same shapes into page content. Its cloud, ellipse, and arrowhead paths are what the appearance streams need.
- `cloudPathFromBounds` builds the cloud outline from scallops sized to the box.
- `stampSymbols.tsx` (514 lines, tested) is self-contained: Lucide icons plus about 40 electrical plan symbols on a 24×24 grid, rendered to SVG on screen and to PDF paths, with Helvetica Bold labels. `StampIconPicker.tsx` is the picker.

What it doesn't do, and this plan adds:

- **No appearance streams.** Its annotations have no `/AP`, so every viewer draws its own fallback. pdf.js does that for squares, circles, lines, and ink (`_setDefaultAppearance`), but ignores `/BE`, so clouds come out as plain rectangles. Preview's fallbacks are worse. Clumsy writes an `/AP /N` for every annotation it creates or changes.
- **No strikethrough or underline.** Those are text-markup annotations with `/QuadPoints`, built from the text selection.
- **It adds annotations with `page.node.addAnnot`**, which normalizes the page and wraps its content streams. Clumsy edits `/Annots` directly, like `notesPdf.ts` does.
- **Points are normalized 0–1 against an SVG viewbox.** Clumsy stores PDF user space, like sticky notes.

What doesn't come over: the 5,600-line `DrawingsAlpha.tsx` UI, which is tied to their sheets, versions, tasks, and API. Its SVG rendering (around line 4890–5200) is a reference for the markup layer. Pen, highlight, and text stay with pdf.js's own editors, which already save. Field markers (tasks, constraints, photos, production counts) are construction-only.

It's on plain `pdf-lib` 1.17; Clumsy uses `@cantoo/pdf-lib`, same API for everything here.

## The call: Clumsy owns these annotations, like sticky notes

pdf.js 6.4.299 has no editors for squares, circles, lines, strikeouts, underlines, or vector stamps, and can't write them. It also turns any `/Stamp` into its own `StampEditor` when an editing mode starts, which would rewrite a vector stamp as an image on save. So these work exactly the way sticky notes already do:

- **Changes live in `annotationStorage`** under `clumsy-markup:<id>` keys: new markup, changes to markup already in the file, and deletions. Values are replaced, never merged. Every change goes on pdf.js's undo stack through `uiManager.addCommands`, so Edit > Undo and the undo bar reach it, and the tab reads as edited.
- **Clumsy draws them** in a `.markup-layer` (SVG) on each page div, under the sticky notes layer and above the canvas, re-attached on `pagerendered`, `scalechanging`, and `rotationchanging` like the diff and notes layers.
- **`viewer.save()` writes them.** The worker's notes job becomes an annotations job: pdf.js's saved bytes plus the note changes plus the markup changes, written in one incremental update (or one full rewrite when the old `startxref` doesn't point at an xref, or when the bytes are encrypted, same rules as `writeStickyNotes`). Every save path goes through `viewer.save()` (Save, Save As, moving a tab, page edits, restart sessions, print), so markup is never left behind.

### Saving, in detail

This is the part that has to be right.

**New markup** gets a fresh annotation dictionary appended to the page's `/Annots`:

| Kind | Subtype | Keys beyond the common ones |
|---|---|---|
| Rectangle | `/Square` | `/BS << /W w /S /S >>`, `/IC` when filled, `/RD` |
| Ellipse | `/Circle` | `/BS`, `/IC` when filled, `/RD` |
| Cloud | `/Square` | `/BE << /S /C /I 1.5 >>`, `/RD` sized to the scallops, `/IC` when filled |
| Line | `/Line` | `/L [x1 y1 x2 y2]`, `/LE [/None /None]`, `/BS` |
| Arrow | `/Line` | `/LE [/None /OpenArrow]` (or `/ClosedArrow` with `/IC`) |
| Strikethrough | `/StrikeOut` | `/QuadPoints` per line of selected text |
| Underline | `/Underline` | `/QuadPoints` |
| Stamp | `/Stamp` | `/Name /Clumsy:<symbol id>` |

Common keys on all of them: `/Type /Annot`, `/Rect`, `/P` (the page), `/NM` (a UUID), `/C` (stroke color), `/CA` (opacity), `/F 4` (Print), `/M` and `/CreationDate`, `/Subj` (the kind's name, which Acrobat shows in its comment list), and `/AP << /N <form XObject> >>`.

**Appearance streams.** Each `/AP /N` is a form XObject with `/BBox` equal to `/Rect` and the drawing in page space, so every viewer that maps BBox to Rect draws it exactly where Clumsy did. It's built from pdf-lib's operator helpers (`drawRectangle`, `drawEllipse`, `drawSvgPath`, `drawLine`, which return `PDFOperator`s), with an `/ExtGState` for opacity. The cloud uses `cloudPathFromBounds`; its quadratic segments go through pdf-lib's SVG path conversion, which emits cubics. Arrowheads come from the same code as the arrow tool on screen. Strikeout and underline draw one line per quad at the PDF spec's positions (middle of the quad, and just under its baseline). Stamps draw their symbol's paths scaled from the 24×24 grid to the stamp's box, with Helvetica Bold (WinAnsi, a standard font, nothing embedded) in the XObject's `/Resources` for labels. On a rotated page (`/Rotate`), a stamp's appearance gets a `/Matrix` that turns it upright for the reader; shapes don't need one.

**Dash patterns** (`/BS /S /D` with `/D`) are drawn when present, so a dashed rectangle from Acrobat stays dashed after Clumsy moves it. Clumsy's own tools don't offer dashes in phase 1.

**Changes to markup already in the file** (Clumsy's, or another app's of the same subtypes) rewrite that annotation's dictionary in the update: a new `/Rect` (and `/L` or `/QuadPoints`) when it moved or was resized, new `/C`, `/IC`, `/CA`, `/BS` when restyled, `/M` on any change, and a regenerated `/AP` from the merged values. Every key Clumsy doesn't know (`/T`, `/Contents`, `/Popup`, `/RC`, custom keys) stays as it was. A `/Popup` moves with its annotation, as notes' do. Stamps Clumsy didn't draw (no `/Clumsy:` name) aren't claimed; pdf.js keeps handling those.

**Deleting** removes the annotation from `/Annots`, along with its `/Popup` and any replies (`/IRT` pointing at it), so nothing is left orphaned.

**Encrypted files** follow the sticky notes rule: the job decrypts with the tab's password (or `""` for owner-only files), writes a full rewrite, and Save encrypts it again for a protected tab.

**Undo and page edits.** A page edit starts from `viewer.save()`, so pending markup is written into the bytes first and comes back from the file afterward. Undoing the page edit restores the earlier bytes and storage, same as notes.

### Showing markup that's already in the file

Two things have to happen for an annotation that's in the file: the canvas keeps drawing its appearance (pdf.js does that), and Clumsy has to know where it is so it can be selected.

- **Hit targets.** On each page render, Clumsy takes the page's `/Square`, `/Circle`, `/Line`, `/StrikeOut`, `/Underline`, and `/Clumsy:` stamps from `pdfPage.getAnnotations()` and the annotation layer render wrapper in `pdfjs.ts` drops them from pdf.js's annotation layer (next to `isStickyNote`, so pdf.js never makes editors or popups for them). The markup layer draws invisible hit targets from `rect`, `lineCoordinates`, and `quadPoints`.
- **Full style.** pdf.js's data for these doesn't include `/IC`, `/BE`, `/BS`, or `/D` (checked in 6.4.299: they're read into the default appearance and not exposed). When a page has any claimed annotation, a background worker job (`readMarkup`) parses the tab's bytes once and returns those keys for the claimed objects, keyed by the same `<num>R` ids pdf.js uses. It only runs when there's something to read, so files without shapes pay nothing.
- **Editing one.** The moment a file annotation is changed, Clumsy draws it in the markup layer instead and hides pdf.js's canvas copy with an `annotationStorage` entry of `{ noView: true }` under its id. pdf.js's worker reads that in `mustBeViewed` (6.4.299, `Annotation.mustBeViewed`) and skips it in display renders. The page's canvas is redrawn once so the old copy disappears. Unchanged annotations never get the entry, so opening a file doesn't mark it edited.
- **Print and image export.** `noView` doesn't affect the print intent, and the canvas doesn't know about unsaved markup, so a tab with markup changes prints and exports from `viewer.save(true)`'s bytes. Print already does. Export Pages as Images renders from the loaded document today, so it switches to a temporary document loaded from those bytes when the tab has any `clumsy-markup:` or `clumsy-note:` changes. Check whether unsaved sticky notes are missing from exported images today; this would fix that too.

## Tools

- **Shapes**, one toolbar button with a dropdown like Fill In: Rectangle, Ellipse, Cloud, Line, Arrow. The button places the last-used shape. Drag to draw; Shift constrains to a square, a circle, or 45° steps. The dropdown also holds stroke color, fill (none or the stroke color at 30%), thickness, and opacity, remembered in `clumsy.markupParams` like `clumsy.editorParams`.
- **Strikethrough** and **Underline**, as commands like Highlight Selected Text: Edit menu, context menu's selected-text section, and the palette. Same rule as highlights: only when the selection is in this viewer's text layer. Quads come from the selection's client rects per text-layer span, merged per line, through `convertToPdfPoint`. Also a text-markup mode in the Highlight dropdown (Highlight, Underline, Strikethrough) so selecting text applies the chosen one, like Acrobat.
- **Stamps**, a toolbar button with a picker sheet ported from `StampIconPicker`: recently used, review stamps, a curated Lucide set, and the electrical symbols by category. Click to place at a default size, drag to place at a size.
- **Review stamps**: Approved, Rejected, Reviewed, Draft, Confidential, Void, and For Review, drawn as an outlined rounded box with the word and today's date (`dateLabel`, the same date Fill In uses). Vector, Helvetica Bold.

All of them join `contextTools` so they can go in the right-click tools row, with SF Symbols for each.

### Editing

In Select and in the markup tools, clicking a markup selects it: handles at the corners (endpoints for lines), drag to move, drag a handle to resize, Shift keeps proportions. Arrow keys nudge 1 pt, Shift+arrows 10 pt. Delete removes it. Esc deselects. Changing a style control with a markup selected restyles it. Each of those is one undoable change.

Hit testing follows what's drawn: an unfilled shape is only clickable on its stroke (SVG `pointer-events: visibleStroke`, widened to at least 6 px), so a big rectangle around a paragraph doesn't block text selection inside it. In other tools (Highlight, Draw, Text) the layer doesn't take clicks.

## Code

- `src/lib/markup.ts` (new, pure): the markup model (kind, rect, points, quads, colors, width, opacity, dash, stamp id), storage keys and change helpers (`markupIn`, `changedMarkup`, `movedMarkup`), and `isClaimedMarkup` for the render wrapper.
- `src/lib/markupShapes.ts` (new, pure): cloud path (from `cloudPathFromBounds`), arrowheads, Shift constraints, resize math, hit testing. Shared by the screen and the PDF writer, so they can't drift.
- `src/lib/markupAppearance.ts` (new): builds `/AP /N` form XObjects with pdf-lib operators.
- `src/lib/markupPdf.ts` (new): writes new, changed, and deleted markup into a `PDFDocument`, editing `/Annots` directly. Called from the annotations job next to `writeStickyNotes`; `readMarkup` lives here too.
- `src/lib/stampSymbols.ts` (ported): `stampSymbols.tsx`'s data and SVG rendering as is; `drawStampOnPdf` retargeted to emit operators into an appearance stream. Electrical ids are saved state (in `/Name`), so the same never-rename rule applies. Its tests come along.
- `src/lib/markupLayer.ts` (new): the SVG layer, selection, handles, dragging. Modeled on `stickyNotes.ts`.
- `src/components/StampPicker.tsx` (new): the picker sheet.
- `pdfjs.ts`: claim the markup subtypes in the annotation layer render wrapper.
- `notesPdf.ts` / `pageEditWorker.ts` / `pageEditMessages.ts`: the notes job becomes an annotations job carrying both; a `readMarkup` job.
- `useViewerTools`: the Shapes and Stamps tools; the text-markup mode in Highlight.
- `commands.ts`, `menu.ts`, `documentMenu.ts`, `contextTools.ts`: Strikethrough and Underline Selected Text, the new tools in the context tools row.
- `imageExport.ts`: render from saved bytes when the tab has Clumsy-owned changes.
- `tests/pdfjsContract.test.ts`: pin `noView` in `mustBeViewed`, the subtypes the wrapper claims, and pdf.js turning `/Stamp` into editors. Add each to `docs/pdfjs-upgrade.md`'s inventory.

Lucide comes in as a dependency (ISC); `scripts/third-party-licenses.mjs` picks it up. Only the curated icons are imported statically, so the bundle grows by those paths, not the whole set.

## Spike first

Before building the UI, a short spike in the container against 6.4.299 settles the risky bits:

1. A `{ noView: true }` storage entry under a file annotation's id hides it from the display render, and a canvas redraw picks that up. Find the cheapest redraw (`pageView.reset()` plus `viewer.update()`, or rerendering just that page).
2. That entry doesn't make pdf.js write anything for the annotation on save (`saveDocument` only acts on widgets and editors), and doesn't leave `noView` in the file.
3. pdf.js's annotation layer, with the wrapper dropping the claimed subtypes, doesn't turn a `/Clumsy:` stamp into a `StampEditor` when Draw or Select starts.
4. A file written by `markupPdf.ts` reopens in pdf.js with every annotation drawn from its `/AP` (cloud scallops visible), and pdf-lib reloads it with every key intact.

If 1 fails, the fallback is to rewrite edited file annotations into the bytes immediately (a page-edit-style reload), which is slower but simple.

### Spike results (2026-11-07)

1. **Failed as written, fixed another way.** Display renders use `AnnotationMode.ENABLE_FORMS`, and `getRenderingIntent` only sends `annotationStorage.serializable` for `ENABLE_STORAGE`, so a `{ noView: true }` storage entry never reaches the worker. `hideAnnotations` (`src/lib/hiddenAnnotations.ts`) wraps the document's `_transport.getRenderingIntent` instead: non-print intents get a small map of `{ noView: true }` entries and a cache key that changes with the set. `mustBeViewed` honors it. The cheapest redraw is pdf.js's own editing-mode one: `pageView.reset({ keep* layers, keepCanvasWrapper })` and `viewer.update()`. Covered by `tests/hiddenAnnotations.test.ts`.
2. **Passed.** The map lives only in rendering intents, never in `annotationStorage`, and the claimed annotation classes have no `save`, so nothing is written.
3. **Passed with a change.** Dropping a Clumsy stamp from the layer would hide it in editing modes, where pdf.js draws an editable stamp on its own canvas inside the layer element. The wrapper keeps Clumsy stamps with `isEditable: false`, which stops `StampEditor` conversion and keeps the canvas.
4. **Passed.** Every kind reopens in pdf.js drawn from its `/AP` (cloud scallops are exact cubics, since pdf-lib turns SVG quadratics into `v` curves) and pdf-lib reads every key back (`tests/markupPdf.test.ts`).

## Tests (Linux container)

- `markupShapes.test.ts`: cloud paths for tiny, wide, and tall boxes; arrowheads at every angle; Shift constraints; resize from each handle including flipping past the opposite corner; stroke-only hit testing.
- `markupPdf.test.ts`, on the plain, form, annotations, and hostile fixtures plus a rotated-page fixture:
  - Each kind written, reopened in pdf.js: right subtype, `/Rect`, color, opacity, `/QuadPoints`, `/L`, `/LE`, and an `/AP /N` whose `/BBox` equals `/Rect`.
  - Each kind rendered by pdf.js from its appearance (render to canvas, compare against a rendering of the same shape with the appearance stripped and pdf.js's fallback, where one exists), and the cloud's scallops present.
  - Moving, resizing, and restyling an annotation from another app (fixture made with pdf-lib carrying `/T`, `/Contents`, `/Popup`, `/D`, and a custom key): every unknown key survives, the popup moves, the appearance is regenerated.
  - Deleting removes the annotation, its popup, and its replies; nothing else in `/Annots` changes.
  - Saving twice doesn't duplicate anything. Saving after a page edit keeps everything.
  - Encrypted fixture (user password and owner-only): markup written, re-encrypted on Save, reopens with the password.
  - Stamps: every electrical symbol and review stamp writes and reopens; labels use only WinAnsi; a stamp on a `/Rotate 90` page reads upright.
- `markup.test.ts`: storage keys, replace-not-merge, undo restoring the previous value.
- Commands and menus: Strikethrough and Underline Selected Text placed once, enabled only with a selection in the viewer; new tools in `contextTools` with unknown ids dropped.
- Image export with unsaved markup renders it.
- Restart session and tab move with unsaved markup: it comes back.

## Mac checklist (for the PR)

- Draw one of each shape, a strikethrough, an underline, an electrical stamp, a Lucide stamp, and an Approved stamp. Save, close, reopen in Clumsy: all there, all selectable, all movable.
- Open the saved file in Preview, Acrobat Reader, Chrome, and Firefox: everything looks the same as in Clumsy, clouds included. In Acrobat, each one shows in the comments list and can be selected and moved.
- Make a rectangle, cloud, arrow, strikethrough, and underline in Acrobat (or Preview). Open in Clumsy, move and restyle each, save, reopen in Acrobat: still its own kind, with its author and comment.
- Undo and redo every action, including through the undo bar. Undo after a page edit.
- Rotate the page view (⌘R) and the page itself; draw on both. Zoom while something's selected.
- Big rectangle around a paragraph: text inside it still selects.
- Print and Export as Image with unsaved markup: it's in the output.
- Password-protected file: draw, save, reopen with the password.
- Move a tab with unsaved markup to another window; Restart Now with unsaved markup.
- annotations-5000: open time and scroll with the `readMarkup` job running. Note it in `docs/perf-baseline.md`.

## Phase 2

- Comments on Clumsy-owned markup: Edit and Delete in their popups (today `savesComment` hides them for underlines, strikeouts, and shapes because pdf.js would drop the change). Writes `/Contents` and `/Popup` through the same writer.
- Copy, paste, and duplicate (⌘D).
- Polygon and polyline clouds (`/Polygon`, `/PolyLine` with `/BE`), which is what Acrobat's own Cloud tool makes. Claiming them makes Acrobat's clouds editable too.
- Squiggly underline.
- Custom text stamps (your own word, name, and date).
- Dash styles in the Shapes dropdown.
- Flatten Annotations as a page edit, for sending a file nobody can change. constructionlab's `drawPdfAnnotation` is the "baked" half of that already.

## Decisions for Ryan

1. **Claim other apps' shapes, strikeouts, and underlines** so they're editable in Clumsy, not just Clumsy's own. Lean: yes. It's the same code, and editing Acrobat markup is half of why people open a second app.
2. **Lucide set: curated (~50 icons) or all ~1,600 through dynamic imports.** Lean: curated. Keeps the bundle down and the picker short.
3. **Electrical symbols in a general PDF viewer.** Lean: yes, as their own category in the picker. Nobody else ships them, and they cost nothing if you never open that tab.
4. **Review stamps in phase 1.** Lean: yes. It's what most people mean by "stamp."
5. **Line and Arrow as two tools** (same `/Line` annotation) rather than one tool with an endings option. Lean: two; it's faster to pick.

## Done when

Phase 1 merged with all four checks and the Mac checklist passed. AGENTS.md gets a Markup section (owned annotations, storage keys, the writer and appearance streams, `noView`, claimed subtypes, export from bytes) and updates Sticky notes and Saving for the shared annotations job. `docs/pdfjs-upgrade.md` lists the new pdf.js dependencies. CHANGELOG has the entry under Unreleased as Added. The roadmap lists it.
