# Hardening and performance pass

Plan for item 1 of "Next, in order" in `docs/roadmap.md`. Written 2026-11-04 at v0.10.0.

No new features land in this pass. Everything goes under `### Fixed` or `### Changed`, so it ships as 0.10.x.

## Order

1. Baseline: fixtures and numbers, before touching anything.
2. Hardening reviews by seam, in parallel. Fixes per seam.
3. Performance fixes, ranked by what the baseline actually shows.
4. Housekeeping.
5. One final reviewer over the combined diff, then Ryan tests a built app before anything reaches `main`.

## 1. Baseline

Measure in a built `.app`, not `pnpm dev`. Chromium hides WebKit-only problems. Build once with Tauri's `devtools` feature so Safari's Web Inspector can attach for timelines and heap snapshots.

**Fixtures** (outside the repo, never committed; `public/*.pdf` is ignored for a reason):

- 1,000+ page text PDF (a long spec or book).
- 300+ page scanned PDF (one big image per page).
- Large AcroForm, 500+ fields across 20+ pages, with calculations and radios.
- Tagged PDF with alt text and a deep structure tree.
- Password-protected PDF.
- Hostile set: truncated file, broken xref, cyclic `/Kids`, cyclic `/Parent`, cyclic struct tree and name tree, a page tree 1,000 levels deep, huge `/MediaBox`, object streams that reference themselves, hybrid xref files, a 50 MB embedded image. Generate most of these with a small script against `@cantoo/pdf-lib` low-level objects so they're reproducible.
- 2 MB Markdown file with many images and code blocks.

**Numbers** (write them into `docs/perf-baseline.md` so the fixes have something to beat):

| Metric | How |
|---|---|
| Cold start to first page painted | Launch with the 1,000-page file, timeline |
| Main bundle size, parse time | `dist/assets`, timeline |
| Memory after scrolling the 1,000-page file end to end with thumbnails and the Document Map open | Activity Monitor (WebContent process) + heap snapshot |
| Same for the scanned file | Same |
| Idle CPU, 10 tabs open across 2 windows | Activity Monitor over 60 s |
| Delete 10 pages from the 1,000-page file: time, peak memory | Timeline |
| Five page edits in a row: history memory | Heap snapshot |
| Compare two 1,000-page files: time to first highlight | Timeline |
| Tab through every field of the big form | Timeline, long tasks |
| Open/close 20 tabs, then GC | Heap snapshot diff (leak check) |

## 2. Hardening reviews

Fresh reviewers, one per seam. Each gets `AGENTS.md`, its file list, and the checklist below, and nothing from this document's suspicions beyond that. Each returns findings with a failure scenario. Fixes land with tests in `tests/` or Rust `#[cfg(test)]`.

### A. Rust IPC surface

Files: `files.rs`, `lib.rs`, `session.rs`, `updates.rs`, `windows.rs`, `recent.rs`, `capabilities/default.json`.

- About 25 non-test `lock().unwrap()` calls. One panic while a lock is held poisons it, and every later file read, write, or restart panics too. Add a poison-tolerant lock helper and use it everywhere.
- Allowlist checks against canonical paths: can a symlink swapped between the check and the write redirect a write? Check `write_pdf`, `write_markdown`, `write_image`, and the temp-file + rename path.
- `write_image` plain-name rules and `existing_files`: Unicode lookalikes, trailing dots and spaces, very long names, names that normalize to `..`.
- Extension gates: case, double extensions, a `.pdf` directory.
- `Transfers` expires stashed bytes after 5 minutes but has no size cap. A page can stash until memory runs out. Cap total bytes.
- `session.rs`: capture ids, re-allowlisting only paths the window was given, the 0700 folder, what happens if the folder already exists and isn't ours, the crash-before-restore gap.
- `updates.rs`: signature and version replay, translocation, timeouts, a manifest pointing at a non-GitHub host.
- Navigation guard `is_app_url`: every URL form that could pass it.
- Sync commands run on the main thread. Confirm none of them touch the disk (`recent.rs` writes on record).

### B. PDF write paths

Files: `pageEdits.ts`, `pdfStructure.ts`, `pdfStructTree.ts`, `pdfPageLabels.ts`, `notesPdf.ts`, `pdfForm.ts`, `imagePdf.ts`, `comparisonReport.ts`, `markPlacement.ts`, `usePageEdits.ts`.

- Run every edit (delete, extract, insert, combine, rotate, label, flatten) over the hostile set. Nothing may hang. Every tree walk needs a visited set or a depth limit.
- Scrub checks walk decoded objects after the edit (inflate every stream, resolve every ref), not raw bytes. Removed page text, its alt text, its field values, its links, and its bookmarks are gone.
- `writeStickyNotes` on xref-stream files, hybrid files, files with junk after `%%EOF`, and files saved twice.
- Flatten Form with odd `/BBox` and `/Matrix`, rotated pages, missing `/DA`, non-WinAnsi values.
- `usePageEdits` queue: an outside reload, a Save, and an Undo arriving mid-edit. A failed edit leaves the tab usable.

### C. Webview security

Files: `markdown.ts`, `markdownDom.ts`, `markdownLinks.ts`, `tauri.conf.json` CSP, `lib.rs` link commands.

- DOMPurify config against current bypass lists: SVG, MathML, `data:` and `blob:` URLs, `srcset`, `xlink:href`, CSS in `style` attributes.
- `read_linked_image` and `open_linked_file`: `../` escapes, symlinks out of the folder, absolute paths, URL-encoded separators.
- CSP checked in a built app (`devCsp` is null). Confirm nothing needs more than `wasm-unsafe-eval`.

### D. pdf.js coupling

Files: `editorManagers.ts`, `commentManager.ts`, `commentPopup.ts`, `pdfjs.ts`, `stickyNotes.ts`, `useViewerTools.ts`, `useViewerForm.ts`, `polyfills.ts`, `Editing.css`.

- Pin `pdfjs-dist` to exactly `6.4.299`.
- Contract test: grep `pdfjs-dist/build/pdf.mjs` and `web/pdf_viewer.mjs` for every `commentManager?.`, `signatureManager?.`, `altTextManager?.`, `_editorUndoBar?.` call and every private member Clumsy touches (`AnnotationLayer.prototype.render`, `DrawingEditor` session state, the editor layer's pointer flag), and fail if one disappears or a new one appears. That turns a quiet upgrade break into a red test.
- `docs/pdfjs-upgrade.md`: the manual checklist for what a test can't see (cursor hotspots, Firefox-only CSS variables, the `hidden` class).

### E. Lifecycle and leaks

Files: `DocumentTab.tsx`, `MarkdownTab.tsx`, `usePdfViewer.ts`, `useComparison.ts`, `useWorkspace.ts`, `useTabTransfer.ts`.

- Closing a tab destroys its `loadingTask`, terminates nothing it shouldn't, disconnects observers, revokes blob URLs, and ends the static `DrawingEditor` session.
- The diff worker is terminated when a comparison ends.
- Use the open/close 20 tabs heap diff from the baseline as the test.

## 3. Performance

Ranked by expected payoff. Each one only ships if the baseline says it matters, and gets re-measured after.

1. **Thumbnails and the Document Map never let go.** `Thumbnails.tsx` sets `visible` once and disconnects its observer; `DocumentMap`'s `shown` latches the same way. Scroll a 1,000-page file and every thumbnail canvas (120 px × device pixel ratio) and every map canvas stays allocated. Release canvases more than a few screens away (zero their size) and re-render on return, or keep a capped LRU of `ImageBitmap`s. Probably the biggest memory win, and it matters most on scans.
2. **Main bundle is 2.27 MB.** Everything but CodeMirror loads up front: `@cantoo/pdf-lib` (page edits, notes on save, flatten, images to PDF, the report), markdown-it with highlight.js and DOMPurify, and `diff`. Lazy-load the Markdown renderer on the first Markdown tab, comparison on the first compare, and pdf-lib on first use. Save needs pdf-lib only when there are sticky-note changes, so plain saves stay fast. Measure cold start before and after.
3. **Page-edit history is capped per tab.** 256 MB per tab means five edited big files can hold over a gigabyte. Make the budget global across tabs in a window, oldest versions dropped first.
4. **Page edits on huge files.** Every edit runs `viewer.save()`, flattens the page tree, collects garbage, and rewrites the whole file. Profile the 1,000-page delete. Likely fine; fix only if it's seconds.
5. **External-change polling.** Each window stats every open tab one IPC call at a time every 2 s. Batch it into one `file_stamps(paths)` call. Moving to FSEvents only if idle CPU shows it's worth the complexity.
6. **Comparison on big files.** Text extraction is per page through the cache. Check it runs off the critical path and the page-by-page fallback holds at 1,000 pages.
7. **Detail canvas.** `enableDetailCanvas` stays off unless high-zoom rendering of the scanned file is visibly slow. Turning it on means restoring images from the detail canvas too (see AGENTS.md, Dark pages).

## 4. Housekeeping

- Split `styles.css` (2,177 lines) along the components it styles: app shell and toolbar, tab strip and panes, sidebar and thumbnails, sheets and dialogs, quick pick already has its own. Pure moves, no rule changes; diff the computed styles of a few screens before and after.
- Prune merged remote branches: `changelog-versioning`, `docs-new-features`, `feature/organize-pages`, `fix/review-safety`, `form-tools`, `images-in-and-out`, `page-labels-editor`, `pdfjs-parity-1`, `pdfjs-parity-fixes`, `vscode-shortcuts`. Confirm each is merged first.
- Update `AGENTS.md` for anything the fixes change (lock helper, lazy chunks, canvas release, history budget).
- Move closed items out of the roadmap's Known gaps.

## Execution

- One branch, `hardening`, in its own worktree. Seams A to E run as parallel reviews; their fixes touch disjoint files, so they can land as separate commits without conflicts.
- Performance work starts after the baseline exists, not before.
- Typecheck, vitest, clippy, and Rust tests pass at every commit.
- Done means: the hostile set opens, edits, and saves without a hang or a crash; the leak test shows no growth; memory after the 1,000-page scroll is bounded; cold start is no worse; every finding is fixed or written down as a known gap with a reason.
