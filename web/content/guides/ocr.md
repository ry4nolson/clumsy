A scan is a picture of a page. You can read it, but you can't search it, select a sentence, or copy a number out of it. **File > Recognize Text (OCR)** reads the words in the picture and adds them to the page as real text.

## Recognize the text

1. Open the scanned PDF. A bar across the top says the document has no text to search or select. Press **Recognize Text (OCR)** on it.
2. Pick the pages: all of them, the current page, the pages you've selected in the thumbnails, or a range like `1-3, 5, 8-`.
3. Pick the language the document is written in.
4. Press **Recognize**.

There are other ways in, and they all open the same sheet:

- In a file that mixes typed and scanned pages, each scanned page has a small **Recognize Text (OCR)** button in its top corner. It opens the sheet with that page picked; choose **All** there to do every scanned page at once.
- Right-click a page or a thumbnail and choose **Recognize Text (OCR)**. With several thumbnails selected it does all of them.
- Right-click the document's tab and choose **Recognize Text (OCR)**.
- **File > Recognize Text (OCR)**, or [[⇧⌘P]] and type `ocr`.

The bar shows when Clumsy finds no text on the first, middle, and last pages. Otherwise the button appears on each page that is a picture with no text. The × on either one hides them for that document.

A page takes a couple of seconds. When it's done, the sheet says how many pages got text.

The pages look exactly the same afterwards. The text sits on top of the scan, invisible, lined up with the words in the picture. That's what lets you:

- Search the document with [[⌘F]], with the matches highlighted on the scan.
- Select text with the mouse and copy it.
- Compare the scan against another version with **Compare With File**.
- Find the text from other apps, and from your computer's own file search, once you've saved.

## Nothing leaves your computer

The recognizing happens on your computer. Your pages aren't uploaded anywhere, and it works with no internet connection.

The one thing Clumsy downloads is the language itself, the first time you use it. English is about 4 MB. It's kept after that, so each language downloads once.

## Pages that already have text

**Leave text that's already there alone** is on to begin with. With it on:

- A typed page with no pictures is skipped.
- A typed page with a scanned picture in it, such as a clipping, a screenshot, or a photographed label, gets text for the words inside the picture only. The typed text around it isn't touched or doubled.
- A scan that someone already ran through text recognition is left as it is.

So a file that mixes typed pages, scanned pages, and pages with both only gets text where it's missing, and running it twice changes nothing the second time.

Turn it off to read a whole page from scratch, for a scan whose existing text is wrong. The new text is added on top of the old, so searches may find a word twice.

## Undo and saving

Recognizing text is one change you can undo with [[⌘Z]]. Nothing is written to the file until you save.

> If the PDF is digitally signed, Clumsy asks first, because adding text changes the file and removes the signatures.

## Getting good results

- Clean, straight scans at 300 dpi read best. Small or blurry print gets more mistakes.
- Pick the right language. A German page read as English loses its umlauts.
- Handwriting mostly doesn't work.
- A page scanned sideways needs turning first: **Pages > Rotate Pages Right** or **Left**, then recognize.
- Arabic and Hebrew aren't offered yet.
