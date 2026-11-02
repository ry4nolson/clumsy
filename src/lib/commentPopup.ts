import { PDFDateString, noContextMenu, renderRichText, shadow, stopEvent } from "pdfjs-dist";

type CommentData = {
  contentsObj?: { str?: string; dir?: string } | null;
  richText?: { str?: string; html?: unknown } | null;
  creationDate?: string | null;
  modificationDate?: string | null;
  color?: number[] | Uint8ClampedArray | null;
  opacity?: number | null;
};

export type CommentTarget = {
  uid?: string;
  getData(): CommentData;
  setCommentButtonStates(states: { selected: boolean; hasPopup: boolean }): void;
  commentPopupPosition: [number, number];
  hasDefaultPopupPosition(): boolean;
  readonly commentButtonWidth: number;
  readonly parentBoundingClientRect: DOMRect;
  readonly elementBeforePopup: Element;
  editComment(options?: { height: number }): void;
  comment: { text?: string } | string | null;
  focus?(): void;
  _uiManager?: { deleteComment(editor: CommentTarget, saved: unknown): void };
};

type PopupOptions = {
  makeColor: (color: CommentData["color"], opacity: CommentData["opacity"]) => string | null;
  onHide: () => void;
};

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "long" });

function popupButton(className: string, label: string, onClick: () => void) {
  const button = document.createElement("button");
  button.classList.add(className, "toolbarButton");
  button.tabIndex = 0;
  button.title = label;
  button.ariaLabel = label;
  const span = document.createElement("span");
  span.textContent = label;
  button.append(span);
  button.addEventListener("click", onClick);
  button.addEventListener("contextmenu", noContextMenu);
  return button;
}

export class CommentPopup {
  #options: PopupOptions;
  #container: HTMLDivElement | null = null;
  #buttons: HTMLDivElement | null = null;
  #text: HTMLDivElement | null = null;
  #time: HTMLTimeElement | null = null;
  #editor: CommentTarget | null = null;
  #posX = 0;
  #posY = 0;
  #prevDragX = 0;
  #prevDragY = 0;
  #previousFocus: Element | null = null;
  #selected = false;
  #visible = false;

  constructor(options: PopupOptions) {
    this.#options = options;
  }

  get editor() {
    return this.#editor;
  }

  get pinned() {
    return this.#visible && this.#selected;
  }

  get _popupWidth(): number {
    const container = this.#create();
    const { style } = container;
    style.opacity = "0";
    style.display = "block";
    document.body.append(container);
    const width = container.getBoundingClientRect().width;
    container.remove();
    style.opacity = style.display = "";
    return shadow(this, "_popupWidth", width);
  }

  #create() {
    if (this.#container) {
      return this.#container;
    }
    const container = (this.#container = document.createElement("div"));
    container.className = "commentPopup";
    container.tabIndex = -1;
    container.role = "dialog";
    container.ariaModal = "false";
    container.addEventListener("contextmenu", noContextMenu);
    container.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.toggle(this.#editor, true, false);
        (this.#previousFocus as HTMLElement | null)?.focus?.();
        stopEvent(event);
      }
    });
    container.addEventListener("click", () => container.focus());

    const top = document.createElement("div");
    top.className = "commentPopupTop";
    const time = (this.#time = document.createElement("time"));
    time.className = "commentPopupTime";
    const buttons = (this.#buttons = document.createElement("div"));
    buttons.className = "commentPopupButtons";
    const edit = popupButton("commentPopupEdit", "Edit comment", () => {
      const editor = this.#editor;
      if (!editor || !this.#text) {
        return;
      }
      const height = parseFloat(getComputedStyle(this.#text).height);
      this.toggle(editor, true, false);
      editor.editComment({ height });
    });
    const remove = popupButton("commentPopupDelete", "Remove comment", () => {
      const editor = this.#editor;
      if (!editor) {
        return;
      }
      const saved = editor.comment;
      this.destroy();
      if (saved && typeof saved === "object" && saved.text) {
        editor._uiManager?.deleteComment(editor, saved);
      } else {
        editor.comment = null;
      }
      editor.focus?.();
    });
    buttons.append(edit, remove);
    top.append(time, buttons);

    const text = (this.#text = document.createElement("div"));
    text.className = "commentPopupText";
    container.append(top, document.createElement("hr"), text);

    let dragging: AbortController | null = null;
    const endDrag = () => {
      container.classList.remove("dragging");
      dragging?.abort();
      dragging = null;
    };
    top.addEventListener("pointerdown", (event) => {
      if (dragging) {
        endDrag();
        return;
      }
      if (buttons.contains(event.target as Node) || !this.#editor) {
        return;
      }
      stopEvent(event);
      const { width, height } = this.#editor.parentBoundingClientRect;
      this.#prevDragX = event.clientX;
      this.#prevDragY = event.clientY;
      dragging = new AbortController();
      const { signal } = dragging;
      container.classList.add("dragging");
      window.addEventListener(
        "pointermove",
        (move) => {
          this.#setPosition(this.#posX + (move.clientX - this.#prevDragX) / width, this.#posY + (move.clientY - this.#prevDragY) / height, false);
          this.#prevDragX = move.clientX;
          this.#prevDragY = move.clientY;
          stopEvent(move);
        },
        { signal },
      );
      window.addEventListener("blur", endDrag, { signal });
      window.addEventListener(
        "pointerup",
        (up) => {
          endDrag();
          stopEvent(up);
        },
        { signal },
      );
    });
    return container;
  }

  updateColor(editor: CommentTarget) {
    if (this.#editor !== editor || !this.#visible || !this.#container) {
      return;
    }
    const { color, opacity } = editor.getData();
    this.#container.style.backgroundColor = this.#options.makeColor(color, opacity) ?? "";
  }

  hide(editor?: CommentTarget | null) {
    const container = this.#create();
    container.classList.toggle("hidden", true);
    container.classList.toggle("selected", false);
    (editor || this.#editor)?.setCommentButtonStates({ selected: false, hasPopup: false });
    this.#editor = null;
    this.#selected = false;
    this.#visible = false;
    this.#text?.replaceChildren();
    this.#options.onHide();
  }

  toggle(editor: CommentTarget | null, isSelected: boolean, visibility?: boolean, isEditable = true) {
    if (!editor) {
      this.destroy();
      return;
    }
    if (isSelected) {
      visibility ??= this.#editor === editor ? !this.#selected || !this.#visible : true;
    } else {
      if (this.#selected) {
        return;
      }
      visibility ??= !this.#visible;
    }
    if (!visibility) {
      this.hide(editor);
      return;
    }
    this.#visible = true;
    if (this.#editor !== editor) {
      this.#editor?.setCommentButtonStates({ selected: false, hasPopup: false });
    }
    const container = this.#create();
    this.#buttons!.classList.toggle("hidden", !isEditable);
    container.classList.toggle("hidden", false);
    container.classList.toggle("selected", isSelected);
    this.#selected = isSelected;
    this.#editor = editor;
    editor.setCommentButtonStates({ selected: isSelected, hasPopup: true });

    const { contentsObj, richText, creationDate, modificationDate, color, opacity } = editor.getData();
    container.style.backgroundColor = this.#options.makeColor(color, opacity) ?? "";
    this.#text!.replaceChildren();
    const html = richText?.str && (!contentsObj?.str || richText.str === contentsObj.str) ? richText.html : contentsObj?.str;
    if (html) {
      renderRichText({ html, dir: contentsObj?.dir || "auto", className: "richText" }, this.#text!);
    }
    const date = PDFDateString.toDateObject(modificationDate || creationDate || "");
    this.#time!.textContent = date ? dateFormat.format(date) : "";
    const [x, y] = editor.commentPopupPosition;
    this.#setPosition(x, y, editor.hasDefaultPopupPosition());
    editor.elementBeforePopup.after(container);
    container.addEventListener(
      "focus",
      ({ relatedTarget }) => {
        this.#previousFocus = relatedTarget as Element | null;
      },
      { once: true },
    );
    if (isSelected) {
      setTimeout(() => container.focus(), 0);
    }
  }

  #setPosition(x: number, y: number, correct: boolean) {
    const editor = this.#editor;
    if (!editor || !this.#container) {
      return;
    }
    if (!correct) {
      editor.commentPopupPosition = [x, y];
    } else {
      const parent = editor.parentBoundingClientRect;
      const widthRatio = this._popupWidth / parent.width;
      if (x + widthRatio > 1) {
        x -= widthRatio - editor.commentButtonWidth;
      }
      x = Math.max(x, -parent.x / parent.width + 0.01);
    }
    this.#posX = x;
    this.#posY = y;
    this.#container.style.left = `${100 * x}%`;
    this.#container.style.top = `${100 * y}%`;
  }

  destroy() {
    this.hide();
    this.#container?.remove();
    this.#container = this.#text = this.#time = this.#buttons = null;
    this.#posX = this.#posY = 0;
    this.#previousFocus = null;
  }
}
