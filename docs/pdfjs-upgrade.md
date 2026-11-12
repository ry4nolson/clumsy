# Upgrading pdf.js

`pdfjs-dist` is pinned to an exact version in `package.json`. Clumsy leans on parts of pdf.js that aren't public API: the manager interfaces Firefox's viewer app implements, private fields, event names, CSS that only Firefox's `viewer.css` completes, and worker behavior. None of that is covered by the type definitions, so an upgrade can typecheck, pass the unit tests, and still break comments, signatures, drawing, or dark pages without an error.

`tests/pdfjsContract.test.ts` reads the installed `build/pdf.mjs`, `web/pdf_viewer.mjs`, `build/pdf.worker.mjs`, and `web/pdf_viewer.css` as text and fails when something below changes. It can't render or click, so the second half of this file is what to check by hand in a built app.

## Steps

1. Read the pdf.js release notes from the pinned version up to the target. Note anything about editors, comments, signatures, the find controller, the annotation layer, or `PDFViewer` options.
2. Set the exact version: `pnpm add pdfjs-dist@<version> --save-exact`. Never use a range.
3. Run `pnpm exec tsc --noEmit` and `pnpm test`.
4. For every failure in `pdfjsContract.test.ts`, find the change in pdf.js, fix Clumsy's side, and only then update the recorded value in the test (or `pnpm exec vitest run tests/pdfjsContract.test.ts -u` for the snapshots, after reading the diff). A recorded list that changes is a decision, not a chore: a method pdf.js stopped calling usually means behavior moved somewhere Clumsy doesn't handle yet.
5. Compare Firefox's `web/comment_manager.js`, `web/signature_manager.js`, `web/alt_text_manager.js`, and `web/editor_undo_bar.js` at the new tag with the old one (they aren't in pdfjs-dist; read them on GitHub). A changed argument list passes the contract test but not the app.
6. Run the greps below and compare with the inventory.
7. `pnpm tauri build --bundles app` and go through the manual checklist in the built app, not `pnpm dev`. Several of these only break in WKWebView.
8. Update the version in this file's inventory notes and in AGENTS.md if anything here moved.

## Greps

Run from the repo root after installing the new version.

```bash
grep -noE "(#|\b_?)(commentManager|signatureManager|altTextManager|editorUndoBar)\??\.[A-Za-z_]+" node_modules/pdfjs-dist/build/pdf.mjs node_modules/pdfjs-dist/web/pdf_viewer.mjs | sort -t: -k3 -u
```

```bash
grep -rnE "as unknown as|\._[a-zA-Z]|\?\.\w+\?\.\(" src --include="*.ts" --include="*.tsx"
```

```bash
grep -n "getOrInsertComputed\|Math.sumPrecise\|Promise.try\|fromBase64\|toBase64\|RegExp.escape\|Iterator.prototype" node_modules/pdfjs-dist/build/pdf.mjs node_modules/pdfjs-dist/build/pdf.worker.mjs node_modules/pdfjs-dist/web/pdf_viewer.mjs
```

The first lists every manager method pdf.js calls. The second lists Clumsy's casts, private-member reads, and optional calls (`?.foo?.()`), which are the places that go quiet instead of throwing. The third lists recent JavaScript built-ins pdf.js calls without a fallback; each must exist in the oldest WebKit Clumsy supports (see Built-ins below).

## Inventory

Each row is something pdf.js could change without a type error. "Test" names the `describe` block in `tests/pdfjsContract.test.ts` that guards it; "manual" means only the checklist catches it.

### Editor managers

| Clumsy | pdf.js internal | If it changes | Test |
| --- | --- | --- | --- |
| `src/lib/editorManagers.ts:302` `viewerOptions` | `PDFViewer` options `commentManager`, `signatureManager`, `altTextManager`, `editorUndoBar`, handed to `AnnotationEditorUIManager`'s constructor | Renamed option: the manager is never installed. No Comment buttons, Sign does nothing, alt text never asks | editor managers |
| `src/lib/commentManager.ts:86` `commentManager` | The 12 methods pdf.js calls (`showDialog`, `toggleCommentPopup`, `showSidebar`, `setSidebarUiManager`, ...) from `AnnotationEditorUIManager`, `AnnotationEditor`, `PopupElement` | A new call throws `TypeError` on first use (pdf.js uses `#commentManager.x()` without `?.` in `PopupElement`); a removed one leaves dead code and missing behavior | editor managers |
| `src/lib/editorManagers.ts:189` `signatureManager` | `getSignature({ uiManager, editor })`, `loadSignatures`, `renderEditButton(editor)`, `destroy` | Sign hangs or the Edit description button disappears | editor managers |
| `src/lib/editorManagers.ts:160` `altTextManager` | `editAltText(uiManager, editor, firstTime)`, `destroy` | Alt text sheet never opens | editor managers |
| `src/lib/editorManagers.ts:141` `editorUndoBar` | `show(undo, editorType \| count)`, `hide`, `destroy`, called as `uiManager._editorUndoBar?.x()` | Optional calls: a rename silently drops the undo bar | editor managers |
| `src/lib/comments.ts:37` `removedMessages` | Each editor class's `static _type` (`freetext`, `highlight`, `ink`, `signature`, `stamp`) | A new editor type shows "Annotation removed" | editor managers |
| `src/lib/editorManagers.ts:220`, `:242`, `src/lib/commentPopup.ts:24` | `editor._uiManager`, `SignatureEditor._drawId`, `uiManager.deleteComment(editor, saved)` | Description edits leave edit listeners off; a cancelled first signature leaves an empty editor; Delete in a popup throws | editor managers |
| `src/lib/commentManager.ts:182` | `uiManager.waitForEditorsRendered(pageNumber)`, `selectComment(pageIndex, uid)` | Clicking a comment in the sidebar scrolls but doesn't open it | editor managers |
| `src/lib/commentManager.ts:57` `savesComment` | Annotation layer class names `highlightAnnotation`, `freeTextAnnotation`, `inkAnnotation`, `stampAnnotation`, and `PopupElement.elementBeforePopup` | Edit and Delete show on markup pdf.js can't write back, and the change is lost on Save | manual |
| `src/lib/commentPopup.ts` | `CommentTarget` members shared by `AnnotationEditor` and `PopupElement` (`commentPopupPosition`, `commentButtonWidth`, `parentBoundingClientRect`, `setCommentButtonStates`, ...) and exports `renderRichText`, `shadow`, `stopEvent`, `noContextMenu` | Popups misplace or throw on open | editor managers, runtime imports |
| `src/lib/editorManagers.ts:110` | `SignatureExtractor.process(bitmap, pageWidth, pageHeight, rotation, innerMargin)` (positional), `processDrawnLines`, `compressSignature`, `decompressSignature` and their string format | Saved signatures (`clumsy.signatures`) stop decoding and vanish from the list | editor managers (names only; format is manual) |

### Drawing, marks, and editor modes

| Clumsy | pdf.js internal | If it changes | Test |
| --- | --- | --- | --- |
| `src/hooks/useViewerTools.ts:35` `finishDrawing` | `pageView.annotationEditorLayer.annotationEditorLayer.commitOrRemove()` ends the static `DrawingEditor` session and returns `true`; `viewer._layerProperties.annotationEditorUIManager.unselectAll()` | Optional calls: changing color or thickness restyles the strokes already drawn, and a closed tab keeps the drawing session so the next tab's strokes vanish | drawing, viewer internals |
| `src/hooks/useViewerTools.ts:69` synthetic `pointerup` | `AnnotationEditorLayer.pointerdown` returns early while `#hadPointerDown` is set; `pointerup` clears it, then returns for `isDrawer && supportMultipleDrawings` before creating an editor | The next stroke after one released off the page is swallowed again, or the synthetic event starts creating editors | drawing |
| `src/hooks/useViewerTools.ts:107`, `:155` `setEditorMode` | `annotationeditorlayerrendered` from `PDFPageView.#renderAnnotationEditorLayer` with `{ source: pageView, pageNumber }`, after the layer is built; editor types register on the first layer | Picking a tool before page 1 renders hangs every later mode switch (POPUP crashes) | events |
| `src/hooks/useViewerTools.ts:33` `sessionParams` | `HIGHLIGHT_SHOW_ALL` isn't echoed in `annotationeditorparamschanged` | Toolbar shows the wrong highlight visibility (harmless if pdf.js starts echoing it) | manual |
| `src/hooks/useViewerTools.ts:117` | `showannotationeditorui` asks the app to switch modes (double-click on an editor) | Double-clicking existing markup stops entering its tool | events |
| `src/lib/markPlacement.ts:31` | `AnnotationEditorLayer.createAndAddNewEditor(event, isCentered, data)` returning the editor; `SignatureEditor` reading `params.signatureData`; `FreeTextEditor.editorDiv` focused synchronously | Checkmarks or dates don't appear, or the date lands empty | drawing, editor managers |
| `src/lib/marks.ts:14` `SIGNATURE_MARGIN` | `DrawingEditor._INNER_MARGIN = 3` | Marks come out the wrong size | drawing |
| `src/hooks/usePdfViewer.ts:402` `commitEdits` | `_layerProperties.annotationEditorUIManager.endCurrentEditing()` | Save misses text still being typed; warns once in the console | viewer internals |

### Viewer, find, forms, and notes

| Clumsy | pdf.js internal | If it changes | Test |
| --- | --- | --- | --- |
| `src/lib/pdfjs.ts:10` | `AnnotationLayer.prototype.render(params)` with `params.annotations`, called by `AnnotationLayerBuilder.render`; annotation data fields `annotationType`, `inReplyTo`, `popupRef`, `contentsObj`, `richText` | Sticky notes draw twice (pdf.js's and Clumsy's), or text boxes show their own text as a comment again | viewer internals |
| `src/lib/notes.ts:5`, `src/lib/comments.ts:67` | `AnnotationType.TEXT = 1`, `FREETEXT = 3` | Same as above | viewer internals |
| `src/lib/stickyNotes.ts:317` and `NOTE_KEY_PREFIX` | `AnnotationStorage.getRawValue`/`setValue`/`remove`; the worker's `getNewAnnotationsMap` ignores keys that don't start with `pdfjs_internal_editor_` | Save throws or writes garbage annotations for `clumsy-note:` entries | annotation storage |
| `src/lib/modifiedState.ts` `trackModified` | `AnnotationStorage` is iterable as `[key, value]`, has `has`, calls `onSetModified`/`onResetModified`, and `remove` never sets the modified flag but calls `resetModified()` when storage empties; an own `remove` property on the instance is what pdf.js and Clumsy both call | Deleting a saved note or shape reads as saved again, or every save leaves the tab reading as edited | annotation storage |
| `src/hooks/usePdfViewer.ts:144` history adapter | `PDFLinkService` calls `pdfHistory.push`, `pushCurrentPosition`, `pushPage`, `back`, `forward` | Link or outline jumps throw, or Back/Forward stop recording | viewer internals |
| `src/hooks/usePdfViewer.ts:224`, `:392` | `editingstateschanged` details `hasSomethingToUndo`/`hasSomethingToRedo`/`hasSelectedEditor`; `editingaction` names `undo`, `redo`, `highlightSelection`, `commentSelection` | Undo routes to page history while pdf.js still has markup to undo | events |
| `src/lib/patternFindController.ts:9` | `PDFFindController.match(query, pageContent, pageIndex)` called from `#calculateMatch`; `pageMatches`, `pageMatchesLength`, `selected`, `highlightMatches` | Regex and diacritics find fall back to plain search; map find marks disappear | viewer internals |
| `src/hooks/useViewerForm.ts:44`, `:121` | `annotationlayerrendered`; `data-element-id` on widgets; widgets listening for `resetform` | Next Field can't reach unrendered pages; Reset Form leaves old text on blur | events |
| `src/lib/stickyNotes.ts:70`, `src/hooks/useViewerControls.ts:50`, `src/lib/diffLayer.ts:60` | `PDFPageView` `div`, `viewport`, `pdfPage`, `canvas`, `renderingState`, `destroy()`; `reset()` removing unknown children (why layers re-attach on `pagerendered`/`scalechanging`/`rotationchanging`) | Diff highlights and notes vanish after zoom; hidden tabs keep their pages | viewer internals, manual |
| `src/hooks/usePdfViewer.ts:139` `imageResourcesPath` | `annotation-*.svg` file names copied by `vite.config.ts` | Note reply and attachment icons are blank | manual |

### Markup

| Clumsy | pdf.js internal | If it changes | Test |
| --- | --- | --- | --- |
| `src/lib/hiddenAnnotations.ts` `hideAnnotations` | `pdfDocument._transport.getRenderingIntent(intent, annotationMode, printAnnotationStorage, isEditing, isOpList)` returning `{ cacheKey, annotationStorageSerializable: { map, hash, transfer } }`, called by `PDFPageProxy.render` and `getOperatorList` through `this._transport`; `_pumpOperatorList` sends `map` to the worker as `annotationStorage` | Moved or edited shapes from the file show twice (pdf.js's canvas copy stays) | markup |
| `src/lib/hiddenAnnotations.ts` `{ noView: true }` | Worker `Annotation.mustBeViewed` reads `annotationStorage.get(id).noView` before the flags, and none of Square, Circle, Line, Underline, StrikeOut, Stamp, or MarkupAnnotation override it | Same as above | markup |
| `src/lib/markupLayer.ts` `syncHidden` | `PDFPageView.reset({ keepAnnotationLayer, keepAnnotationEditorLayer, keepXfaLayer, keepTextLayer, keepCanvasWrapper })` followed by `PDFViewer.update()` redraws one page, as `toggleEditingMode` does | The old copy stays until the page is scrolled away and back | markup |
| `src/lib/pdfjs.ts` annotation layer wrapper | Claimed shapes (`AnnotationType` LINE 4, SQUARE 5, CIRCLE 6, UNDERLINE 10, STRIKEOUT 12) dropped from the layer; Clumsy stamps (STAMP 13) kept with `isEditable: false`, found through `AnnotationLayer.page._transport` (`this.page = page`). pdf.js only turns layer elements whose `_isEditable` (`data.isEditable`) is true into editors, and in editing modes draws an editable stamp on its own canvas that `#setAnnotationCanvasMap` puts in the element with its `data-annotation-id` | A Clumsy stamp becomes a `StampEditor` and is rewritten as an image on Save, or disappears while an editing tool is on | markup |
| `src/lib/markupSelection.ts` `spanTurns` | `TextLayer` sets `--rotate` on a span to the text's angle in degrees from `atan2` over `[1, 0, 0, -1, -pageX, pageY + pageHeight]` times the item transform (unrotated page space; the layer itself is turned with `data-main-rotation`) | Underline and Strike Through on vertical or upside-down text merge lines across each other and draw on the wrong side | markup |
| `src/lib/markupPdf.ts` | Base `Annotation.save` returns `null` and none of the claimed classes have their own `save`, so a `noView` entry or Clumsy's own storage keys never write anything | Saving writes stray changes for hidden annotations | markup |
| `src/lib/markup.ts` `MARKUP_KEY_PREFIX` | Same `getNewAnnotationsMap` rule as sticky notes | Save throws or writes garbage annotations for `clumsy-markup:` entries | annotation storage |

### Rendering and dark pages

| Clumsy | pdf.js internal | If it changes | Test |
| --- | --- | --- | --- |
| `src/hooks/usePdfViewer.ts:137` `imagesRightClickMinSize: 0` | `PDFPageView` records images whenever the option isn't `-1`; `CanvasImagesTracker` stores 6 numbers per image as fractions of the canvas | Dark pages invert photos again, or restore them in the wrong place | dark pages |
| `src/lib/imageRestore.ts:58` `previewRender`, `src/lib/imageRegions.ts:65` `fillTransform` | `page.render({ recordImages, transform })` setting `PDFPageProxy.imageCoordinates`; coordinates relative to the canvas, so the transform must fill it exactly | Thumbnails and the Document Map invert photos in dark mode | dark pages |
| `src/hooks/usePdfViewer.ts:138` `enableDetailCanvas: false` | Detail canvas drawn inside `.canvasWrapper` under `.image-restore` | If turned on: blurry images at high zoom in dark mode | manual |
| `src/lib/pageImages.ts:27`, `src/hooks/useImageExport.ts:88` | `intent: "print"`, `AnnotationMode.ENABLE_STORAGE`, `annotationStorage.print` | Exported images lose unsaved markup or typed form values | manual |

### CSS

| Clumsy | pdf.js internal | If it changes | Test |
| --- | --- | --- | --- |
| `src/components/Editing.css:1` | Variables `pdf_viewer.css` uses but only Firefox's `viewer.css` defines (`--comment-edit-button-icon`, `--main-color`, `--toolbar-icon-bg-color`, `--icon-size`, `--dir-factor`, `--editor-toolbar-min-width`) | Comment buttons draw as blank squares, toolbars collapse | CSS (snapshot of every undefined variable) |
| `src/components/Editing.css:11` | Draw and Text cursors with hotspot `0 16` on 16×16 images, defined on `:root` | WebKit falls back to the arrow cursor | CSS |
| `src/components/Editing.css:24` | pdf.js hides popups, toolbars, and color menus with a `hidden` class only `viewer.css` styles | Hidden comment popups and toolbars show | CSS (class still used), manual |

### Worker and polyfills

| Clumsy | pdf.js internal | If it changes | Test |
| --- | --- | --- | --- |
| `src/lib/pdfWorker.ts:4`, `src/lib/polyfills.ts:13` `removeDecompressionStream` | `DecodeStream.asyncGetBytesFromDecompressionStream` catches a missing `DecompressionStream` and `FlateStream` falls back to its own `readBlock` | If pdf.js drops the fallback, no Flate stream decodes in WebKit and every page is blank | worker |
| `src/lib/polyfills.ts:60` `installAbortSignalAny` | pdf.js removes editor shortcuts (Backspace deletes markup) through `AbortSignal.any` | WebKit-only: Backspace in a sheet deletes the selected markup | manual |
| `src/lib/polyfills.ts:19`, `:32` | pdf.js 6.4 ships its own `Iterator.prototype.join` polyfill; find reads text streams with `for await` | Ours are now redundant but harmless; keep while older WebKit matters | none |

## Built-ins

pdf.js's modern build calls recent JavaScript without fallbacks. 6.4.299 needs `Map.prototype.getOrInsertComputed`, `Math.sumPrecise`, `Promise.try`, `Uint8Array.fromBase64` and `toBase64`, `RegExp.escape`, `Promise.withResolvers`, `AbortSignal.any`, and a global `Iterator` (read at module load in `pdf.mjs`, so a webview without it loads nothing). The webview is the system WebKit, so these set the oldest macOS Clumsy actually runs on. Clumsy declares macOS 15.4 (`bundle.macOS.minimumSystemVersion` in `tauri.conf.json`), whose WebKit is Safari 18.4: that has the global `Iterator` and everything else above except `getOrInsert`/`getOrInsertComputed` (on `Map` and `WeakMap`) and `Math.sumPrecise`, which arrived in Safari 26.2 and are polyfilled in `src/lib/polyfills.ts` (`installGetOrInsert`, `sumPrecise`). The "built-ins" snapshot fails when the set changes. Each new entry must exist in Safari 18.4 or get a polyfill in `src/lib/polyfills.ts`, which both the window and the worker load first; raising the floor instead means changing `minimumSystemVersion`, the README, and AGENTS.md together.

## Manual checklist (built app)

Back up `~/Library/Application Support/com.ry4nolson.clumsy/recent-files.json` first and restore it afterwards. Use a PDF with existing highlights, a sticky note with a reply, a form with text fields and checkboxes, a scanned page, and a tagged PDF.

- **Draw**: draw two strokes, change the color, draw a third. Only the third changes color. Release a stroke outside the page, then draw again: the next stroke appears. The cursor is a pencil with its tip at the stroke start, not an arrow.
- **Text**: on a Retina display the cursor is the text cursor, not an arrow. Type in a text box and Save without clicking away: the text is in the saved file.
- **Highlight**: highlight text, change color, toggle highlight visibility.
- **Comments**: open the Comments tool before page 1 has rendered (open a large file and pick it at once). The sidebar lists existing comments and sticky notes. Click one: it scrolls and opens. Add a comment to a highlight, edit it, delete it, Undo from the undo bar. Comment buttons have icons. Popups on underlines from other apps don't offer Edit or Delete.
- **Sticky notes**: drag a note, add one in Comments mode, edit its text, Save, reopen. A note's reply still shows pdf.js's icon. A text box doesn't show its own text as a comment.
- **Sign**: with no saved signature, Sign opens the sheet. Type, draw, and image tabs all produce a signature. Save one, place it from the toolbar, edit its description. Quit and reopen: the saved signature is still listed.
- **Alt text**: add an image, set alt text, Save, reopen.
- **Marks**: place a checkmark, cross, dot, and today's date. Sizes match the previous version.
- **Undo bar**: delete a drawing; the bar says "Drawing removed" and Undo brings it back.
- **Find**: regex search, Match Diacritics, Whole Words. Marks show in the Document Map.
- **Forms**: Tab through fields across pages, Reset Form, Undo the reset, Save.
- **Dark pages**: with Keep Images on, photos keep their colors in the page, thumbnails, and the Document Map, at 100% and 400% zoom and after rotating.
- **Export Pages as Images** with unsaved markup: the markup is in the images, including Clumsy's shapes, stamps, and sticky notes.
- **Markup**: draw each shape, a strikethrough, an underline, and stamps. Move and restyle a rectangle another app made: the canvas copy disappears as soon as the page redraws. Pick Draw, Highlight, and Comments with a Clumsy stamp on the page: it stays visible and never turns into an image editor. Save and reopen: everything draws from its appearance stream.
- **Sheets**: select a drawing, open the comment sheet, press Backspace in its text field. The drawing stays.
- **Scroll fast** through a 1,000-page text PDF: pages keep rendering (the `DecompressionStream` deadlock).
- **Back/Forward**: follow a link and an outline entry, then Go Back twice.
- Watch the web inspector console the whole time for `pdf.js changed:` warnings and errors.
