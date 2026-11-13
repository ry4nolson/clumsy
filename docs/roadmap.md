# Clumsy: roadmap and status

Last updated 2026-11-13, at v0.15.2.

The idea: give away the PDF features other apps put behind a paid subscription. Free readers cover viewing, comments, and filling and signing forms. People pay $15–20 a month for combining, organizing, compressing, password protection, OCR, and redaction. Common complaints about the big subscription app: it's slow, it nags with upsells and AI popups, and it charges monthly just to combine and sign files. Preview users complain that it chokes on huge PDFs, exports one page at a time, and doesn't calculate form fields.

## Shipped

- **v0.2.2 hardening (PR #1):**
  - ⌘Q asks before discarding unsaved changes.
  - The webview can only read files you handed it, and there's a CSP.
  - File reads and writes run off the main thread.
  - One window per file.
  - Clumsy notices when another app changed a file, saves through symlinks, and reloads unedited tabs when the file changes on disk.
- **v0.2.3 organize pages (PR #2):**
  - Reorder, select, delete, rotate (saved to the file), and extract to a new tab.
  - Insert pages from a file, or by dropping a PDF on the thumbnails. Combine Files.
  - Per-tab page undo and redo.
  - Delete and extract scrub the removed pages completely: content, structure-tree alt text, field values, XFA, and bookmarks and links (including named ones).
- **v0.2.4 shortcuts and navigation (PR #3):**
  - Shortcuts remapped to VS Code's defaults: ⌘B sidebar, ⇧⌘E thumbnails, ⇧⌘O outline, ⌘N new tab, ⇧⌘N new window, ⌃G go to page, ⌘↑ / ⌘↓ first and last page.
  - Command Palette (⇧⌘P).
  - Go to File (⌘P), over open tabs and recent files.
  - Reopen Closed Tab (⇧⌘T) and Save All (⌥⌘S).
- **v0.2.5–0.2.10 release polish:**
  - Help and About links open in the browser again.
  - Version files stay in sync on release.
  - Branded DMG window, built with Homebrew's `create-dmg`.
  - Update check on startup and on window focus, showing release notes for every version since the installed one.
- **v0.2.11–0.2.13 find:**
  - Find works in the packaged app again. The real fix (0.2.12) polyfills `ReadableStream` async iteration so pdf.js can hand find the page text in WebKit.
  - Regular expression search: the .* toggle in the find bar.
- **v0.3.0–0.3.2 compare documents** (phase 1 of `docs/pdf-diffing-plan.md`):
  - Compare With File… and Compare Split Panes, highlighted as DOM overlays so nothing reaches Save.
  - Changes sidebar tab, Next / Previous Change (⌥F5 / ⇧⌥F5), linked scrolling, Swap Sides, End Comparison.
  - Change filters, word counts, list follows the document.
  - Export Comparison Report.
- **v0.4.0 Document Map:** minimap pane with the viewport highlighted, find/compare/selection marks, ⌥⌘B.
- **v0.4.1–0.4.2 pdf.js viewer parity:**
  - Vertical, horizontal, wrapped, and page scrolling. No, odd, and even spreads. Per tab, last choice remembered.
  - Go Back / Go Forward (⌃- / ⌃⇧-, mouse buttons), per-tab history that survives page edits.
  - Page labels in the page box, thumbnails, Go to Page, and the palette's `:label`.
  - Documents' own open action, page mode, and page layout on first open.
  - Hand tool, hold Space to pan.
  - Thickness, opacity, and font size for Draw, Text Note, and freehand highlights.
  - Match Diacritics. Caret Browsing (F7).
  - Page labels now move with their pages through edits (was a known gap).
- **v0.5.0 images in and out:**
  - Export Pages as Images: PNG or JPEG, 72/150/300 dpi, all/current/selected/range, prints markup and form values, overwrite check, cancel, Show in Finder.
  - New PDF from Images and image drops. JPEGs embedded untouched with EXIF orientation.
  - Insert images as pages, undoable.
  - About and Shortcuts became in-window sheets.
- **v0.6.0 Page Labels editor:** Pages > Page Labels…, undoable page edit.
- **v0.7.0 Markdown files:** rendered by default, ⇧⌘V CodeMirror source toggle that keeps your place, outline, minimap, find, live reload, default Markdown app. Navigation guard and a read-only allowlist for linked files.
- **v0.8.0–0.8.3 in-app updates and restart sessions:**
  - Signed in-place install through `tauri-plugin-updater`, with `requireSignedVersion`.
  - Restart Now brings back every window, split, tab, page, zoom, and unsaved change. Window positions restored.
- **v0.9.0–0.9.1 pdf.js's newer editors:**
  - Comments with a Comments sidebar tab. Sticky notes, written by Clumsy as incremental updates since pdf.js can't write `/Text`.
  - Typed, drawn, or uploaded signatures as vector ink, up to five saved. The old PNG signature converts on first use.
  - Alt text, undo bar, show/hide highlights.
  - 0.9.1: Draw cursor fixed, lost strokes fixed, settings changes no longer restyle old strokes, Other Color picker.
- **v0.10.0 form tools (PR #10):**
  - Tab / ⇧Tab through fields in order across pages, even ones not drawn yet. Go > Next/Previous Form Field.
  - Reset Form and Flatten Form, both undoable.
  - View > Highlight Form Fields toggles field shading and required-field outlines.
  - Fill In marks for paper forms: checkmark, cross, dot, today's date. Vector, movable, resizable.
- **v0.10.1–0.10.9 hardening and performance** (`hardening` branch; numbers in `docs/perf-baseline.md`):
  - 0.10.1: closed tabs free their memory; thumbnails and the Document Map let go of far-away pages; hidden tabs stop rendering; scans scroll about twice as smoothly; a 300-page scan opens in about 400 MB instead of 2.3 GB; the WebKit stream deadlock that left pages stuck loading is worked around.
  - 0.10.2: thumbnails and the map keep photos on dark pages.
  - 0.10.3: Markdown minimap drawn on a canvas (half the DOM), find about ten times faster on long files, no freeze switching a 2 MB file to source.
  - 0.10.4: pdf-lib and the Markdown stack load on first use; the main bundle went from 2.0 MB to 1.1 MB.
  - 0.10.5: one 256 MB page-undo budget per window instead of per tab; damaged PDFs say so.
  - 0.10.6: page edits, Flatten, and sticky notes survive page trees and form fields that loop; notes saved into files with a broken cross-reference table are no longer lost.
  - 0.10.7: comparing long documents anchors on unique runs of words, so a 1,200-page revision compares in about 3 s (9 s in WebKit) with the real changes instead of 27 s with nearly everything marked; WebKit memory for that comparison halved (3.5 GB to 1.74 GB); the Changes list shows 400 rows at a time and the map merges its marks.
  - 0.10.8: page edits run pdf-lib in a worker, so an edit on an object-heavy file takes ~15 ms of main-thread time instead of ~95–125 ms.
  - 0.10.9: the three review seams. Markdown links and images are confined to their folder, or their repository when they're in one. Picked and dropped images are read-only. The export Replace prompt comes from Rust and only overwrites the files you agreed to. Windows can't navigate to other local servers. Slow network volumes in recent files no longer freeze the window. Right-click Back/Reload and links on Markdown math no longer reload the window and drop unsaved tabs. Markdown can't cover the toolbar or pop boxes over the window. Links only open web and mail addresses. pdf.js is pinned at 6.4.299 with a contract test (`tests/pdfjsContract.test.ts`) and an upgrade checklist (`docs/pdfjs-upgrade.md`). Clumsy now requires macOS 15.4.

- **v0.11.0 print (PR #12, plan in `docs/print-plan.md`):**
  - Print (⌘P) and Print Selected Pages through the system print panel. Go to File moved to ⌥⌘P.
  - PDFs print through PDFKit from `viewer.save(true)`'s bytes, so unsaved markup, typed form values, and sticky notes print. Drawn by Clumsy's own print view (`ClumsyPrintView` in `print.rs`) so pages re-fit when the printer or paper changes, at actual size when they fit.
  - Encrypted and print-restricted files are decrypted in the worker (`pdfDecrypt.ts`) and print at full quality; permissions are ignored.
- **v0.12.0 right-click menu and print phase 2 (plan in `docs/context-menu-plan.md`):**
  - Native right-click menu on the page, built in Rust: a palette row of tools (picked from the toolbar by right-clicking a tool), Copy/Highlight/Comment for selected text, Open/Copy Link, Add Comment Here, Back/Forward, a Zoom submenu, and the thumbnail menu's page commands for the clicked page or selection, without scrolling.
  - Print phase 2 (PR #13): Markdown prints the rendered document, light colors in dark mode, long code lines wrapped; Save as PDF turns any Markdown file into a PDF. Damaged PDFs and files that can't be decrypted print as page images, with progress and Cancel.
- **v0.13.0 passwords (plan in `docs/password-plan.md`):**
  - Set Password… and Remove Password in the File menu, AES-256, undoable like page edits, nothing written until Save. Lock icon on protected tabs.
  - Page edits and sticky notes work on password-protected files; the file keeps its password on Save. Owner-only files lose their restrictions when Clumsy rewrites them.
  - Clumsy doesn't ask again for a password it already has (reloads, undo, outside changes, tab moves).
- **v0.13.1 toolbar dropdowns:** tool settings moved into dropdowns next to Highlight, Text, Draw, Sign, and Fill In; the toolbar stays on one row and overflows into a More menu.
- **v0.14.0 markup (PR #15, plan in `docs/markup-plan.md`):**
  - Shapes: rectangles, ellipses, revision clouds, lines, and arrows, with stroke, fill, thickness, and opacity.
  - Stamps: review stamps with today's date, icons, and about 40 electrical plan symbols.
  - Underline and Strikethrough, as Highlight modes or on selected text.
  - Select, move, resize, nudge, restyle, and delete, all undoable, including the same kinds of markup from other apps.
  - Saved as standard annotations with their own appearance streams, so they look the same everywhere.
- **v0.14.1–0.14.2 full code review and signature fonts (PR #16):**
  - 0.14.1: data-loss fixes. A document stays marked as edited when Save is cancelled or fails, when pages are extracted, and when a tab move fails; deleting markup after a save marks it edited. Plus about twenty correctness fixes across page edits, passwords, Markdown, find, and compare. Saving keeps Finder tags and other extended attributes. Update checks repeat every few hours.
  - 0.14.2: sixteen handwriting fonts for typed signatures; the saved-signature list fills in right away.
- **v0.15.0 digital signatures (plan in `docs/digital-signatures-plan.md`, contract in `docs/digital-signatures-contract.md`):**
  - Validation: a status bar over signed documents, a Signatures sidebar tab, a details sheet with the certificate, timestamp, and revocation status, View Signed Version, and Trust Signer in Clumsy.
  - Sign Digitally with an identity you already have (Keychain, smart card, security key), in a field, a corner, a drawn box, or invisibly. Timestamped, with revocation data embedded.
  - Certify Document, Add Validation Data, and Seal with Timestamp.
  - Anything that rewrites a signed PDF asks first, since it removes the signatures.

- **v0.15.1–0.15.2 sidebar resize and the first Windows build (PRs #17–#20):**
  - 0.15.1: the sidebar resizes by dragging its edge, with the width remembered.
  - Windows: tabs in the title bar and the menu in a dropdown, a local cross-build script, and a Windows CI job.
  - The release is split into build and publish jobs that run in parallel, builds the Windows installer, and attaches it. Downloads have plain names, and the website offers Windows.

## Next, in order

1. **Form calculations.** pdf.js `enableScripting` in its sandbox. Check against the CSP (`wasm-unsafe-eval`, no `unsafe-eval`). Script-set values won't trip the typed-input detection `routeStep` relies on, so undo routing needs a look. Has to play nice with 0.10's Reset and Flatten.
2. **Compress.** Downsample big images to get under email size limits.
3. **Document info batch:** Document Properties, Attachments tab, Layers tab, XFA (`enableXfa` is still false). Each is small, so ship them together.
4. **OCR with Apple's Vision framework.** Local, free, from Rust.
5. **Real redaction.** Has to remove what's under the box. Start from `pdfStructure.ts` / `pdfStructTree.ts`.

Cleanup, whenever: split `styles.css` (2,454 lines), prune the merged remote branches. Not blocking anything.

## Hardening pass (done)

Plan in `docs/hardening-plan.md`, measurements and every round's results in `docs/perf-baseline.md`.

Done:
- **Performance**, measured on text-1200, scanned-300, form-550, annotations-5000, markdown-2mb, and the hostile set, in Chromium and in WKWebView. Every ranked finding is fixed (0.10.1–0.10.5), plus the comparison fix in 0.10.7 and page edits in a worker in 0.10.8.
- **Lifecycle and leaks:** closed tabs, hidden tabs, canvas release, decoded scan images (0.10.1).
- **PDF write paths:** rotate, delete, move, insert, relabel, flatten, extract, combine, and sticky notes run against every hostile fixture, with every output reopened in pdf.js (0.10.6).
- **Rust IPC surface, webview security, and pdf.js coupling reviews:** merged to `main` after 0.10.8. pdf.js pinned exactly, with a contract test and `docs/pdfjs-upgrade.md`.

Leftovers, not blocking:
- **Housekeeping:** split `styles.css` (2,454 lines); prune the remote branches. Git shows `code-review-fixes`, `markup`, `password-protect`, `print-phase-2`, `print-plan`, `split-release`, `windows-download`, and `windows-titlebar` as merged into `main`. `changelog-versioning`, `docs-new-features`, `feature/organize-pages`, `form-tools`, `images-in-and-out`, `page-labels-editor`, `pdfjs-parity-1`, `pdfjs-parity-fixes`, and `vscode-shortcuts` shipped but aren't ancestors of `main`, so confirm each before deleting. `fix/review-safety` isn't merged.
- **Performance leads:** comparing two 1,200-page files holds about 1.2 GB in WebKit, mostly the text of every page. Every command on text-1200 used to block the main thread for about 95 ms; page edits are fixed by the worker, so check whether Undo and the palette still do.

## pdf.js parity

Goal: every feature pdf.js 6.4.299 offers is reachable in Clumsy.

Done: everything from the old "viewer flags and wiring" list (0.4.1), comments, signatures (moved onto pdf.js's `SignatureEditor`), alt text, and the undo bar (0.9.0), and print (0.11.0, through PDFKit rather than pdf.js's print service). `enableDetailCanvas` stays off on purpose; AGENTS.md explains the image-restore conflict.

Left:
- **Document Properties, Attachments, Layers, XFA.** Next item 4.
- **Presentation mode.** Full screen, one page at a time, arrow keys and click to advance.
- **Form scripting.** Next item 2.
- **Copy and print permissions: decided, ignored** (2026-11-06). Every file can be copied from and printed, like Firefox's pdf.js and Evince. `TextLayerMode.ENABLE_PERMISSIONS` stays off.

## Compare, later phases

From `docs/pdf-diffing-plan.md`. Not scheduled against the list above.

- **Phase 2:** pixel diff for pages with no text (scans, drawings), plus a Visual Diff toggle for layout and image changes. Compare with Saved. Options to ignore case, whitespace, and punctuation. Notices when page sizes differ.
- **Phase 3:** annotation and form-field differences, matched by type and rect. Metadata differences.

## Small asks

- A hide button in the sidebar header. The toolbar's first button and ⌘B already toggle the sidebar, but it's easy to miss. Low priority.

## Skip for now

- Editing existing text and converting to Word. Hard, and every competitor does it badly.

## Known gaps

- Quitting from the Dock or logging out skips the unsaved-changes prompt, because tao lacks `applicationShouldTerminate`. Quitting doesn't save a session either.
- Releasing a thumbnail drag outside the sidebar still moves the pages, and the drag doesn't autoscroll while the pointer is held still.
- After typing into a form field, ⌘Z won't undo the last page edit until another page edit happens. On purpose, so Undo can't take the typed values with it.
- Pages pulled in from another file keep their annotations, but their form fields stop working.
- Clicking Go > First/Last Page in the menu bar while a text field has focus moves the caret instead of changing pages. The palette always changes pages.
- ⌃G (Go to Page) and ⌃- / ⌃⇧- (Back/Forward) are macOS-only. Windows needs other combos.
- `LSSetDefaultRoleHandlerForContentType` has been deprecated since macOS 12. Replace it with `NSWorkspace.setDefaultApplication(at:toOpenContentType:)` eventually.
- The comparison report uses standard Helvetica (WinAnsi only). Accents get stripped, CJK and emoji print as `?`.
- Compare only sees text. Scanned or image-only pages get a "no text to compare" notice until phase 2.
- Comparing two long documents with little in common stops diffing after the worker's 12 s budget; everything past that point shows as one change. The Changes list shows 400 changes at a time.
- Closing a tab mid-drawing logs one harmless unhandled rejection from pdf.js.
- Picking any editing tool on a file with existing markup marks it edited, because pdf.js turns that markup into editors.
- Restart sessions: edits made after a window answers but before the last one does aren't kept, and a crash before the windows finish restoring loses the session.
- `styles.css` (2,454 lines) is over the 500-line rule.
- Comments on shapes, underlines, and strikeouts from other apps don't show a popup in Clumsy. They stay in the file (phase 2 of `docs/markup-plan.md`).
- Unsaved shapes, stamps, and sticky notes don't appear in thumbnails or the Document Map until saved.
- Digital signing is macOS-only, and encrypted files can't be signed.
- Quick page edits on a 1,200-page file log "Transport destroyed" for pages pdf.js hadn't set up yet. pdf.js's own logging; the new version loads fine.
- Clumsy requires macOS 15.4 or later.
