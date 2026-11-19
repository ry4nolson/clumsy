Someone sent back the contract "with a few small changes". Compare shows you every one of them.

## Start a comparison

Two ways:

- **File > Compare With File.** With one version open, pick the other. It opens beside the first and the comparison starts.
- **View > Compare Split Panes.** If both versions are already open in a split, this compares the two tabs you're looking at.

The left side is labeled **Original** and the right **Changed**.

## Reading the result

Clumsy compares the text word by word and marks both documents:

- Text that was **added** is marked on the changed side.
- Text that was **removed** is marked on the original, with a thin marker on the other side where it used to be.
- Text that was **changed** is marked on both.

A bar above each side counts the changes of each kind and how many words were added and removed.

The comparison follows the text, not the page numbers. Insert a new page 2 and it doesn't flag everything after it as different. It recognizes that the rest simply moved down.

> Compare reads text. Two scans with no text layer, or a change that's only in an image, won't show up.

## Stepping through

| Do this | With this |
| --- | --- |
| Next Change | [[⌥F5]] |
| Previous Change | [[⇧⌥F5]] |

The sidebar gains a **Changes** tab that lists every change with a snippet of the before and after. Click one to go to it. Buttons at the top filter the list to only added, removed, or changed text.

Changes are also marked in the [Document Map](/guides/finding-things), which is the quickest way to see whether the edits are spread throughout or all in section 4.

## Linked scrolling

Scroll one side and the other follows, lined up on matching text rather than page position, so the two stay in step even when one version is pages longer. The link button in the bar turns it off when you want to look around on one side.

## Swap sides

**Swap sides** flips which document is the original. Added becomes removed and the other way around.

## Export a report

**File > Export Comparison Report** saves a PDF listing every change with its page, its kind, and the text before and after, plus the totals. Send that instead of trying to describe forty edits in an email.

## Comparing Markdown files

The same two commands compare two Markdown files. Open one, choose **File > Compare With File**, and pick the other, or put both in a split and choose **View > Compare Split Panes**.

Both files switch to their source, since that's where a Markdown change lives:

- A line that was **changed** is tinted on both sides, with the words that differ highlighted inside it.
- Lines that were **added** are tinted on the changed side, and a thin line on the original shows where they'd go.
- Lines that were **removed** are tinted on the original, with the thin line on the changed side.

Each change is also marked on the minimap beside each file. Next Change, Previous Change, linked scrolling, and Swap sides work as they do for PDFs. The bar counts the changes, and hovering over the count shows how many lines were added and removed.

Both sides stay editable, and the marks follow as you type. That makes it a way to merge by hand: step to a change, fix it on one side, and watch it disappear.

Switching either file back to the formatted view ends the comparison. There's no Changes tab and no report for Markdown, and a PDF can't be compared with a Markdown file.

## Ending it

The **End comparison** button in the bar, or View > End Comparison. Closing either tab ends it too. Nothing about a comparison is ever saved into either document: the marks are only on your screen.
