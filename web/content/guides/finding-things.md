Long PDFs are mostly a navigation problem. These are the tools for it.

## Find

[[⌘F]] opens the find bar. Type, and matches light up as you go. [[⌘G]] goes to the next one, [[⇧⌘G]] to the previous. [[⌘E]] searches for whatever text you have selected.

The find bar has four options:

- **Match case** treats `Total` and `total` as different.
- **Whole words** finds `form` but not `format`.
- **Match diacritics** treats `resume` and `résumé` as different. It's off by default, so plain letters find accented ones.
- **Use regular expression** turns the search box into a pattern. `\d{3}-\d{4}` finds phone-number endings, `(?:19|20)\d\d` finds years, `invoice|receipt` finds either word.

Every match also shows as a tick in the Document Map, so you can see at a glance where in the file a term clusters.

## Document Map

The strip down the right side of each document is a picture of the whole file, with a slider showing the part you're looking at. Click anywhere on it to go there, or drag the slider to scroll. [[⌥⌘B]] hides and shows it.

It marks find matches, and during a comparison it marks changes. On a very long document it scrolls along with you rather than shrinking pages to nothing.

The map follows vertical scrolling, so it steps aside in horizontal and page-by-page scrolling.

## Sidebar

[[⌘B]] toggles the sidebar. It has two tabs most of the time:

- **Pages** ([[⇧⌘E]]) shows thumbnails. Click one to go there. This is also where you [rearrange pages](/guides/page-edits).
- **Outline** ([[⇧⌘O]]) shows the document's bookmarks, if it has any, as a collapsible tree.

More tabs appear when they have something to show: Comments while the Comments tool is on, Changes during a comparison, and Signatures on a signed PDF. Drag the sidebar's edge to resize it.

## Going to a page

[[⌃G ~ Go > Go to Page]] puts the cursor in the page box. Type a number and press Return.

If the document has its own page labels, such as roman numerals for the front matter or `A-3` for an appendix, the page box shows the label along with the real position, like "iv (4 of 212)". You can type either. In the Command Palette, `:iv` or `:4` does the same.

| Do this | With this |
| --- | --- |
| Next and previous page | [[⌥⌘↓]] and [[⌥⌘↑]], or [[N]] and [[P]] |
| First and last page | [[⌘↑]] and [[⌘↓]], or [[Home]] and [[End]] |

## Go Back and Go Forward

Click a link to page 90, read the footnote, and then [[⌃- ~ Go > Go Back]] takes you back to exactly where you were. [[⌃⇧- ~ Go > Go Forward]] goes forward again. The back and forward buttons on a mouse do the same.

Clumsy remembers a stop every time you jump: links, outline entries, Go to Page, first and last page, each find result, and each change in a comparison. Ordinary scrolling doesn't count, so the history stays short and useful. Each tab keeps its own, up to 50 stops.
