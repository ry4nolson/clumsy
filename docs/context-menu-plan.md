# Context menu plan

Written 2026-11-06 against `main` after v0.11.0. Comes before roadmap item 1 (passwords).

Right-clicking a page today gets WebKit's default menu (or nothing useful). The goal is one menu on the document that does everything the thumbnail menu does, plus a row of tool buttons, with the row's contents chosen from the toolbar.

## The call: a native menu built in Rust, with a palette row for the tools

Two ways to build it:

- **HTML popover.** Full control, and the tool icons could be the toolbar's own SVGs. But it's clipped to the window, needs its own keyboard handling, VoiceOver support, submenus, and edge flipping, and it would sit next to a native thumbnail menu and look different from it.
- **Native `NSMenu`.** Looks and behaves like every other Mac menu, isn't clipped, handles keyboard and VoiceOver for free, and matches the thumbnail menu. Tauri's JS menu API can't do a row of icons, though, and its icons aren't template images, so they'd look wrong in dark mode.

Native wins, built in Rust. AppKit has had palette menus since macOS 14 (`NSMenuPresentationStylePalette`, the row of tag dots in Finder's menu), and Clumsy requires 15.4. A palette submenu shows its items as a horizontal row of images, with the titles as tooltips and VoiceOver labels. With `selectionMode` set to select-one, the active tool shows as selected. The images are SF Symbols (`imageWithSystemSymbolName:accessibilityDescription:`), which are template images, so they follow dark mode and the selection highlight. `objc2-app-kit` 0.3.2 already has `NSMenuPresentationStyle` and `NSMenuSelectionMode`.

The trade-off: the row uses SF Symbols, not the toolbar's own icons. Close enough, and it reads as a Mac menu.

## What's in the menu

Built from what's under the pointer. Top to bottom, with empty sections dropped:

1. **Tools row.** The tools picked for the context menu, in toolbar order, with the active one selected. Default: Select, Highlight, Text Note, Draw, Comments, Sign.
2. **Selected text** (when the selection is in this viewer's text layer): Copy, Highlight Selected Text, Comment on Selected Text, Use Selection for Find. Copy is a plain `copy:` item aimed at the first responder, so WebKit copies its own selection and no clipboard code is needed.
3. **Link** (http/https/mailto only, the same rule as clicks): Open Link (in the browser), Copy Link. Internal links get Go to Destination.
4. **Add Comment Here.** Places a sticky note where you right-clicked, the same as clicking empty space in Comments mode.
5. **Go Back / Go Forward**, enabled from the tab's history stack.
6. **Zoom ▸**, a submenu: Zoom In, Zoom Out, Actual Size, Fit Width, Fit Page. A submenu keeps five items from pushing the page section down; flatten it if it feels buried.
7. **Page section**, headed "Page 12" (or "3 Pages") with a macOS 14 section header. This has the thumbnail menu's items: Rotate Left and Right, Extract to New Tab, Export as Image…, Print…, Insert Pages from File…, Page Labels…, then Delete on its own.

Right-clicking between pages (the gray background) skips the selection and page sections but keeps Zoom.

The native WebKit menu stays where it already does its job: form text fields, a free-text editor being typed in, the find bar, sheets, and comment popups (those already swallow `contextmenu`). The toolbar and sidebar keep their own menus.

### Which pages the page section acts on

The thumbnail rule: if the page under the pointer is in the selection, act on the selection; otherwise act on that page alone. The catch is that page commands act on "the selection or the current page," and the page you right-clicked usually isn't the current page (the current page is the most visible one). Selecting it the way the thumbnails do would scroll to it.

So page commands get an explicit target. `runCommand(id, { pages })` (or a one-shot override in `usePageEdits` that `explicitPages()` reads) carries the pages from the menu, and Insert Pages from File inserts after the last of them. The thumbnail menu moves to the same path, so it stops depending on selection side effects too.

## Configuring the tools row

Right-click a tool button on the toolbar to get a small native menu with **Add to Context Menu** or **Remove from Context Menu**, plus **Reset Context Menu Tools**. Your idea, and it's the right one. It's where the tools already live, it needs no settings window (Clumsy doesn't have one), and the change shows the next time you right-click.

- Stored in `clumsy.contextTools` as a list of tool ids, shared by every window through the `storage` event (like `clumsy.signatures`). Unknown ids are dropped, so a future tool rename can't break it.
- The row always follows toolbar order. A custom order would need drag-to-reorder somewhere, and nobody's asking for that.
- Any toolbar tool can go in: Select, Hand, Highlight, Text Note, Draw, Comments, Add Image, Sign, Fill In. Fill In places the last-used mark, like its toolbar button.
- Only tools. The rest of the menu is decided by what you clicked, which is the point of a context menu.

## Code

- **`src/lib/documentMenu.ts`** (new, pure, tested): takes the click context (page, page count, selected pages, text selection, link, active tool, context tools, history, `canPrint`) and returns a menu spec: sections of items, each with a command id, a label, and enabled/checked flags, plus the palette row with symbol names. Page labels pluralize the way the thumbnail menu does today ("Rotate 3 Pages Left"). The thumbnail menu is built from the same function's page section, so the two can't drift.
- **`src/lib/platform.ts`**: `showDocumentMenu(spec, point)`. On macOS it calls Rust. Elsewhere, and on macOS if the command is missing, it falls back to Tauri's JS `Menu`, with the palette row turned into ordinary items at the top. That keeps `pnpm dev` and the future Windows and Linux builds working.
- **`src-tauri/src/context_menu.rs`** (new, macOS): `show_menu(window, spec, x, y)`, a sync command, so it runs on the main thread. It builds the `NSMenu` (section headers, separators, the palette submenu with SF Symbol images, `copy:` for Copy), points every item at a small `define_class!` target that records the chosen id, pops it up with `popUpMenuPositioningItem:atLocation:inView:` at the click point in the web view's coordinates (flipped y), and returns the chosen id or nothing once the menu closes. Returning the id avoids Tauri's app-wide menu id map, which already bit the app menus. Non-macOS: the command doesn't exist, and `platform.ts` falls back.
- **`DocumentTab.tsx`**: a capture-phase `contextmenu` listener on the viewer container (next to the existing link one) that leaves editable targets alone, works out the page from the nearest `.page[data-page-number]`, the link from the existing `outsideHref`, and the text selection from the viewer's text layer, then calls the builder and runs the chosen command through `runCommand`.
- **`ToolsGroup.tsx` / `IconButton.tsx`**: `onContextMenu` on the tool buttons for the add/remove menu. The toolbar is a drag region, so check that right-clicks still reach the buttons.
- **`commands.ts`**: no new menu-bar commands except `addCommentHere`, which is context-only and gets no combo and no menu slot (the tests require every menu command to be placed once, so it needs a flag that keeps it out of `menuLayout` and the palette). Reuse every existing id.

## Tests (Linux container)

- `documentMenu.test.ts`: the Zoom submenu is always there on a PDF; each other section appears only when it should (selection, link kinds, between pages, page in or out of the selection), plural labels, Delete disabled when it would remove every page, Print missing when `canPrint` is false, the tools row in toolbar order with the active tool checked, unknown context tool ids dropped.
- The thumbnail menu's items still match what they were (snapshot), now coming from the shared builder.
- Explicit page targets: a page command run with `{ pages }` acts on those pages and not the current page or the selection. Insert after the right-clicked page lands after it.
- Context tools storage: defaults, add, remove, reset, garbage in localStorage.
- Rust: spec parsing (unknown symbol names fall back to no image, empty sections dropped). The AppKit part only compiles on macOS; `ci.yml` builds it on every PR.

## Mac checklist (for the PR)

- The tools row shows as a row, not a submenu, with the active tool selected. Symbols look right in light and dark mode and under the selection highlight. Hovering shows each tool's name.
- Right-click a page that isn't the current one and rotate it: that page rotates, nothing scrolls. Same with a multi-page thumbnail selection that includes the page.
- Right-click selected text: Copy copies it, Highlight and Comment act on it.
- Right-click a web link: Open Link opens the browser, Copy Link copies the address. A `tel:` link gets no link section and calls nothing.
- Right-click in a form text field, and in a text box being edited: the normal WebKit menu with Cut, Copy, Paste, and spelling.
- Right-click while drawing: the stroke in progress isn't lost or restyled.
- Toolbar: add and remove tools; a second window picks up the change.
- Split panes: the menu acts on the pane you clicked, even when the other pane has focus.
- VoiceOver reads the tools row.

## Phases

**Phase 1** is everything above.

**Phase 2**, if wanted:
- Right-click on markup (a highlight, drawing, text box, signature, sticky note): Delete, Comment, Edit Alt Text, and color. These go through pdf.js's UI manager, so each one needs an entry in `docs/pdfjs-upgrade.md`'s inventory.
- A smaller menu for Markdown tabs: Copy, Find, Print, Markdown Source.
- Shortcuts shown next to items, from the same combos the menu bar uses. They only display; a context menu doesn't take key equivalents once it's closed.

## Decisions

1. **Native with SF Symbols (decided).** Not HTML with the toolbar's icons.
2. **Default tools (decided):** Select, Highlight, Text Note, Draw, Comments, Sign.
3. **Zoom items (decided): yes,** as a Zoom submenu.
4. **Add Comment Here (decided): in phase 1.**

## Done when

Phase 1 merged with all four checks and the Mac checklist passed. AGENTS.md has a Context menu section (native menu in Rust, the palette, explicit page targets, the editable-target rule). CHANGELOG has the entry under Unreleased as Added. The roadmap lists it.
