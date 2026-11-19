Clumsy opens `.md` and `.markdown` files the way it opens PDFs: in a tab, formatted, ready to read. It's a reader first and an editor when you need one.

## What renders

- Headings, lists, block quotes, links, and images.
- Tables, task lists with checkboxes, footnotes, and strikethrough.
- Code blocks with syntax highlighting for common languages.
- Front matter at the top of a file, shown as a tidy block instead of a mess.

Images next to the file load from disk. Images on the web load too.

## Links

- A link to a heading scrolls to it.
- A link to another `.md` file or a PDF opens it in a new tab. This makes a folder of notes browsable.
- Web links open in your browser.

Clumsy only follows links to files inside the same project: the folder the Markdown file is in, or the Git repository around it. A file can't quietly pull in something from elsewhere on your disk.

## Editing

[[⇧⌘V]] switches to the source, and [[⇧⌘V]] again switches back. You stay on the same line both ways, so you can spot a typo while reading, flip over, fix it, and flip back without hunting.

The source editor has syntax coloring, undo and redo, and find. [[⌘S]] saves. Clumsy keeps the file's line endings and encoding as it found them.

## Comparing two versions

**File > Compare With File** puts another Markdown file beside this one and marks every line that differs in the source of both. See [Comparing two PDFs](/guides/compare#comparing-markdown-files) for how to read it.

## Getting around

Most of what works on a PDF works here:

| Do this | With this |
| --- | --- |
| Outline of the headings | [[⇧⌘O]] |
| Minimap | [[⌥⌘B]] |
| Find | [[⌘F]] |
| Zoom | [[⌘=]], [[⌘-]], and [[⌘0]] |
| Top and bottom | [[⌘↑]] and [[⌘↓]] |

The minimap is a small picture of the whole document with your position marked. Click or drag to move. Find matches show in it. Find supports match case, whole words, and regular expressions, in both the rendered view and the source.

## Live reload

If another app changes the file, Clumsy reloads it and keeps you on the same line. That makes it a good preview pane: keep the file open in Clumsy beside your editor, or let a script or an AI assistant write to it and watch the result update.

It only reloads when you have no unsaved edits of your own. If you do, it leaves your version alone and asks before overwriting when you save.

::: mac
## Printing

[[⌘P]] prints the rendered document, on a light background whatever your theme, with code wrapped and wide tables fitted to the paper. In the print panel, the PDF button turns Markdown into a PDF.

## Default app

Clumsy menu > **Make Clumsy the Default Markdown App** makes double-clicking a `.md` file open it here.
:::

::: win
## Default app

To make double-clicking a `.md` file open it here, right-click one in File Explorer, choose **Open with > Choose another app**, pick Clumsy, and choose **Always**.
:::
