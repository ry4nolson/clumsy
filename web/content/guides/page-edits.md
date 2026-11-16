Open the thumbnails with [[⇧⌘E]]. Nearly everything here starts with selecting pages there.

## Selecting pages

Click a thumbnail to select it. [[⌘]]-click adds or removes one, [[⇧]]-click selects a run, and [[⇧]] with the arrow keys extends the selection from the keyboard.

Page commands act on the selection. With nothing selected, they act on the page you're on. Right-click a thumbnail, or the page itself, and the commands act on the page you clicked.

## Reorder

Drag a thumbnail, or a whole selection, up or down. A line shows where it will land.

## Rotate, delete, extract

All three are in the Pages menu and the right-click menu.

- **Rotate Pages Left** and **Right** turn the pages a quarter turn and save that with the file. This is the fix for a scan that came in sideways. (The View menu's Rotate only changes how you're looking at it.)
- **Delete Pages** removes them.
- **Extract Pages to New Tab** copies the selection into a new, unsaved document and leaves the original alone. Save the new tab wherever you like.

## Insert and combine

- **Pages > Insert Pages from File** ([[⌥⌘I]]) adds pages after the current one. Pick PDFs, images, or a mix, several at once.
- **Drag files onto the thumbnails** and they're inserted where you drop them.
- **File > Combine Files** joins several PDFs into one new document, in the order you picked them.

Images become one page each. Links and bookmarks inside the pages you bring in keep working.

## Page labels

Books number their front matter i, ii, iii and start again at 1. Appendices go A-1, A-2. PDFs can carry those labels, and Clumsy shows them in the page box.

**Pages > Page Labels** sets them. Choose a range of pages, a style (numbers, roman numerals, letters, or no number at all), an optional prefix like `A-`, and the number to start at. A preview shows the result before you apply it.

Labels follow their pages. Move chapter 3 ahead of chapter 2 and each page keeps the label it had.

## Page scale

**Pages > Set Scale** tells Clumsy a drawing's scale, such as 1/4" = 1'-0", so [measurements](/guides/measure) read in real feet and inches. Like other page edits, it can be undone.

## Undo

Every page edit can be undone with [[⌘Z]] and redone with [[⇧⌘Z]], going back 20 steps per document. Nothing touches the file on disk until you save.

## Deleted means deleted

When you delete a page and save, Clumsy rewrites the file without it. The page's content, its links, its form fields, its comments, and any bookmarks that pointed at it all go. So do earlier versions of the document that some PDFs carry around inside them.

That matters because people delete pages to remove things they don't want to share. A deleted page shouldn't be recoverable by someone curious with the right tool, and here it isn't.

## Protected and signed files

Page edits work on password-protected PDFs. The file stays protected with the same password when you save.

They don't mix with digital signatures. Changing pages rewrites the document, which a signature exists to detect, so on a signed file Clumsy asks before going ahead.
