# Markup list plan

Written 2026-11-14 against `main` after the measurement and tool chest plans. Roadmap item 3.

The markup list is every markup in the document as a row in a table: page, type, subject, author, date, color, comment, status, and the value for measurements. You can sort, filter, jump to a markup, set its status, and export. It's how a reviewer turns a marked-up drawing set into a punch list, and how an estimator turns takeoffs into a spreadsheet. It also makes the tool chest's names pay off, since "Drywall" and "Conduit run" become a column you can sort by.

## What's already there

- **Comments sidebar tab** (`CommentsList.tsx`): shows comments while Comments mode is on, with clicks going through `linkService.goToXY`, `waitForEditorsRendered`, and `selectComment`.
- **Sticky notes** read every `/Text` annotation in the file with `getAnnotationsByType` when the Comments list opens (`stickyNotes.ts`).
- **Clumsy-owned markup:** the file's shapes, stamps, and text markup from the `readMarkup` worker job, plus unsaved changes in `annotationStorage` (`markupIn`, `notesIn`).
- **The Changes tab** already solves a long list: it renders at most 400 rows around the one in view (`changeWindow`), with Show earlier and Show later.
- **The measurement plan's** Measurements tab and CSV export, including a new allowlisted `.csv` write in Rust.

## Rows come from three places

1. **Saved annotations in the file:** `getAnnotationsByType` over every markup subtype (Text, FreeText, Line, Square, Circle, Polygon, PolyLine, Highlight, Underline, StrikeOut, Squiggly, Stamp, Ink, Caret, FileAttachment), skipping widgets, links, popups, and replies. pdf.js gives subtype, rect, color, `/T` (author), modification date, `/Contents`, and id. Clumsy-claimed kinds take their richer data (subject, fill, measurement value) from `readMarkup`.
2. **Clumsy-owned changes:** `markupIn` and `notesIn` from storage, overriding or removing their file rows, so the list shows what Save would write.
3. **pdf.js's unsaved editors:** new highlights, drawings, text boxes, stamps, and signatures that only exist as editors until Save. Reading those without tripping pdf.js internals is the spike's first question.

`src/lib/markupRows.ts` (new, pure, tested) merges the three into one `MarkupRow[]`: `id`, `pageIndex`, `pageLabel`, `type`, `subject`, `author`, `date`, `color`, `comment`, `status`, `measure` (value and unit), `source` (`file`, `clumsy`, `editor`), and `readOnly` (leadered dimensions, locked annotations).

## Status

Review status uses the PDF spec's own mechanism, which Acrobat and Bluebeam both read and write: a reply `/Text` annotation with `/IRT` pointing at the markup, `/StateModel /Review`, and `/State` set to `/Accepted`, `/Rejected`, `/Cancelled`, `/Completed`, or `/None`. The newest reply wins.

- The list reads the state replies as it reads everything else, and shows the latest status per markup.
- Setting a status from the list (one row or a selection) adds a state reply as a `clumsy-note:` change. `writeAnnotations` writes `/Text` notes already, so this is a small extension: `/IRT`, `/StateModel`, `/State`, `/F` hidden (state replies aren't drawn), and `/T` set to the author. It's undoable, and nothing is written until Save.
- Sticky notes and the Comments tab ignore state replies; today they'd show up as stray replies.

## Author

Rows show `/T` when an annotation has it. Clumsy doesn't write `/T` today, so its own markup shows no author. Add a "Your name" field (`clumsy.authorName`) at the top of the markup list, empty by default. When set, new Clumsy markup, sticky notes, and state replies get `/T`, and pdf.js's editors get it through their own author parameter if 6.4.299 has one (spike).

## The tab

**Markups** sidebar tab, next to Comments, always available on a PDF that has any markup or while a markup tool is on. It folds in the measurement plan's Measurements tab: measurements are rows with a value column, and the totals strip at the top shows total length and area for whatever the current filter shows. If measurement ships first with its own tab, this replaces it.

- **Columns:** Page, Type, Subject, Comment, Author, Date, Status, and Value when there are measurements. The sidebar is narrow, so it shows Type/Subject, Page, and Status by default, with a column picker for the rest. The sidebar is already resizable (0.15.1).
- **Sort** by any column. **Filter** by type, subject, author, status, and color, plus a text search over subject and comment. Group by page or by subject.
- **Click** a row to go to it and select it: Clumsy markup through the markup layer's selection, pdf.js editors and comments through `selectComment`, and other annotations by scrolling to the rect with a brief outline flash.
- **Select several** (⇧/⌘-click) to set status or delete together, as one undoable change.
- **Long lists** render the same way the Changes tab does: a window of rows around the one in view. annotations-5000 is the test.

## Export

- **Export Markups…** writes CSV with every column plus x/y and color hex, through the `.csv` write the measurement plan adds. Filters apply, so "export only open Drywall items" works.
- **Copy Markups** puts the same rows on the clipboard as tab-separated text.
- **Markup summary PDF** (phase 2): a report laid out like the comparison report (`comparisonReport.ts`, standard Helvetica), with a thumbnail crop of each markup. Bluebeam's summary is what people send to the architect.

## Code

- `src/lib/markupRows.ts`: merging, sorting, filtering, totals, CSV rows.
- `src/lib/reviewState.ts`: reading state replies, picking the latest, and the note change that adds one.
- `src/hooks/useMarkupList.ts`: gathers the three sources for a tab, refreshes on `annotationstorage` changes, page edits, and reloads, cancels stale reads.
- `src/components/MarkupList.tsx`: the tab, column picker, filters, row window (styles in `Markup.css`).
- `Sidebar.tsx`: `"markups"` in `SidebarTab`. `stickyNotes.ts` and `CommentsList.tsx`: skip state replies.
- `notesPdf.ts`: write state replies. `markupPdf.ts`: `/T` when an author is set.
- `commands.ts` / `menu.ts`: Show Markups, Export Markups…, Copy Markups, and the status commands for the right-click menu on selected markup.

## Spike first

1. **Unsaved pdf.js editors:** list them per document (page, type, color, rect, text) through public or already-relied-on API (`annotationStorage` values, the UI manager Clumsy already holds), add the hook to `docs/pdfjs-upgrade.md`'s inventory and the contract test, or decide they appear only after Save.
2. **`getAnnotationsByType` on annotations-5000:** time on the main thread and in the worker. Batch by page if it blocks.
3. **State replies from Acrobat and Bluebeam files:** confirm both use `/StateModel /Review`, and check what Bluebeam's own status column stores beyond it.
4. **An author parameter** on pdf.js 6.4.299's editors.

## Tests (Linux container)

- `markupRows.test.ts`: merging file rows with Clumsy changes (edited, deleted, new), editor rows, readOnly rows. Sort stability, every filter, totals by unit, CSV quoting.
- `reviewState.test.ts`: latest state wins by date then order, `/StateModel /Marked` ignored, a state reply written and read back, undo.
- Sticky notes and Comments ignore state replies.
- Commands placed once.

## Mac checklist

- A file marked up in Acrobat and one from Bluebeam: every markup listed with the right type, author, and comment. Statuses set in either app show here.
- Set statuses here, Save, open in Acrobat and Bluebeam: they show the same status.
- Click through rows of each source: each one goes to and selects (or flashes) the right markup.
- Filter, then export: the CSV opens in Excel and Numbers with only the filtered rows.
- annotations-5000: the tab opens and scrolls without freezing the window. Note the times in `docs/perf-baseline.md`.
- Windows build: the same.

## Decisions (2026-11-14)

1. **Markups tab next to Comments, Comments left alone.** Decided: yes for now. Comments is a mode, and the list is a ledger. Fold Comments in later if they feel redundant.
2. **Author name is opt-in, empty by default.** Decided: yes. Writing the Mac's full name into files people send out shouldn't happen silently.
3. **Status through the spec's review state replies,** not a Clumsy-only key. Decided: yes, it's what makes statuses round-trip with Acrobat and Bluebeam.
4. **The summary PDF waits for phase 2.** Decided: yes, CSV and copy cover the punch list first.

## Done when

Merged with the four checks and the Mac checklist. AGENTS.md gets a Markup list section (row sources, review state replies, author, the row window, export). CHANGELOG under Unreleased as Added. The roadmap lists it as shipped.
