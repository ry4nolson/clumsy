There are two kinds of PDF form. Real ones have fields you can click into. Paper ones are a picture of a form that somebody scanned. Clumsy handles both.

## Forms with fields

Click a field and type. [[Tab]] moves to the next field and [[⇧Tab]] to the previous one, in reading order: top to bottom, left to right, and on to the next page when the current one runs out. After the last field it wraps back to the first.

Go > Next Form Field and Previous Form Field do the same from the menu, and they're in the Command Palette if you'd rather not hunt for the first field on page 9.

Fields are shaded so you can spot them, and required ones get an outline. View > Highlight Form Fields turns that off if it gets in the way of reading.

### Forms that do math

Some forms calculate totals, format dates and phone numbers as you type, or refuse a value that doesn't make sense. Those rules are small scripts inside the PDF, and Clumsy runs them, each document in its own sandbox where it can't touch your files or your other tabs.

If you'd rather a form didn't run anything, turn off View > Run Form Scripts. The fields still take whatever you type.

### Reset Form

Tools > Reset Form puts every field back to what the file started with. [[⌘Z]] undoes it, all at once.

### Flatten Form

Tools > Flatten Form turns your answers into ordinary page content. The fields are gone, and what you typed is now part of the page, the same as the printed text around it.

Flatten when you're sending a finished form to someone who shouldn't be able to change the answers, or to a system that chokes on fillable PDFs. It can be undone like any other page edit.

## Paper forms

No fields to click? The **Fill In** button in the toolbar has four marks:

- **Checkmark**
- **Cross**
- **Dot**
- **Today's Date**

Pick one and click the page wherever it belongs. Keep clicking to place more. The marks go on as crisp vector shapes, not blurry pictures, and the date is real text in your Text Note color and size.

For names, addresses, and anything else you need to type, use the Text Note tool ([[T]]): click the blank and type.

Then [sign it](/guides/signatures) and you're done.

## Saving and printing

[[⌘S]] writes your answers into the PDF. {{mac: Printing includes them whether or not you've saved yet.}}

> Filling in a form that someone has digitally signed is fine. Flattening it isn't: that rewrites the document and removes the signature, so Clumsy asks first.
