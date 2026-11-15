You photographed six receipts and someone wants "a PDF". This is that.

## The quick way

Drag the images onto a Clumsy window. They become one new PDF, one page per image, in the order you dragged them. The new tab is named after the first image and is unsaved until you press [[⌘S]].

File > New PDF from Images does the same with a file picker.

## Adding to a PDF you already have

Open the thumbnails ([[⇧⌘E]]) and drag images onto them. They're inserted as pages where you drop them. Or use Pages > Insert Pages from File ([[⌥⌘I]]) and pick images, PDFs, or both.

If you drop a mix of images and PDFs, the order holds: the images become pages and the PDFs slot in between them where they were in the list.

## What happens to each image

- **It lands right side up.** Phone photos record which way the phone was held, and Clumsy reads that. No sideways pages.
- **JPEGs aren't recompressed.** The original file goes into the PDF byte for byte, so there's no quality loss and no second round of compression artifacts.
- **PNGs stay lossless.**
- **Other formats**, such as TIFF from a scanner{{mac:  or HEIC from an iPhone}}, are converted on the way in.

## Page size

Each page is sized to its image and in the image's own orientation: landscape photos get landscape pages. Large images are scaled down to fit a Letter page. Small ones are never blown up.

Photos aren't downsampled, so twelve-megapixel pictures make a big file.

## Afterwards

The result is an ordinary PDF in an ordinary tab, so the rest of Clumsy applies:

- Drag thumbnails to [fix the order](/guides/page-edits), or delete the blurry one.
- Run [File > Compress](/guides/compress-export-print) to bring a stack of phone photos down to something you can email.
- [Sign it](/guides/signatures) or [fill it in](/guides/forms).
