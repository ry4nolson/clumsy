For takeoffs and checking drawings: set the drawing's scale once, then measure walls, runs, and rooms right on the page.

## Set the scale

Pages > Set Scale… tells Clumsy what one inch on the page means in real life. Pick a scale from the list:

- **Architectural**, from 1/16" = 1'-0" to 3" = 1'-0".
- **Engineering**, from 1" = 10' to 1" = 100'.
- **Metric**, from 1:1 to 1:1000.
- **Custom**, where you type both sides yourself, like `1/4"` = `1'` or `10 mm` = `1 m`.

Choose the units and precision measurements should show: feet and inches to the nearest 1/16", 1/8", or 1/4", or decimal feet, inches, meters, or millimeters. The preview shows what one inch (or ten millimeters) on the page works out to.

The scale applies to the current page, the selected pages, or every page. Each page keeps its own, so a set with details at different scales works. Remove Scale goes back to full size. Setting a scale can be undone like any other page change.

> Measurements you've already made keep the scale they were made at. Change the scale and the next measurements use the new one.

## Scale from a dimension you know

Drawings that were shrunk or stretched when they were printed to PDF don't match the scale written on them. Calibrate from a dimension instead:

1. In Set Scale, click **Measure a Known Length…**.
2. Click both ends of a dimension you know, such as a wall marked 25'-0". Hold [[⇧]] to keep the line straight. [[Esc]] goes back without measuring.
3. Type its real length (`25'`, `25' 6"`, `7.62 m`) and click Apply.

## Measure

The Measure button in the toolbar has three tools. Click it for the one you used last, or the arrow beside it to pick another. They're in the Tools menu too.

| Tool | How |
| --- | --- |
| **Length** | Drag from one end to the other, or click both ends |
| **Path** | Click each point along the way. Double-click the last point or press [[Return]] to finish |
| **Area** | Click each corner. Click the first corner again, double-click, or press [[Return]] to close it |

While you draw, the reading follows the pointer. [[Delete]] takes back the last point, [[Esc]] cancels, and holding [[⇧]] keeps each segment straight or at 45°.

If the page has no scale yet, Clumsy asks once whether to set it first or measure at full size. A wrong number on a drawing is worse than a question.

The options menu has the measurement color, **Fill** for areas, **Thickness**, and **Opacity**, plus Set Scale….

## Adjust a measurement

Click a measurement to select it, then:

| Do this | With this |
| --- | --- |
| Move a point | Drag its handle |
| Add a point to a path or area | [[⌥]]-click a segment |
| Remove a point | [[⌥]]-click its handle |
| Move the whole thing | Drag it |
| Delete it | [[Delete]] |

The reading updates as you go, and every change can be undone.

## The Measurements list

Picking a Measure tool opens the Measurements tab in the sidebar. It also appears whenever the document already has measurements, including ones made in other apps. It lists every measurement by page, with the total length and total area at the top. Click one to go to it.

**Copy** puts the list on the clipboard to paste into a spreadsheet. **Export CSV…** saves it as a file. Both include the page, type, reading, a plain number with its unit, the scale, and the color, so you can sort a takeoff by trade.

## Saving

Measurements save as standard PDF measurements, so other PDF apps show them with the same readings, and measurements from other apps open in Clumsy ready to adjust.
