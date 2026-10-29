# PDF Diffing Plan

**Status:** phase 1 is built. Where it differs from this plan: content-stream order is kept instead of sorting into reading order (sorting interleaves multi-column pages), page alignment comes from the word diff's matched lines instead of a separate Jaccard pass, insertions and removals are slid to start on a line, and `diff` is BSD-3-Clause, not MIT. See "Comparing documents" in `AGENTS.md`.

## Goal

Compare two PDFs side by side in one window. Changed text is highlighted on both pages (removed on the left, added on the right), a Changes list in the sidebar jumps between them, and the two panes scroll together. Nothing is written into either document: highlights are DOM overlays, never annotations, so Save is unaffected.

## UX

- **Entry points**
  - **Compare With File…** (File menu, needs a document): Rust `pick_pdf`, opens the picked file in a right pane, compares active tab (left, "original") with it (right, "changed").
  - **Compare Split Panes** (View menu, `needsSplit`): compares the active tabs of the two panes. With more than two panes, uses the focused pane and the one to its right.
  - **Compare with Saved** (phase 2): current tab, including unsaved markup and page edits (`viewer.save()` bytes), against the file on disk.
- **While comparing**
  - Both panes get a thin header: "Original" / "Changed", file name, and a change count. A **Swap Sides** button and an **×** to end the comparison.
  - Highlights: red tint for removed text on the left, green for added on the right, amber for modified (a paired remove + add). Pages that exist on only one side get a full-page banner ("Page added" / "Page removed").
  - Sidebar gets a **Changes** tab next to Pages and Outline: one row per change with page number and a short before → after snippet. Clicking scrolls both panes to it.
  - **Next Change / Previous Change** in the Go menu: `alt+F5` / `shift+alt+F5` (VS Code's diff editor defaults, per the shortcuts convention).
  - Linked scrolling is on by default; **Toggle Linked Scrolling** in View.
- **Ending**: the × button, **End Comparison** command, closing either tab, moving either tab to another window, or moving both tabs into the same pane. Switching a pane to a different tab pauses sync and leaves overlays in place until you come back.

## How the diff works

### 1. Extract tokens (main thread, pdf.js worker does the parsing)

For every page, `page.getTextContent()` returns items with `str`, `transform`, `width`, `height`. Split each item into words and estimate each word's box by proportional character width across the item. Store boxes in normalized, unrotated page coordinates (0..1), so overlays survive zoom without recomputing and rotation reuses the approach in `src/lib/imageRegions.ts`.

Normalize before comparing: NFKC (ligatures), collapse whitespace, join hyphenated line breaks. Sort items into reading order per page (cluster by baseline y, then x), because two files that look identical often have different content-stream order and would otherwise diff as noise.

### 2. Align pages

Page-level similarity (Jaccard on word shingles) plus a DP alignment yields pairs, insertions, and deletions. This drives linked scrolling, "page added/removed" banners, and the fallback below.

### 3. Diff words

Diff the whole document's token stream, not page by page, because a paragraph added on page 2 pushes text onto page 3. Use `jsdiff`'s `diffArrays` (BSD-3-Clause, Myers O(ND), has a `timeout`) in a module Web Worker so a 500-page file doesn't freeze the UI. If it times out, fall back to diffing each aligned page pair separately. Cheap and good enough for typical revisions where D is small.

Group adjacent removed/added tokens into **changes**; merge boxes on the same line into one rect per line.

### 4. Visual diff (phase 2)

Pages with no text (scans, drawings) get a pixel diff instead: render both pages at a low fixed resolution into offscreen canvases, compare, threshold, and turn changed grid cells into boxes. Only for visible pages, lazily. Also available as a **Visual Diff** toggle for every page, for layout or image changes text diff can't see.

### Recompute

Recompute when either tab's `source` changes (page edits, outside-change reload, Swap). Markup and form typing don't change extracted text, so they don't trigger it. Cancel in-flight work when the comparison ends or is superseded (same generation pattern `usePageEdits` uses).

## Code layout

New pure modules in `src/lib`, each with vitest coverage:

| File | Does |
|---|---|
| `diffTokens.ts` | text items → normalized words with normalized boxes; reading-order sort |
| `pageAlign.ts` | page similarity + alignment (pairs, added, removed) |
| `textDiff.ts` | token streams → changes (wraps jsdiff, timeout fallback, grouping) |
| `diffRects.ts` | merge word boxes into line rects; rotate for the viewer |
| `scrollSync.ts` | map a location in one doc to the other through the alignment |
| `pixelDiff.ts` (phase 2) | two RGBA buffers → changed boxes |

New runtime pieces:

- `src/workers/diff.worker.ts`: runs `textDiff` off the main thread. CSP `default-src 'self'` already allows a same-origin module worker; verify in a `pnpm tauri build` app since `devCsp` is null.
- `src/hooks/useComparison.ts`: comparison state (`{ leftTabId, rightTabId, generation, result, linked }`), extraction, worker calls, ending the comparison when the workspace no longer fits, and its own `runCommand(id)` for the new commands, the way `usePageEdits` handles its ids. `App.tsx` is at 490 lines, so all compare logic must live here, not in App.
- `usePdfViewer`: add `setOverlays(pages: Map<number, Rect[]>)`. On `pagerendered`, append a `.diff-layer` to each page div (sibling of `.canvasWrapper`, like `.image-restore`), so the Dark Pages invert filter doesn't recolor the highlights. Expose `scrollToLocation` for sync (built on `scrollPageIntoView` with an XYZ dest). Sync uses a driver lock so the follower's own `updateviewarea` doesn't echo back.
- `DocumentTab`: pass overlays through, render the compare header, add the Changes sidebar tab.
- `components/ChangesList.tsx`: the sidebar list.
- `commands.ts`: `compareWithFile`, `compareSplitPanes`, `compareWithSaved` (phase 2), `nextChange`, `previousChange`, `swapComparison`, `endComparison`, `toggleLinkedScroll`, `toggleVisualDiff` (phase 2). New `needsComparison` flag (disabled in menus, hidden from palette), same mechanism as `needsSplit`.
- `package.json`: add `diff`. `scripts/third-party-licenses.mjs` picks up its license automatically.

`workspace.ts` stays untouched: a comparison is just two tab ids the hook watches.

## Phases

1. **Text diff MVP**: tokens, page alignment, worker diff, overlays, Changes list, next/previous, linked scrolling, Compare With File, Compare Split Panes, Swap, End. Changelog entry under Added.
2. **Visual and saved**: pixel diff for textless pages plus the Visual Diff toggle, Compare with Saved, options (ignore case, ignore whitespace/punctuation), page size change notices.
3. **Beyond content**: annotation and form-field differences (`page.getAnnotations()`, matched by type and rect), metadata differences, export a change summary.

## Edge cases to cover

- Same file on both sides → "No differences", not an error.
- One side image-only → phase 1 shows a notice ("Page 4 has no text to compare"); phase 2 diffs it visually.
- Password-protected files: both are already open in pdf.js, so extraction just works.
- Page rotation (view rotation and `/Rotate`) and differing page sizes.
- Very large files: progress in the header ("Comparing… 120 / 480 pages"), cancellation, no full-document rendering.
- Tab moved to another window mid-comparison: end cleanly, no stale overlays.
- Page edit on one side mid-diff: generation check drops the stale result.
- Dark Pages on and off: highlight colors readable in both.

## Testing

- Unit: tokenization on synthetic text items (rotation, ligatures, hyphenation, out-of-order items), alignment with inserted/removed/reordered pages, diff grouping and the timeout fallback, rect merging and rotation, scroll mapping, pixel diff on synthetic buffers. `commands.test.ts` already enforces menu placement and unique combos.
- Manual (Tauri app): two revisions of a contract (reflowed paragraph), a page inserted mid-document, a scanned PDF, a rotated page, dark pages, swap, ending by closing a tab, linked scroll at different zooms, a 300+ page file for responsiveness.

## Decisions to confirm

1. **Side layout**: always two panes side by side (recommended) vs. an inline single-pane overlay mode. Side by side reuses panes and keeps editing working.
2. **Diff library**: `jsdiff` (recommended) vs. writing Myers/patience in `src/lib`. jsdiff is small and has a timeout; own code avoids a dependency.
3. **MVP scope**: text-only first (recommended) vs. shipping visual diff in the first release.
