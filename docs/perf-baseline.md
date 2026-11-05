# Performance baseline

Measured 2026-11-04 on v0.10.0 (`7ebea96`), Apple Silicon, 2× display. Step 1 of `docs/hardening-plan.md`. Every fix in the pass gets re-measured against these numbers.

## How to rerun

```bash
node scripts/fixtures.mjs        # writes ~/Documents/clumsy-fixtures (never the repo), ~10 s
NODE_ENV=production pnpm build   # see "Local builds ship development React" below
```

- **Browser lab (Chromium):** start the `preview` and `fixtures` servers from `.claude/launch.json`, open `http://localhost:4173`, and load `http://127.0.0.1:4180/.harness.js` into the page. `__h.open(name)` drops a fixture on the window and times the first painted page. `__h.stats()` counts rendered canvas memory by area (viewer, sidebar, map), JS heap, DOM nodes, and long tasks. `__h.scrollJob(selector, fraction)` scrolls end to end in the background, and its progress is in `__h.job`. Canvases still at the default 300×150 size are counted as blank, because they've never been drawn.
- **WebKit (the real app):** start a second process with `/Applications/Clumsy.app/Contents/MacOS/clumsy <files…>`, then run `footprint -p` and `top -pid` against the new `WebContent` and `GPU` processes. Back up `~/Library/Application Support/com.ry4nolson.clumsy/recent-files.json` first and restore it afterward, because the run records every fixture as a recent file.

## Fixtures

| File | What |
|---|---|
| `text-1200.pdf` | 1,200 pages of dense text, object streams, 5.1 MB |
| `scanned-300.pdf` | 300 pages, one 2550×3300 grayscale JPEG each, 164 MB |
| `form-550.pdf` | 25 pages, 575 fields (text, required, checkboxes, radios, dropdowns) |
| `annotations-5000.pdf` | 20 pages × 250 highlights with contents |
| `tagged-20.pdf` | Structure tree with `P` and `Figure` + `/Alt` per page, ParentTree |
| `encrypted-*.pdf` | User password `clumsy`; owner-only with restricted permissions |
| `markdown-2mb.md` | 2 MB with headings, code, tables, task lists, local images |
| `hostile/*` | Truncated, bad/missing xref, junk after `%%EOF`, cyclic `/Kids` and `/Parent`, 1,000-level page tree, zero pages, extreme page sizes, cyclic struct tree, name tree, outline, and fields, self-referencing popups and replies, bad link destinations, 50 MB noise image, two incremental updates |

## Numbers

### Startup and bundle

| Metric | Value |
|---|---|
| Main JS | 2.02 MB (710 KB gzip) |
| Main JS composition | pdf.js 559 KB, pdf-lib 324 KB, react-dom 203 KB, highlight.js 150 KB, app 256 KB, markdown-it 50 KB, html-entities 50 KB, culori 41 KB, DOMPurify 29 KB |
| Loaded lazily today | CodeMirror (501 KB), pdf.js worker (1.18 MB, on first document), diff worker |
| Start screen (Chromium, local) | JS downloaded 89 ms, DOMContentLoaded 175 ms, first contentful paint 264 ms |

About a third of the main bundle (pdf-lib, html-entities, and culori at 415 KB, plus highlight.js, markdown-it, entities, and DOMPurify at 252 KB) is only needed for page edits, saving notes, or Markdown.

### Opening (time to first painted page, Chromium)

| File | First page | Notes |
|---|---|---|
| text-1200 | 358–363 ms | |
| scanned-300 | 279–357 ms | 1.8–2.1 s of long tasks while opening |
| form-550 | 139 ms | |
| annotations-5000 | 135 ms | |
| markdown-2mb | 1,515 ms to rendered | 2.0 s of long tasks, 87k DOM nodes (minimap clones the article) |
| hostile/huge-image | 1,750 ms | |
| hostile/* (others) | 255–1,025 ms | All opened except `truncated`; see below |

### Scrolling end to end with thumbnails and Document Map open (Chromium, 1440×645 viewport)

| | text-1200 | scanned-300, dark pages | scanned-300, light pages | scanned-300, no sidebar or map |
|---|---|---|---|---|
| Scroll time | 120 s (1,290 steps) | 78 s | 74 s | 40 s |
| Main-thread long tasks during scroll | 0.7 s | 69 s | 66 s | 24 s |
| Worst step | 200 ms | 551 ms | 478 ms | 157 ms |
| Thumbnail canvases after | 1,200 / 341 MB | 300 / 85 MB | 300 / 85 MB | n/a |
| Map canvases after | 1,200 / 191 MB | 300 / 48 MB | 300 / 48 MB | n/a |
| Viewer canvases after | 10 / 266 MB | 30 / 421 MB | 30 / 421 MB | 30 / 623 MB |

### Real app (WebKit), 20 s after launch, no scrolling

| Scenario | WebContent footprint | GPU process | Idle CPU (WebContent) |
|---|---|---|---|
| text-1200 alone | 321–334 MB | 22 MB | 0.1% |
| scanned-300 alone | **2,042 MB** | 23 MB | 0.1% |
| 10 tabs (incl. scan + Markdown) | **3,300 MB** | 51 MB | **17.8%** for the first 80 s; **6.8%** 150 s after opening |
| 9 tabs (no scan) | 1,447 MB | 34 MB | **3.8%** 60 s after opening |

### Leaks (Chromium, heap snapshots after forced GC)

Opening and closing 20 more tabs (four fixtures in rotation) added **177 MB** of retained heap (~9 MB per closed tab), **61k detached DOM nodes**, **3,896 canvas elements** (~195 per tab, the closed tabs' thumbnails and map), and **40 ResizeObservers** (2 per tab). Nothing pdf.js-named showed up because the bundle is minified. Finding the retainer is seam E's job.

## Findings, ranked

1. **Closed tabs leak.** ~9 MB, thousands of DOM nodes, every thumbnail and map canvas, and two ResizeObservers per closed tab. Two observers per tab is the likeliest lead (`usePdfViewer`'s border-box observer and `DocumentMap`'s `.pdfViewer` observer). Long sessions grow without bound.
2. **Thumbnails and the Document Map never release a canvas.** 532 MB after one pass through the 1,200-page file, and that's a text file. Already planned as perf item 1. Confirmed.
3. **Thumbnails and the map cost about two thirds of the main-thread time on scans.** Scrolling the scan spends 66 s of 74 s in long tasks with them on, and 24 s without. Each page's 8.4-megapixel JPEG is decoded and downscaled for the viewer, the thumbnail, and the map separately. Render thumbnails and map pages from the viewer's finished canvas when it exists, or at a small `maxCanvasPixels`, and pause both while scrolling fast.
4. **The dark-pages image overlay runs with dark pages off.** `restoreImages` runs on every non-detail `pagerendered` (`usePdfViewer.ts:190`). It allocates a full-size `.image-restore` canvas for any page with images and copies the image pixels into it. On the scan that's another 312 MB for 10 pages, plus a full-page `drawImage` per render. Only run it while dark pages are on with "Keep images"; remove overlays when that's turned off.
5. **WebKit memory on big scans.** Opening the 164 MB scan reaches 2 GB without scrolling, about 12× the file size. Likely suspects: the file's bytes held in several places (IPC result, tab `source`, the worker's copy, history), plus full-resolution image decodes for the viewer, thumbnails, and map. Next step is a Web Inspector memory timeline in a devtools build.
6. **Hidden tabs keep working.** With 10 tabs open the web process uses 17.8% CPU for over a minute and 6.8% after 2.5 minutes. With 9 lighter tabs it's still 3.8%. Inactive tabs are `visibility: hidden`, so IntersectionObservers still report them as visible and their thumbnails and maps render in the background. `useExternalChanges` also stats every tab every 2 s. Gate thumbnail and map rendering on the tab being active, and batch the stat calls.
7. **Markdown minimap doubles the DOM.** A 2 MB file renders in 1.5 s and leaves 87k nodes, because `MarkdownMap` clones the whole article. A canvas snapshot or a lighter clone (no code highlighting, no images) would halve it.
8. **Main bundle.** Lazy-load pdf-lib, the Markdown stack, and comparison (667 KB, a third of the main bundle). Startup is already fast (FCP 264 ms), so this is lower priority than the plan had it.
9. **Truncated PDFs fail silently.** Dropping `hostile/truncated.pdf` does nothing: no tab, no error, and only pdf.js's "Indexing all PDF objects" warning in the console. Check whether the desktop app shows an error; in the browser build, nothing does.
10. **Local builds ship development React.** This shell has `NODE_ENV=development` set (from the app session, not a dotfile), and `vite build` honors it, so `pnpm build` and `pnpm tauri build` bundle React's development build (+180 KB, plus dev-only checks). CI is unaffected. Builds Ryan tests locally run slower than releases. Set `NODE_ENV=production` in the `build` script so a stray environment can't change what ships.

The other hostile files all opened. That only tests pdf.js. Clumsy's own write paths (page edits, notes, flatten) haven't been run against them yet; that's seam B.

## Not measured yet

- Page-edit timing and history memory on the 1,200-page file (delete, five edits in a row).
- Comparing two 1,200-page files.
- Tabbing through all 575 form fields.
- Scrolling in WebKit (only open and idle were measured there). Findings 2 and 3 count canvases, so they don't depend on the engine, but WebKit's real cost needs a devtools build.
- The leak's retainer path (needs an unminified build or a source-mapped snapshot).

## Changes to the plan's order

Findings 1, 3, 4, and 6 weren't in the plan. Suggested performance order: (1) closed-tab leak, (2) canvas release for thumbnails and map, (3) the image overlay only with dark pages on, (4) hidden tabs stop rendering, (5) cheaper thumbnails and map renders on image-heavy pages, (6) WebKit memory on scans, (7) Markdown minimap, (8) bundle splitting, (9) page-edit history budget. Finding 10 is a one-line fix to do first.

## Round 1 results

Fixed on the `hardening` branch: findings 1, 2, 3, 4, 6 (rendering half), and 10. Same fixtures, same harness. Browser lab numbers are from an isolated Chromium context: the React DevTools extension in a normal profile holds every closed tab's fibers through `__REACT_DEVTOOLS_GLOBAL_HOOK__`, which inflates leak measurements. Re-run leak tests isolated.

| Metric | v0.10.0 | Round 1 |
|---|---|---|
| Retained heap per 20 closed tabs (isolated context) | +179 MB, +59k detached nodes | +0.2 MB, 0 detached nodes |
| text-1200 scroll: thumbnail / map canvases after | 341 MB / 191 MB | 0.9 MB / 7.7 MB |
| text-1200 scroll: long tasks, worst step | 0.7 s, 200 ms | 0 s, 134 ms |
| scanned-300 scroll (light pages): time | 74 s | 37 s |
| scanned-300 scroll: long tasks, worst step | 66 s, 478 ms | 25.5 s, 198 ms |
| scanned-300 scroll: viewer / thumbnail / map canvases | 421 / 85 / 48 MB | 266 / 0.9 / 4.8 MB |
| WebKit, 10 tabs, 150 s after opening | 3,263 MB | 1,565 MB |
| WebKit, 10 tabs, idle CPU from 150 s on | 6.8% | 0.2% |
| Production React from a shell with `NODE_ENV=development` | development build | production build |

What changed:
- `usePdfViewer`'s cleanup ends any drawing, calls `viewer.setDocument(null)`, and aborts the viewer's new `abortSignal` before `partsRef` is cleared. Before, `DocumentTab`'s own `setDocument(null)` ran after `partsRef` was already null, so pdf.js's editor UI manager kept its window and document listeners.
- Thumbnails and the Document Map zero canvases outside a margin, pause while the viewer scrolls or the tab is hidden, and copy the viewer's canvas for pages it already drew that have no annotations.
- The image-restore overlay exists only while dark pages and "Keep images" are both on.
- Hidden tabs destroy their finished page views after 30 s (`HIDDEN_RELEASE_MS`) and redraw on return.
- `vite.config.ts` forces `NODE_ENV=production` for `vite build`.

## Round 2 results

| Metric | v0.10.0 | Round 1 | Round 2 |
|---|---|---|---|
| WebKit, scanned-300 alone, 40 s after opening | 2,035 MB | 2,331 MB | 452 MB |
| WebKit, 10 tabs, 150 s after opening | 3,263 MB | 1,565 MB | 1,308–1,679 MB (noisy across runs) |
| WebKit, 10 tabs, idle CPU from 150 s on | 6.8% | 0.2% | 0.2% |

- **Scans on open** (finding 5) wasn't the bytes. pdf.js transfers `data` to its worker (`getDocument` sends `data.buffer` as a transferable), so the file exists once; that's also why `DocumentTab` re-reads from the path when `source.data` is empty. The memory was decoded images: each 2550×3300 page decodes to about 34 MB, and a `PDFPageProxy` keeps its decoded images in `objs` until `page.cleanup()`. The viewer's page views call it when pdf.js evicts them from its 10-page buffer, but thumbnails and Document Map pages that rendered a page themselves never did, so every one near view held its full-size scan. Both now call `page.cleanup()` after their own render (pdf.js defers it until any render of that page finishes). The viewer refetches the page's operator list on its next redraw, the same tradeoff as image export.
- **Rust process footprint** isn't a leak or specific to local builds: the released v0.10.0 also shows 204 MB with the scan open. It's the 168 MB read buffer, which is freed on its own; the process is back to 40 MB 90 s after opening.
- **Pages stuck loading after a fast scroll** (found while testing round 2): a WebKit deadlock between the pdf.js worker and the garbage collector, inside `ReadableStreamDefaultReader.releaseLock()` at the end of the `for await` that reads pdf.js's `DecompressionStream`. Every later render waits on the worker, so the viewer, thumbnails, and map all spin forever with the process idle. Dragging the scrollbar end to end and back reproduced it on the round 1 build in about two passes, so it predates round 2 (v0.10.0 ships the same pdf.js and stream polyfill); round 2's cleanup made it likelier because the viewer refetches operator lists after it. With `DecompressionStream` removed in the WebKit worker, 16 passes stayed responsive and a sample showed no stream frames on the worker. Scan memory after the fix: 400 MB.
- One 10-tab run measured 42% web-process CPU for the 10 s right at 150 s; the next two runs were 0.2% and 3.6% averaged over 40 s. A burst (GC or the hidden-tab release), not a loop.

## Round 3 results

| Metric (markdown-2mb.md) | v0.10.1 | Round 3 |
|---|---|---|
| DOM nodes | 172,101 | 86,317 |
| WebKit footprint, 30 s after opening | 676 MB | 443 MB |
| Find "stream" (4,957 matches), long tasks, Chromium | 11.3 s | 1.1 s |
| Typing a query in WebKit | 40 s+ at 100% CPU after the first letter | about 1 s after typing stops |

- **Minimap** (finding 7): `MarkdownMap` cloned the whole article (85,784 nodes; tables are most of it) and re-cloned it 120 ms after any mutation, including every find query and image load. One clone took 54 ms plus 0.8 to 1.9 s of style and layout. It's now a canvas painted from shapes measured on the article: 97k text line boxes (181 ms) and 23.5k background and border boxes (79 ms) in Chromium, sorted by top so only the visible slice is painted. Find-mark-only changes re-measure just the marks. Splitting text into `<mark>`s can re-wrap a line (the article grew 24 px), and the resize observer then re-measures everything, about 300 ms; that keeps the map exact.
- **Find** (found while measuring): `highlightMatches` scanned every text node for every match (4,957 × 74k), which was the 11 s in both builds, and created a `Range` per match. WebKit updates every live `Range` on each DOM change, so wrapping stayed quadratic there even after the scan was fixed; a sample of a stuck search showed `Range::nodeChildrenWillBeRemoved` and `boundaryTextNodesSplit`. It now binary-searches the text nodes and reuses one `Range`. Typing also searched on every keystroke, so the first letter alone ("s") wrapped well over a hundred thousand matches; Markdown find now waits 250 ms after typing, like pdf.js.

- **Switching to source** (found by Ryan testing round 3): on the 2 MB file the web process sat at 95% CPU after ⇧⌘V, with nothing in our code on the stack. A sample showed every rendering update in `WebPage::editorState` → `Editor::stringForCandidateRequest` → `isStartOfDocument` → `Position::previous`: WebKit walking backward from the editor's caret to the nearest visible character, through the hidden rendered article (1.8M characters) that came right before the editor in the DOM. Chromium has no such step (0.4 to 0.6 s to switch). Putting the editor's host first in `MarkdownTab` brings it to idle within 2 s.

Still open:
- Findings 8 (bundle), 9 (truncated PDF error), and the page-edit history budget.
- Closing a tab mid-drawing logs one unhandled rejection from pdf.js: committing the drawing selects it, and its toolbar finishes building after the viewer is gone. Harmless; the next tab draws normally.

## Round 4 results

| Metric | v0.10.3 | Round 4 |
|---|---|---|
| Main bundle (`index-*.js`) | 2,034 KB (722 KB gzip) | 1,136 KB (351 KB gzip) |
| WebKit page process, tagged-20.pdf, 10 s after launch (3 runs each) | 191 / 186 / 185 MB | 167 / 170 / 169 MB |
| WebKit page process, markdown-2mb.md, 12 s after launch | 485 MB | 432 MB |

- **Bundle** (finding 8): pdf-lib and the four libraries it pulls in (html-entities, culori, node-html-better-parser, fflate) were 430 KB of the main bundle, and the Markdown stack (highlight.js, markdown-it and its plugins, DOMPurify, entities) another 285 KB. Every window parsed and kept all of it, even with only PDFs open. pdf-lib now loads through `import()` the first time a page edit, an image drop, a save with sticky-note changes, or a comparison report needs it (544 KB chunk), and `MarkdownTab` is a `React.lazy` component (312 KB plus its CSS). The pure page-edit helpers moved to `pageEditPlan.ts` so `usePageEdits` can import them without the library. What's left at startup is pdf.js (559 KB), React DOM (202 KB), the app (232 KB), and Tauri's API.
- Checked in the browser build that startup fetches only the main bundle, opening a PDF fetches nothing more, and each feature fetches its chunk the first time: Markdown (with styles and syntax colors), Rotate Pages, a sticky note baked in by a later page edit, and two dropped images becoming a PDF. No console errors. In the built app, the Markdown file rendered under the real CSP (page process 57 MB with only Start, 432 MB with the file).

Still open:
- Finding 9 (truncated PDF error) and the page-edit history budget.
- Closing a tab mid-drawing logs one unhandled rejection from pdf.js: committing the drawing selects it, and its toolbar finishes building after the viewer is gone. Harmless; the next tab draws normally.
