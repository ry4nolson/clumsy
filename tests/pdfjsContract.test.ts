import { describe, expect, it } from "vitest";
import { removedMessage } from "../src/lib/comments";
import {
  app,
  classMembers,
  classSource,
  cssVariables,
  cursorHotspots,
  dispatchedEvents,
  expectIn,
  functionSource,
  exportedNames,
  listenedEvents,
  managerCalls,
  methodSource,
  pdfjs,
  svgSize,
} from "./pdfjsSource";

const { display, viewer, worker, css } = pdfjs;
const both = display + viewer;
const appSources = app.sources().map((path) => ({ path, text: app.read(path) }));
const appText = appSources.map(({ text }) => text).join("\n");

const sorted = (values: Iterable<string>) => Array.from(new Set(values)).sort();

describe("pdfjs-dist version", () => {
  it("is pinned to the exact installed version", () => {
    expect(app.packageJson.dependencies["pdfjs-dist"]).toBe(pdfjs.version);
  });
});

describe("runtime imports", () => {
  it("only names things pdfjs-dist exports at runtime", () => {
    const exports = { "pdfjs-dist": exportedNames(display), "pdfjs-dist/web/pdf_viewer.mjs": exportedNames(viewer) };
    for (const [from, names] of Object.entries(exports)) {
      const pattern = new RegExp(`^import \\{([^}]*)\\} from "${from.replace(/[./]/g, "\\$&")}";`, "gm");
      for (const [, list] of appText.matchAll(pattern)) {
        for (const entry of list.split(",").map((part) => part.trim())) {
          if (entry && !entry.startsWith("type ")) {
            expect(names, `${from} no longer exports ${entry}`).toContain(entry.split(/\s+as\s+/)[0]);
          }
        }
      }
    }
  });
});

describe("editor managers", () => {
  const recorded = {
    commentManager: ["destroy", "destroyPopup", "dialogElement", "hideSidebar", "makeCommentColor", "removeComments", "setSidebarUiManager", "showDialog", "showSidebar", "toggleCommentPopup", "updateComment", "updatePopupColor"],
    signatureManager: ["destroy", "getSignature", "loadSignatures", "renderEditButton"],
    altTextManager: ["destroy", "editAltText"],
    editorUndoBar: ["destroy", "hide", "show"],
  };

  for (const [manager, calls] of Object.entries(recorded)) {
    it(`pdf.js calls exactly the recorded ${manager} methods`, () => {
      expect(sorted([...managerCalls(display, manager), ...managerCalls(viewer, manager)])).toEqual(calls);
    });
  }

  it("still takes the managers as PDFViewer options", () => {
    const constructor = methodSource(viewer, "PDFViewer", "constructor");
    for (const option of Object.keys(recorded)) {
      expectIn(constructor, `options.${option}`);
    }
  });

  it("are all implemented by createEditorManagers", () => {
    const source = app.read("src/lib/editorManagers.ts") + app.read("src/lib/commentManager.ts");
    const implemented = (name: string) => new RegExp(`^\\s+(?:async |get )?${name}\\b`, "m").test(source);
    for (const calls of Object.values(recorded)) {
      for (const call of calls) {
        expect(implemented(call), `missing ${call}`).toBe(true);
      }
    }
  });

  it("use UI manager methods pdf.js still has", () => {
    const members = classMembers(display, "AnnotationEditorUIManager");
    for (const name of ["removeEditListeners", "addEditListeners", "imageManager", "waitForEditorsRendered", "selectComment", "addCommands", "deleteComment", "unselectAll", "endCurrentEditing"]) {
      expect(members, `AnnotationEditorUIManager.${name}`).toContain(name);
    }
    expectIn(classMembers(display, "ImageManager"), "getFromFile");
  });

  it("use editor members pdf.js still has", () => {
    const editor = classMembers(display, "AnnotationEditor");
    for (const name of ["_uiManager", "uid", "remove", "altTextData", "altTextFinish", "commitOrRemove", "editorType", "focus"]) {
      expect(editor, `AnnotationEditor.${name}`).toContain(name);
    }
    const signature = classMembers(display, "SignatureEditor");
    for (const name of ["_drawId", "description", "addSignature", "getFromText", "getDrawnSignature", "getFromImage", "getSignaturePreview"]) {
      expect(signature, `SignatureEditor.${name}`).toContain(name);
    }
    expectIn(classMembers(display, "FreeTextEditor"), "editorDiv");
    const extractor = classMembers(display, "SignatureExtractor");
    for (const name of ["process", "processDrawnLines", "compressSignature", "decompressSignature"]) {
      expect(extractor, `SignatureExtractor.${name}`).toContain(name);
    }
  });

  it("treat editors and annotation popups as the same comment target", () => {
    const target = ["getData", "focusCommentButton", "commentButtonWidth", "comment", "setCommentButtonStates", "commentPopupPosition", "hasDefaultPopupPosition", "parentBoundingClientRect", "elementBeforePopup", "editComment"];
    for (const className of ["AnnotationEditor", "PopupElement"]) {
      const members = classMembers(display, className);
      for (const name of target) {
        expect(members, `${className}.${name}`).toContain(name);
      }
    }
  });

  it("have an undo bar message for every editor type", () => {
    const types = sorted(Array.from(display.matchAll(/^ {2}static _type = "(\w+)";/gm), ([, type]) => type));
    expect(types.length).toBeGreaterThan(0);
    for (const type of types) {
      expect(removedMessage(type), type).not.toBe("Annotation removed");
    }
  });
});

describe("events", () => {
  const appListens = sorted(Array.from(appText.matchAll(/eventBus\??\.on\("([a-z]+)"/g), ([, name]) => name));
  const appDispatches = sorted(Array.from(appText.matchAll(/eventBus\??\.dispatch\("([a-z]+)"/g), ([, name]) => name));

  it("that Clumsy listens for are still dispatched", () => {
    expect(appListens.length).toBeGreaterThan(10);
    const dispatched = dispatchedEvents(both);
    for (const name of appListens) {
      expect(dispatched, name).toContain(name);
    }
  });

  it("that Clumsy dispatches are still handled", () => {
    const handled = listenedEvents(both);
    for (const name of appDispatches) {
      expect(handled, name).toContain(name);
    }
  });

  it("still carry the details Clumsy reads", () => {
    for (const key of ["hasSomethingToUndo", "hasSomethingToRedo", "hasSelectedEditor"]) {
      expectIn(classSource(display, "AnnotationEditorUIManager"), `${key}:`);
    }
    expectIn(display, 'addEventListener("resetform"');
  });

  it("still handle every editingaction Clumsy sends", () => {
    const actions = app.read("src/hooks/usePdfViewer.ts").match(/export type EditingAction = ([^;]+);/)![1];
    const handler = methodSource(display, "AnnotationEditorUIManager", "onEditingAction");
    for (const [, name] of actions.matchAll(/"(\w+)"/g)) {
      expectIn(handler, `case "${name}":`);
    }
  });

  it("announce each page's editor layer once it's built", () => {
    expectIn(methodSource(viewer, "AnnotationEditorLayerBuilder", "render"), "new AnnotationEditorLayer(");
    const render = methodSource(viewer, "PDFPageView", "#renderAnnotationEditorLayer");
    expectIn(render, "await this.annotationEditorLayer.render(");
    expectIn(render, '#dispatchLayerRendered("annotationeditorlayerrendered", error)');
    expectIn(methodSource(viewer, "PDFPageView", "#dispatchLayerRendered"), /source: this,\s*pageNumber: this\.id,/);
  });
});

describe("viewer internals", () => {
  it("expose the editor UI manager through _layerProperties", () => {
    expectIn(viewer, /get _layerProperties\(\) \{[\s\S]{0,200}get annotationEditorUIManager\(\)/);
  });

  it("keep the page view fields Clumsy reads", () => {
    const pageView = classMembers(viewer, "PDFPageView");
    for (const name of ["annotationEditorLayer", "imageCoordinates", "canvas", "div", "pdfPage", "viewport", "id", "renderingState", "destroy"]) {
      expect(pageView, `PDFPageView.${name}`).toContain(name);
    }
    expectIn(classMembers(viewer, "AnnotationEditorLayerBuilder"), "annotationEditorLayer");
  });

  it("call only the history methods Clumsy's adapter has", () => {
    const usePdfViewer = app.read("src/hooks/usePdfViewer.ts");
    const adapter = usePdfViewer.slice(usePdfViewer.indexOf("linkService.setHistory({"), usePdfViewer.indexOf("} as unknown as Parameters<PDFLinkService"));
    const methods = sorted(Array.from(adapter.matchAll(/^\s+(\w+): /gm), ([, name]) => name));
    expect(sorted(Array.from(viewer.matchAll(/pdfHistory\??\.(\w+)\(/g), ([, name]) => name))).toEqual(methods);
  });

  it("let PatternFindController replace match()", () => {
    expectIn(methodSource(viewer, "PDFFindController", "#calculateMatch"), "this.match(query, pageContent, pageIndex)");
    const members = classMembers(viewer, "PDFFindController");
    for (const name of ["match", "highlightMatches", "pageMatches", "pageMatchesLength", "selected"]) {
      expect(members, `PDFFindController.${name}`).toContain(name);
    }
  });

  it("pass every annotation through AnnotationLayer.prototype.render", () => {
    expectIn(methodSource(display, "AnnotationLayer", "render"), /const \{\s*annotations,/);
    expectIn(methodSource(viewer, "AnnotationLayerBuilder", "render"), "this.annotationLayer.render({");
    for (const field of ["inReplyTo", "popupRef", "contentsObj", "richText"]) {
      expectIn(worker, new RegExp(`data\\.${field}\\b`));
    }
    expectIn(display, /const AnnotationType = \{\s*TEXT: 1,\s*LINK: 2,\s*FREETEXT: 3,/);
    expectIn(app.read("src/lib/notes.ts"), "const TEXT_ANNOTATION = 1;");
    expectIn(app.read("src/lib/comments.ts"), "const FREE_TEXT_ANNOTATION = 3;");
  });
});

describe("annotation storage", () => {
  it("lets sticky notes and form resets keep their own entries", () => {
    const storage = classMembers(display, "AnnotationStorage");
    for (const name of ["getRawValue", "setValue", "remove", "print", "serializable"]) {
      expect(storage, `AnnotationStorage.${name}`).toContain(name);
    }
    expectIn(functionSource(worker, "getNewAnnotationsMap"), "if (!key.startsWith(AnnotationEditorPrefix)) {\n      continue;");
    expectIn(worker, 'const AnnotationEditorPrefix = "pdfjs_internal_editor_";');
    expectIn(app.read("src/lib/notes.ts"), 'export const NOTE_KEY_PREFIX = "clumsy-note:";');
  });
});

describe("drawing", () => {
  it("ends a Draw session through the editor layer's commitOrRemove", () => {
    const commit = methodSource(display, "AnnotationEditorLayer", "commitOrRemove");
    expectIn(commit, "this.endDrawingSession()");
    expectIn(commit, "return true;");
    expectIn(classSource(display, "DrawingEditor"), /static #currentDraw\b/);
  });

  it("lets a synthetic pointerup clear the layer's pointer flag without adding an editor", () => {
    const down = methodSource(display, "AnnotationEditorLayer", "pointerdown");
    const up = methodSource(display, "AnnotationEditorLayer", "pointerup");
    expectIn(down, /if \(this\.#hadPointerDown\) \{\s*this\.#hadPointerDown = false;\s*return;/);
    expectIn(up, "event.target !== this.div");
    const cleared = up.indexOf("this.#hadPointerDown = false;");
    const drawerReturn = up.indexOf("isDrawer && this.#currentEditorType.supportMultipleDrawings");
    const creates = up.indexOf("this.createAndAddNewEditor(");
    expect(cleared).toBeGreaterThan(-1);
    expect(drawerReturn).toBeGreaterThan(cleared);
    expect(creates).toBeGreaterThan(drawerReturn);
    expectIn(classSource(display, "InkEditor"), /static get supportMultipleDrawings\(\) \{\s*return true;/);
  });

  it("creates marks and signatures through createAndAddNewEditor with signatureData", () => {
    expectIn(methodSource(display, "AnnotationEditorLayer", "createAndAddNewEditor"), /createAndAddNewEditor\(event, isCentered, data = \{\}\)/);
    expectIn(classSource(display, "SignatureEditor"), "params.signatureData");
    expectIn(classSource(display, "DrawingEditor"), "static _INNER_MARGIN = 3;");
    expectIn(app.read("src/lib/marks.ts"), "const SIGNATURE_MARGIN = 3;");
  });
});

describe("dark pages", () => {
  it("records image rectangles as canvas fractions", () => {
    const tracker = classSource(display, "CanvasImagesTracker");
    expectIn(tracker, "coords[0] /= this.#canvasWidth;");
    expectIn(tracker, "coords[5] /= this.#canvasHeight;");
    expectIn(tracker, "this.#coords.set(coords, this.#count * 6);");
    expectIn(methodSource(display, "PDFPageProxy", "render"), /recordImages = false/);
    expectIn(display, /this\.imageCoordinates = internalRenderTask\.gfx\?\.imagesTracker\.take\(\)/);
  });

  it("has the viewer record images whenever imagesRightClickMinSize isn't -1", () => {
    expectIn(viewer, "const recordImages = this.imagesRightClickMinSize !== -1 && !this.imageCoordinates;");
  });
});

describe("worker", () => {
  it("falls back to its own inflate when DecompressionStream is missing", () => {
    const decompress = methodSource(worker, "DecodeStream", "asyncGetBytesFromDecompressionStream");
    expectIn(decompress, /try \{[\s\S]*new DecompressionStream\(name\)[\s\S]*\} catch \{\s*return \{\s*decompressed: null,/);
    expectIn(classMembers(worker, "FlateStream"), "readBlock");
  });
});

describe("CSS", () => {
  const editing = app.read("src/components/Editing.css");

  it("leaves only the recorded variables to Firefox's viewer.css", () => {
    const { used, defined } = cssVariables(css);
    const missing = sorted([...used].filter((name) => !defined.has(name)));
    expect(missing).toMatchSnapshot();
  });

  it("defines the viewer.css variables Clumsy's editors depend on", () => {
    for (const variable of ["--comment-edit-button-icon", "--dir-factor", "--editor-toolbar-min-width", "--icon-size", "--main-color", "--toolbar-icon-bg-color"]) {
      expect(editing, variable).toContain(`${variable}:`);
    }
  });

  it("redefines every editor cursor whose hotspot is outside its image", () => {
    const unused = new Set(["--draw-cursor"]);
    const outside = cursorHotspots(css).filter(({ image, x, y }) => {
      const { width, height } = svgSize(pdfjs.image(image));
      return x >= width || y >= height;
    });
    expect(sorted(outside.map(({ variable }) => variable))).toEqual(["--draw-cursor", "--editorFreeText-editing-cursor", "--editorInk-editing-cursor"]);
    for (const { variable } of outside.filter(({ variable }) => !unused.has(variable))) {
      for (const at of css.matchAll(new RegExp(`${variable}\\s*:`, "g"))) {
        const block = css.slice(css.lastIndexOf("\n", css.lastIndexOf("{", at.index)) + 1, css.lastIndexOf("{", at.index));
        expect(block.trim(), `${variable} is set below .pdfViewer, so Editing.css no longer overrides it`).toBe(":root");
      }
      const fixed = cursorHotspots(editing).filter((entry) => entry.variable === variable);
      expect(fixed.length, variable).toBeGreaterThan(0);
      for (const { image, x, y } of fixed) {
        const { width, height } = svgSize(pdfjs.image(image));
        expect(x < width && y < height, variable).toBe(true);
      }
    }
  });

  it("hides what pdf.js marks with the hidden class", () => {
    expectIn(display, /classList\.(?:add|toggle)\("hidden"/);
    expectIn(editing, /\.pdfViewer \.hidden \{\s*display: none !important;/);
  });
});

describe("built-ins pdf.js needs from the webview", () => {
  it("are the recorded set", () => {
    const candidates = ["getOrInsertComputed", "Math.sumPrecise", "Promise.try", "Uint8Array.fromBase64", ".toBase64()", "RegExp.escape", "Float16Array", "Iterator.prototype", "AbortSignal.any", "Promise.withResolvers", "Array.fromAsync", "Error.isError", "Iterator.from"];
    const used = candidates.filter((name) => [display, viewer, worker].some((source) => source.includes(name)));
    expect(used).toMatchSnapshot();
  });
});
