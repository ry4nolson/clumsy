The architect sent revision 4 of the floor plan and didn't say what moved. Overlay lays the old drawing and the new one on top of each other, each in its own color, so anything that changed stands out.

## What you get

**File > Overlay Drawings** makes a new PDF. On each sheet:

- Lines that are only in the **previous** drawing are red.
- Lines that are only in the **current** drawing are blue.
- Lines that are in both stay dark.

A wall that moved two feet shows up as a red line where it was and a blue line where it is now. Everything that didn't move looks like an ordinary drawing.

The overlay is a regular PDF in its own tab. It stays as sharp as the originals at any zoom, and you can mark it up, measure on it, print it, save it, and send it to someone. Your two original files aren't touched.

> [Compare](/guides/compare) reads text, so it's for contracts and specifications. Overlay looks at the drawing itself, so it's for plans, and it works on scans too.

## Make an overlay

1. Open the older revision.
2. Choose **File > Overlay Drawings**.
3. For **Current**, pick the newer revision: another open tab, or **Choose File** to pick one from disk.
4. Press **Create Overlay**.

**Swap** flips which one is the previous drawing.

Unsaved markup on either drawing is included, the way it would print.

> A password-protected PDF has to be open in a tab first, so Clumsy has its password.

## One sheet or the whole set

- **One sheet** overlays one page of each file. It starts on the page you're looking at in each tab.
- **Every sheet, matched by page label** pairs "A-201" with "A-201", wherever each one sits in its file. This needs page labels in both files, which drawing sets usually have.
- **Every sheet, matched by page number** pairs page 1 with page 1, page 2 with page 2, and so on.

When you overlay a whole set, the sheet lists every pairing, and you can change any of them before you build. A sheet that's in only one file goes at the end in that file's color alone, so added and removed sheets show too.

Each page of the overlay is labeled with its sheet: "A-201 (overlay)", "A-305 (removed)", or "E-102 (added)".

## Colors

Red and blue is the default. **Red and green** and **magenta and green** are there too, and magenta and green is the pair to pick if red and green look alike to you. Clumsy remembers your choice.

## When the drawings don't line up

By default the two sheets are centered on each other at the same scale. That's right for most drawings exported from the same title block.

If a revision was re-plotted shifted, scaled, or turned, everything will look changed. **Align by Points** fixes that:

1. Press **Align by Points**. Both drawings open side by side.
2. Click a spot on the previous drawing, then the same spot on the current one. A grid intersection or a title block corner works well.
3. Do it again for a second spot, as far from the first as you can.
4. Press **Use These Points**.

Zoom in with **+** before you click. The closer the clicks, the better the fit. **Undo Point** takes back the last one.

Two points fix a move, a change of scale, and a turn. A third point also corrects a scan that went through the scanner crooked.

When you overlay a whole set, you align on the first paired sheet and the same alignment is used for every sheet.

## Clouds around the changes

On a big sheet, a small change is easy to miss. Turn on **Draw clouds around what changed** and Clumsy puts a revision cloud around each area where the two drawings differ.

The clouds are ordinary markup with the subject "Overlay change", so they're counted in the [Markups list](/guides/markups), and you can move, restyle, or delete any of them.

> The clouds are a guide, not a guarantee. A very small change, like one digit in a note, may not get one. Look over the sheet before you send it.

## Show one drawing at a time

Each drawing is on its own layer. Open the **Layers** tab in the sidebar, or **View > Layers**, and turn off **Previous** or **Current** to see the other alone. Other PDF apps that show layers can do the same with the saved file. See [Properties, attachments, and layers](/guides/document-info).

## Good to know

- Gray and colored areas on a drawing come out tinted, because each drawing is turned into shades of its color.
- The overlay doesn't follow its sources. If a drawing changes, make a new overlay.
- Links and bookmarks from the originals aren't carried into the overlay, and filled-in form fields become part of the drawing.
