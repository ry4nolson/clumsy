# Tool chest plan

Written 2026-11-14 against `main` after the measurement plan. Roadmap item 2, right after measurement, because half its value is measurement presets.

A tool chest is a list of saved tools. Each one is a tool, its style, and a name: "Conduit run" is a red Length at 2 pt, "Drywall" is a blue Area at 30% fill, "Rev 2" is a red cloud, "Approved" is the green review stamp. Clicking one arms that tool with those settings. Exporting the chest as a file gives a whole team the same colors and names, and that's what makes a markup list or a measurement CSV sortable by trade instead of by "what did blue mean."

## What's already there

- Markup remembers one style in `clumsy.markupParams` (`src/lib/markupParams.ts`: color, fill, width, opacity, last shape, text mode), cleaned on read by `cleanMarkupParams`.
- Stamps keep a recently used list (`clumsy.recentStamps`, `readRecentStamps`/`rememberStamp`, at most 8).
- pdf.js's own tools (Highlight, Draw, Text) remember theirs in `clumsy.editorParams` (`useEditorOptions`).
- Saved signatures already show the pattern for a small shared list: `clumsy.signatures`, shared by every window through the `storage` event.
- Every markup Clumsy writes gets `/Subj` set to its kind's label ("Rectangle", "Cloud") or the stamp's name.

A saved tool is one of those styles plus a tool id and a name, so the chest is mostly a named list and a panel to pick from.

## Model

`src/lib/toolChest.ts` (new, pure, tested):

```ts
type SavedTool = {
  id: string;            // uuid
  name: string;          // "Drywall", shown in the chest and written as /Subj
  group: string | null;  // "Electrical", "Drywall", or none
  tool: ToolRef;         // "shape:cloud", "stamp:<id>", "text:underline", "measure:area", "highlight", "draw", "text"
  style: { color: string; fill: boolean; width: number; opacity: number; dash: number[] | null };
  measure?: { units: string; precision: string }; // measure tools only
};
```

- Stored in `clumsy.toolChest` as `{ version: 1, tools: SavedTool[] }`, read through a cleaner like `cleanMarkupParams`: unknown tool ids, bad colors, and out-of-range numbers are dropped or clamped, never thrown. Stamp ids go through `isKnownStamp`, the same never-rename rule as saved files.
- Shared by every window through the `storage` event, re-read when the panel opens, like signatures.
- `Markup` gains `subject: string | null`. A markup made from a saved tool carries the tool's name, `applyMarkup` writes it as `/Subj` (falling back to today's kind label), and `markupFromDict` reads it back. Unknown subjects from other apps survive an edit untouched, as every other unknown key does today.

## Using a saved tool

- **Tool Chest sidebar tab**, next to Pages and Outline, always available on a PDF tab. Saved tools by group, each with a swatch drawn by `markupDrawing` so it looks like what it makes. Click arms it. The armed one is highlighted until another tool is picked.
- **Arming** sets the underlying tool through the paths that already exist (`setMarkupTool`, the stamp tool, the text modes, the measure tools, or pdf.js's editor modes with `switchannotationeditorparams`) with the saved style as a one-time override. It doesn't overwrite `clumsy.markupParams`, so your everyday style survives using a preset.
- **Command Palette:** each saved tool appears as "Tool: Drywall", so a big chest is fast from the keyboard. The first nine also get ⌃1 through ⌃9 if those combos are free (check `commands.ts`; ⌘1–⌘8 are tabs).
- **Right-click tools row:** saved tools can be added to the context menu's palette like built-in tools (`contextTools` accepts `saved:<id>`). The palette's icon is the base tool's SF Symbol, and the name shows as its tooltip.

## Making and editing them

- **Save as Tool…** at the bottom of each tool's dropdown (Shapes, Stamps, Highlight, Draw, Text, Measure) saves the current tool and style, asking only for a name and an optional group.
- **Add to Tool Chest** on a selected markup's right-click menu captures its kind, style, and subject. That covers the "I made one I like" case and markup from other apps.
- In the chest: rename, change group, restyle (the same controls as the dropdowns), duplicate, delete (undoable through the undo bar's pattern), and drag to reorder within and between groups.

## Sharing

- **Export Tool Chest…** writes the whole chest, or one group, as a `.clumsytools` file (the same JSON as storage, with `version`). That needs a Rust save path and write limited to that extension, following `write_image`'s rules: a new `pick_tools_save_path`, a write command that only writes `.clumsytools`, and no other path.
- **Import Tool Chest…** picks a file through Rust (read-only, like picked images), runs the same cleaner, and merges: same id replaces, a new id is added, a same-name tool in the same group asks Replace or Keep Both once for the batch.
- Dropping a `.clumsytools` file on a window imports it too, with the same confirm. Drop handling already sorts files by extension.

## Starter set

A first-run chest so the panel isn't empty: review stamps (Approved, Rejected, For Review), a red revision cloud, a yellow highlight, and once measurement ships, Length and Area in ft-in. Clearing it is one menu item.

## Code

- `src/lib/toolChest.ts`: model, cleaner, merge for import, `toolRefOf(markup)` for Add to Tool Chest.
- `src/hooks/useToolChest.ts`: storage, the `storage` listener, arming through `useViewerTools`/`useMarkupControls`.
- `src/components/ToolChestList.tsx`: the sidebar tab, swatches, drag to reorder, the edit sheet (styles in `Markup.css`).
- `Sidebar.tsx`: `"toolChest"` in `SidebarTab`.
- `markup.ts`, `markupPdf.ts`: `subject`.
- `contextTools.ts`, `context_menu.rs`: `saved:<id>` entries using the base tool's symbol.
- `commands.ts` / `menu.ts`: Save as Tool…, Add to Tool Chest, Export/Import Tool Chest…, and the palette's per-tool entries (generated, not in `menuLayout`, the same flag `addCommentHere` uses).
- Rust: the `.clumsytools` pick and write commands in `files.rs` next to the image ones.

## Tests (Linux container)

- Cleaner: garbage, old versions, unknown tools, unknown stamp ids, out-of-range styles.
- Merge: same id, new id, same name in the same group, groups preserved.
- `subject` written as `/Subj` and read back, and another app's `/Subj` kept on edit.
- Arming doesn't change `clumsy.markupParams`.
- Commands placed once, palette entries generated per tool, `saved:<id>` dropped from the context row when the tool is deleted.
- Rust: extension and allowlist checks on the new write.

## Mac checklist

- Save a tool from each dropdown and from a selected markup. Use each: the new markup matches and its `/Subj` shows in Acrobat's comments list.
- Two windows: a tool saved in one shows in the other.
- Export a group, import it on a second Mac (or after clearing), with a name clash: one question, right result.
- Add a saved tool to the right-click row; it arms from there.
- Windows build: the same, minus the right-click palette (Windows gets the flattened menu).

## Phase 2

- Per-tool default text (a cloud that opens a comment with "REV 2 — " filled in).
- Properties beyond style, like a measurement's trade or a markup's status, once the markup list has status.
- A team chest kept in a shared folder and re-read on change.

## Decisions (2026-11-14)

1. **Using a saved tool leaves your everyday style alone.** Decided: yes. Otherwise one click on "Drywall" turns every later rectangle blue.
2. **Ship a starter set.** Decided: yes, small, and easy to clear.
3. **Sidebar tab rather than a toolbar popover.** Decided: sidebar. A chest grows past what a popover holds, and Bluebeam users expect a panel.
4. **File extension `.clumsytools`.** Decided: yes, plain JSON inside, so it's diffable and hand-editable.

## Done when

Merged with the four checks and the Mac checklist. AGENTS.md gets a Tool chest section (model, storage, arming without touching remembered styles, `/Subj`, the file format and its Rust commands). CHANGELOG under Unreleased as Added. The roadmap lists it as shipped.
