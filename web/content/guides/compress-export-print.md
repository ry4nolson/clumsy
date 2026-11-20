{{mac: Three ways}}{{win: Ways}} to get a document out of Clumsy in a different shape.

## Compress

**File > Compress** makes a PDF smaller by shrinking the images inside it. It's built for scans and photo-heavy files, where the images are nearly all of the size.

The sheet starts working as soon as it opens and shows the size before and after. There are three levels:

| Level | Images at | Good for |
| --- | --- | --- |
| High quality | 200 dpi | Still fine for printing |
| Balanced | 150 dpi | Email and reading on screen |
| Smallest | 96 dpi | When size is all that matters. Small print in scans may get hard to read |

Switch levels to see what each would save. Nothing changes until you press **Compress**, and after that [[⌘Z]] puts the original back. The file on disk isn't touched until you save.

It's careful about what it changes. Text and line art stay exactly as sharp, because they aren't images. An image is only scaled down if it has more resolution than the level calls for at the size it's drawn on the page, and it's only replaced if the new version is meaningfully smaller.

If a file is already about as small as it's going to get, Clumsy says so rather than handing you a 1% saving.

## Export pages as images

**File > Export Pages as Images** turns pages into PNG or JPEG files.

- **Pages**: all of them, the current page, the pages you've selected in the thumbnails, or a range you type. Ranges look like `1-3, 5, 8-`, where `8-` means page 8 to the end.
- **Format**: PNG for crisp text and anything with flat color, JPEG for photos. JPEG has a quality slider.
- **Resolution**: 72, 150, or 300 dpi. The sheet shows the pixel size you'll get.

One page goes through a normal save dialog. Several go into a folder you choose, named like `Report - page 01.png`, numbered so they sort correctly.

Your unsaved markup and form answers are in the images. If any of the files already exist, Clumsy asks once before replacing anything.

::: mac
## Print

[[⌘P]] or the printer button next to Save prints the document. **Pages > Print Selected Pages** prints only the thumbnails you've selected, and it's in the right-click menu too.

What comes out is what Save would write: the pages, your markup, your form answers, sticky notes. You don't need to save first. What doesn't print is anything that's only on your screen: find highlights, comparison marks, and dark pages.

Pages print at actual size whenever they fit the paper, and are scaled down only when they don't. A Letter page on Letter paper comes out at 100%, not shrunk to clear the printer's margins.

The print panel's **PDF** button saves a copy instead of printing, with your markup baked in.

Markdown files print too, from the rendered view, on a light background whatever your theme.
:::

::: win
## Print

Printing isn't in the Windows version yet. Save the PDF and print it from another app. Your markup and form answers are in the saved file, so they print from anywhere.
:::
