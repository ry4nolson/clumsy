# Document info plan

Written 2026-11-17 against `main` at v0.21.0. Roadmap item 4: Document Properties, an Attachments tab, a Layers tab, and XFA. The first three are small and ship together. XFA isn't small (see the end), so it's its own phase.

## Document Properties

An Info tab in the sidebar (the info icon), on every PDF tab, read-only; File > Document Properties (⌘D) opens it. It started as a sheet, but a panel that stays beside the document is easier to find and to glance at.

Rows, from `readProperties` (`src/lib/documentProperties.ts`, pure formatting tested; the reading is a thin async wrapper over pdf.js):

- **File:** name, location (the folder, when the tab has a path), size (`getDownloadInfo().length`: the bytes pdf.js has open, so after a page edit it's the edited version; markup that isn't saved yet doesn't count).
- **Description:** title (XMP `dc:title` first, then `/Title`, like Firefox), author, subject, keywords.
- **Origin:** created and modified (`PDFDateString.toDateObject`, shown in the reader's locale), application (`/Creator`), PDF producer (`/Producer`).
- **Document:** PDF version, pages, page size of the current page (in inches for US and Canadian locales, millimeters elsewhere, with the standard name when it matches one: Letter, Legal, Tabloid, A3–A5, B4–B5, ANSI and ARCH sizes, and portrait or landscape), tagged (`getMarkInfo().Marked`), fast web view (`IsLinearized`), language.
- **Security and content:** password protected or restrictions only (`EncryptFilterName` plus the tab's protection), form (none, fillable, or XFA: `IsXFAPresent` with no AcroForm fields, which is what a dynamic XFA form looks like with `enableXfa` off, so the sheet explains the "Please wait" page until phase 2), signatures (`IsSignaturesPresent`), attachments and layers counts.

Empty values are left out, not shown as "-". Copy is selectable text. Editing the description is a later step: pdf-lib only writes `/Info`, readers (pdf.js included) prefer XMP's `dc:title`, and the page-edit worker has no `DOMParser` to rewrite XMP, so it needs its own small plan.

## Attachments

A sidebar tab (paperclip icon, like Tool Chest's icon tab) that only appears when the document has attachments, plus View > Attachments, enabled only then (`needsAttachments`, `hasAttachments` in the tab snapshot, wired like `hasForm`).

Two sources, merged by `listAttachments` (`src/lib/attachments.ts`):

- The catalog's `/EmbeddedFiles` (`getAttachments()`; in pdf.js 6 the content loads lazily through `getAttachmentContent(id)`).
- File attachment annotations on pages (`getAnnotationsByType({FILEATTACHMENT})`), with their page. One scan per document, after load, in pdf.js's worker.

Each row shows the file name, description, and page (for annotation attachments; clicking the row goes there). Opening (double-click, Enter, or the Open button): a PDF or Markdown attachment opens as a new pathless tab in Clumsy, not marked edited; anything else is saved. Save… (every row) asks where to save and writes the bytes.

Clumsy never launches an attachment in another app: an attachment can be anything, including a program, and handing it to the system's default handler would run it.

Saving goes through a new Rust command, `save_attachment`: the bytes as the raw body and the suggested name in `x-name`, a native save dialog with no type filter, then an atomic write to the picked path in the same call. Nothing goes on the allowlists, since the path never comes back for another write. The suggested name is reduced to its last path component. Desktop only for now; Android needs `create_document` with an arbitrary MIME type.

pdf.js's own triggers for attachments (double-clicking a file attachment annotation's icon, and links whose action is a `/GoToE` or attachment) call the viewer's `downloadManager.openOrDownloadData`. Clumsy passes a download manager that runs the same open-or-save path, so those work too.

## Layers

A sidebar tab (layers icon) that only appears when the document has optional content, plus View > Layers (`needsLayers`, `hasLayers`).

`useViewerLayers` (its own hook, called from `usePdfViewer` like `useViewerForm`) waits for `pagesinit`, reads the viewer's `optionalContentConfigPromise`, and builds the tree with `layerTree` (`src/lib/layers.ts`): `getOrder()` entries are group ids, nested arrays, or `{ name, order }` labels; groups not in the order aren't shown, as the spec says. Toggling calls `setVisibility` (which keeps radio-button groups exclusive) and hands the config back through the `optionalContentConfigPromise` setter, which re-renders the pages. It also listens for `optionalcontentconfigchanged`, so a link's SetOCGState action updates the checkboxes. Show All, Hide All, and Reset (back to the document's own default state) sit at the top.

Visibility is part of the view, never the file: Save doesn't change it.

- **Kept across reloads.** `ViewState.layers` holds only the groups the user changed (`{ id, name, visible }`), so page edits, outside-change reloads, tab moves, Reopen Closed Tab, and restart sessions keep it. `restoreLayers` matches by id when the name still agrees, otherwise by name when it's unique.
- **Thumbnails and the Document Map follow it.** They render with the same config, re-render when its hash changes, and `forgetPageCanvases` drops the viewer canvases they would otherwise copy from.
- **Print and Export Pages as Images don't.** They use the document's own print settings (`/Usage /Print`), which is what other readers do by default. Following the view needs a print-intent config with the same visibility (pdf.js refuses to mix intents) and, for PDFKit printing, hiding the content in the bytes. Later.

## XFA (phase 2, not in this batch)

Turning on `enableXfa` only changes documents whose catalog says they need XFA rendering (dynamic XFA forms; static XFA forms keep working as AcroForms). Those show only their fallback page today ("Please wait…" in most of them). With it on, pdf.js lays the form out into its own pages and draws them as HTML in an XFA layer instead of a canvas. What that breaks in Clumsy:

- pdf.js builds no annotation editor UI manager for pure XFA documents, so every tool, comments, sticky notes, markup, and the editor managers have to be off (a `pureXfa` flag like `hasForm`); `setEditorMode` would otherwise wait forever for an editor layer.
- The page count comes from the XFA layout, not the file, so every page edit, Compress, extract, combine, comparison, and digital signing would work on the wrong pages. All of them have to refuse pure XFA.
- Canvases are blank, so thumbnails and the Document Map show nothing; they need to copy the XFA layer or show page outlines.
- PDFKit would print the fallback page, and the image fallback draws blank canvases. Printing has to go through the webview, like Markdown: render `allXfaHtml` with `XfaLayer.render({ intent: "print" })` into a print root and call `print_webview`.
- Saving writes the filled values into the XFA datasets (pdf.js does this); form scripts in XFA (FormCalc) don't run.
- No fixtures. Dynamic XFA forms come mostly from government agencies; we need a few to test against before starting.

Until then, Document Properties says when a file is dynamic XFA, so a blank "Please wait" page has an explanation.
