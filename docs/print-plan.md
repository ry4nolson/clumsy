# Print plan

Written 2026-11-06 against `main` at v0.10.9. Roadmap item 1.

## The call: print PDFs through PDFKit, not the webview

Three ways to print exist in this stack. Only one is any good.

- **Webview print** (`WebviewWindow::print()`, which is wry's `printOperationWithPrintInfo:` on the WKWebView). Prints the whole window: toolbar, sidebar, tabs. pdf.js only keeps nearby pages rendered (and 0.10.1 made it let go of far ones more aggressively), so most pages wouldn't be there to print anyway. wry doesn't wire `window.print()` on macOS, so the JS route is dead too.
- **pdf.js's own print service** (`PDFPrintService`). Rasterizes every page to a 150 dpi canvas inside a `#printContainer`, then calls `window.print()`. Raster output, gigabytes of canvases on long files, and it needs the `window.print()` that WKWebView doesn't give us.
- **PDFKit.** Hand Rust the PDF bytes, open them as a `PDFDocument` (in memory, `initWithData:`), and run `printOperationForPrintInfo:scalingMode:autoRotate:` as a sheet on the document's window. Vector output, Apple's renderer, and the native panel brings preview, copies, page ranges, paper size, two-sided, scale, and Save as PDF for free. No temp file.

PDFKit wins. The only work on our side is getting the right bytes to it, which already exists: `viewer.save()` returns what Save would write, with unsaved markup, typed form values, and sticky notes baked in. Page edits and tab moves already depend on it.

Every binding needed is in `objc2-pdf-kit` 0.3.2 (`PDFDocument::initWithData`, `isLocked`, `unlockWithPassword`, `allowsPrinting`, `printOperationForPrintInfo_scalingMode_autoRotate`, `PDFPrintScalingMode`), the same objc2 0.3 line wry 0.57 already pulls in.

## What prints and what doesn't

Prints: page content, the saved `/Rotate`, all markup including unsaved (ink, highlights, text, signatures, Fill In marks, comments' icons per their print flag), typed form values, sticky notes per their print flag.

Doesn't: find, compare, selection, and Document Map highlights (DOM overlays, never in the bytes). Form field shading and required outlines. The view-only rotation (⌘R), same rule as image export. Annotations without the Print flag.

## Phase 1: print PDFs (v0.11.0)

### Commands

- **Print…** in the File menu, palette, `needsDocument`, on ⌘P (`mod+p`).
- **Go to File…** moves from ⌘P to ⌥⌘P (`alt+mod+p`, free today). Only `commands.ts` names the combo; the menu, Shortcuts sheet, and palette read it from there. Update the menu snapshot and call the move out in the changelog so nobody thinks ⌘P broke.
- **Print Selected Pages…** in the Pages menu and the thumbnail context menu, shown when there's a selection. Same page rule as Export Selected Pages as Images: `explicitPages` plus `followCurrentPage`.
- PDF tabs only in phase 1. The command is disabled on Markdown tabs until phase 2.

### Flow (`src/hooks/usePrint.ts`, new)

1. `await settled(tabId)`, then `viewer.commitEdits()`, same as image export.
2. `bytes = await viewer.save()`.
3. Encrypted files (a typed password, or only an owner password with "no printing" or other restrictions): decrypt in the page-edit worker with `@cantoo/pdf-lib` (`PDFDocument.load(bytes, { password })`, where the password is the one the tab opened with, or `''` for owner-only files; 2.11.1 decrypts both) and save unencrypted. PDFKit only ever sees plain bytes, so permissions never reach it and no password crosses IPC. The decrypted bytes live in memory for the print and nothing else.
4. Selected pages: run the existing extract op in the page-edit worker on those bytes. It's already scrubbed and tested against the hostile fixtures, so no new pdf-lib code. Everything else prints the full bytes and lets the panel's page range do the rest.
5. `invoke("print_pdf", bytes, { headers: { name } })` with the raw body, like `write_image`.
6. Rust answers `"shown"` or `"unreadable"`. Phase 1 shows an error for `"unreadable"` and for a failed decrypt; phase 2 sends both to the raster fallback.

Printing doesn't touch the tab's edit state, undo stacks, or the file on disk.

### Rust (`src-tauri/src/print.rs`, new)

- `lib.rs` is already 525 lines, so the command lives in its own module and `lib.rs` only registers it. Good moment to move one other thing out and get `lib.rs` back under 500.
- `print_pdf(window: WebviewWindow, request: Request)`: read `InvokeBody::Raw` and the job name from a header. Hop to the main thread with `run_on_main_thread` (PDFKit and AppKit need `MainThreadMarker`).
- On the main thread: `NSData` from the bytes, `PDFDocument::initWithData`. `None`, or still locked (shouldn't happen after the decrypt), → `"unreadable"`. Never consult `allowsPrinting`.
- Copy `NSPrintInfo::sharedPrintInfo()`, build the operation with `PageScaleDownToFit` and `autoRotate: true`, set the job title to the document name (that's also the default file name for Save as PDF), show the print and progress panels, and run it as a sheet on `window.ns_window()` with `runOperationModalForWindow_delegate_didRunSelector_contextInfo`.
- A sheet keeps every other window responsive. Second Print on the same window while a sheet is up: refuse quietly (the sheet is already the answer).
- Lifetime: the operation's view retains the `PDFDocument`. Verify on the Mac that nothing gets freed early (see checklist).
- Not macOS: `cfg(not(target_os = "macos"))` returns an error string. `platform.ts` hides the commands where printing isn't available, so it's never seen.

### Cargo

macOS target only: `objc2 = "0.6"`, `objc2-foundation = "0.3"` (NSData, NSString), `objc2-app-kit = "0.3"` (NSPrintInfo, NSPrintOperation, NSWindow), `objc2-pdf-kit = "0.3"` (PDFDocument). All already in the lock file through wry except pdf-kit, so the dependency cost is one small crate. Check `pnpm licenses` picks it up.

### Tests (Linux container)

- `commands.test.ts` / `menu.test.ts`: both commands registered, right menus, `needsDocument`, disabled on Markdown, hidden when the platform can't print.
- Page choice: selection, `followCurrentPage`, and the full-document case produce the right page list.
- Print bytes: on the form, annotations, and hostile fixtures, the bytes handed to `print_pdf` reopen in pdf.js with the right page count, typed values present, and markup present. For the subset, removed pages are gone.
- Decrypt: build fixtures with pdf-lib's own `encrypt` (user password; owner password only with print and copy denied; low-resolution print only). Each comes out unencrypted, reopens in pdf.js with no password, `getPermissions()` returns null, and page count and form values match. Also run it on bytes from pdf.js `saveDocument` of an encrypted file with unsaved markup, since that's an incremental update on top of the encrypted original.
- Rust: header parsing (job name sanitized, non-raw body rejected). The PDFKit part compiles only on macOS; `ci.yml` builds on macOS, so it at least compiles every PR.

### Mac checklist (for the PR)

Native, so none of this runs in the container.

- Panel appears as a sheet on the right window, with preview. Cancel leaves the tab exactly as it was.
- Save as PDF from the panel gives a file that matches the screen, named after the document.
- Unsaved ink, highlight, typed text, signature, Fill In marks, and a sticky note all print. Form-550 with typed values prints the values.
- Find highlights, compare marks, and form shading don't print.
- Mixed page sizes and landscape pages auto-rotate and fit. A page with a saved `/Rotate` prints rotated; ⌘R doesn't.
- Print Selected Pages with a non-contiguous selection prints exactly those pages, in order.
- Password-protected file prints after unlocking, at full quality.
- Owner-restricted files: one with only printing blocked (the blank-pages case), one with printing and copying blocked, one with low-resolution printing only. All three print normally at full quality.
- text-1200: time from Print to panel. annotations-5000: same. Note both in `docs/perf-baseline.md`.
- Hostile set: every file either prints or shows the error, nothing hangs or crashes.
- Two windows, Print in each: each sheet lands on its own window.

## Phase 2: fallbacks and Markdown (v0.11.x, done)

Built as planned, with these differences: image pages keep each page's own size instead of `pdfFromImages`' fit-to-Letter, the resolution steps down from 300 dpi through 200 and 150 to 100 past 500 pages, failed decrypts and extracts go to images instead of handing PDFKit the encrypted bytes, and the Markdown print root renders behind the app, since WebKit doesn't decode images under `display: none`. Rust runs the web view's print operation itself (`print_webview`) rather than wry's `print()`, to copy the print info instead of changing the shared one, give the view a frame, set the job title, and know when the sheet ends.

### Raster fallback

For files PDFKit won't open (damaged files pdf.js repaired on open) and encrypted files the worker couldn't decrypt. Render pages with the existing `renderPageImage` (print intent, annotation storage), build a PDF with `pdfFromImages` from `imagePdf.ts` (embeds JPEGs untouched), hand that to the same `print_pdf`.

Memory is the catch: 1,200 pages at 300 dpi JPEG is around a gigabyte. Use 300 dpi up to some page count, drop to 200 dpi past it, and show progress with Cancel (reuse the export progress view). Tell the user once that this file prints as images.

### Markdown

The rendered view prints through the webview: Rust calls `WebviewWindow::print()`, and a `@media print` block hides the toolbar, tab strip, sidebar, minimap, and find bar and lets the Markdown pane flow as a normal page. Source view prints the rendered document too. Check: images and math rendered before printing, code blocks wrap instead of clipping, dark theme prints light.

Side effect worth naming in the changelog: Save as PDF in that panel turns any Markdown file into a PDF.

## Phase 3: maybe later

- A "what to print" choice: document and markup, document only, form fields only. Needs either a custom accessory view in the panel (real AppKit work from Rust) or a small Clumsy sheet in front of it. Wait until someone asks.
- Page Setup… Paper size already lives in the print panel.
- Print the current view or a zoomed region.
- Windows and Linux: WebView2 and WebKitGTK both have their own print paths. Comes with the ports, not before.

## Decisions

1. **Shortcut (decided).** Print takes ⌘P. Go to File moves to ⌥⌘P.
2. **Print permissions (decided): ignored.** Every file prints, at full quality, including "no printing" and "low resolution only" files. Acrobat and Okular honor the flag; Firefox's pdf.js and Evince ignore it. The flag protects nothing (ISO 32000-1 says nothing in PDF encryption enforces it), and Clumsy already ignores copy restrictions. The trap is PDFKit: a 2019 test found that Preview, on a file restricting only printing, said printing was allowed and printed blank pages. Decrypting in the worker before PDFKit sees the bytes sidesteps that entirely. This also settles pdf.js parity's "copy and print permissions" item: ignore both.
3. **Phase 1 scope (decided).** PDF only. Markdown and the raster fallback are phase 2.

## Side benefit

The decrypt step is most of roadmap item 2's "remove password," and it's the missing piece behind page edits and sticky-note writes refusing encrypted files today. Build it as a shared helper in the worker, not a print-only one.

## Done when

Phase 1 merged with all four checks, the Mac checklist passed, AGENTS.md has a Print section (bytes path, what prints, PDFKit, the shortcut), CHANGELOG has the entry under Unreleased, and the roadmap's item 1 is marked shipped.
