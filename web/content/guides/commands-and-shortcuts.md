Clumsy has well over a hundred commands and a toolbar with room for maybe twenty buttons. The rest are in the menus, on the keyboard, and in the Command Palette.

## Command Palette

[[⇧⌘P]] opens it. Start typing and it narrows to matching commands, with each one's shortcut shown beside it. Press Return to run the top match.

It only lists what you can do right now. With no split, the split commands aren't there. On a PDF with no form, neither are the form commands. So if you're wondering whether something is possible, searching for it is a decent test.

Type `:` and a page number to jump there, like `:42`. Page labels work too, so `:iv` goes to the page labeled iv.

## The shortcuts sheet

[[⌘K]] lists every shortcut, grouped by menu. [[⌘/]] does the same thing.

The layout follows VS Code wherever a PDF viewer has an equivalent, so if your hands already know these, they work. {{win: A few commands have a key on Mac but not yet on Windows. Those are shown by their menu.}}

| Command | Keys |
| --- | --- |
| Command Palette | [[⇧⌘P]] |
| Go to File | [[⌥⌘P]] |
| Toggle Sidebar | [[⌘B]] |
| Page Thumbnails | [[⇧⌘E]] |
| Outline | [[⇧⌘O]] |
| Split Right | [[⌘\]] |
| Go to Page | [[⌃G ~ Go > Go to Page]] |
| Go Back and Go Forward | [[⌃- ~ Go > Go Back]] and [[⌃⇧- ~ Go > Go Forward]] |
| Reopen Closed Tab | [[⇧⌘T]] |
| Save All | [[⌥⌘S]] |

## Single keys

When you aren't typing in a text field, a few plain letters work on their own.

| Key | Does |
| --- | --- |
| [[V]] | Select tool |
| [[H]] | Highlight |
| [[T]] | Text note |
| [[D]] | Draw |
| [[C]] | Comments |
| [[N]] or [[J]] | Next page |
| [[P]] or [[K]] | Previous page |
| [[Space]] | Hold to drag the page, tap to scroll a screen |
| [[Esc]] | Close the find bar, or go back to Select |

## The right-click menu

Right-click a page and the menu starts with {{mac: a row of tools}}{{win: your tools}}, then offers whatever fits what you clicked: Copy and the markup commands over selected text, Copy Link over a link, Add Comment Here on empty space, and a section for the page itself with rotate, delete, {{mac: extract, export, and print}}{{win: extract, and export}}.

Those page commands act on the page you right-clicked, even if it isn't the one you're reading. If you've selected several thumbnails and right-click one of them, they act on the whole selection.

### Choosing the tools

Right-click any tool in the toolbar and pick **Add to Context Menu** or **Remove from Context Menu**. **Reset Context Menu Tools** puts the defaults back. They always follow the toolbar's order.

Saved tools from the [tool chest](/guides/tool-chest) can go there too: right-click one in the Tool Chest tab and pick **Add to Context Menu**. They come after the toolbar's tools.

## When the toolbar runs out of room

Make the window narrow and the toolbar moves tools into the **More** menu at its right edge, starting from the right, rather than wrapping onto a second row. Nothing is gone. Widen the window and they come back.
