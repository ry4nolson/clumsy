The quiet parts. You mostly shouldn't have to think about these, which is why it's worth knowing what they do.

## Save writes into your file

[[⌘S]] saves markup, form answers, and page changes straight into the PDF you opened. There's no project file, no sidecar, and no export step. The result is a normal PDF that anything can open.

| Do this | With this |
| --- | --- |
| Save | [[⌘S]] |
| Save As | [[⇧⌘S]] |
| Save All, across every tab in the window | [[⌥⌘S]] |
| {{mac: Show the file in Finder}} | [[⌥⌘R]] |
| {{win: Show the file in File Explorer. The command is called Show in Finder}} | [[⌥⌘R]] |

Saves are atomic: Clumsy writes the new version beside the old one and swaps them only once it's complete. A crash or a full disk mid-save leaves you with the old file, not half of a new one.

A tab with unsaved changes shows a dot. Quit with unsaved work and you get one prompt listing every unsaved document across all windows.

## When another app changes the file

Clumsy watches the files you have open.

- **You haven't changed anything.** The tab reloads with the new version, on the same page and at the same zoom. Regenerate a report or re-export a drawing and the open copy just updates.
- **You have unsaved changes.** Clumsy leaves your tab alone. When you save, it tells you the file changed on disk and asks before overwriting, so you never silently destroy someone else's edit or your own.

It waits for the other app to finish writing before it reloads, so you don't get half a file.

## Undo

[[⌘Z]] covers markup, typing, form resets, and page edits in one history per document. Undo keeps working after you save, so saving isn't a point of no return.

## Recent files and closed tabs

The Start tab lists your recent files, and so does File > Open Recent. [[⌥⌘P]] searches them by name. [[⇧⌘T]] reopens the tab you just closed, on the page you left it.

::: mac
## Default app

Clumsy menu > **Make Clumsy the Default PDF App** makes double-clicking a PDF open it here. There's a matching command for Markdown files.

If Chrome is installed, it likes to show PDFs itself no matter what the default app is. Clumsy points you to the Chrome setting that controls that, and leaves the decision to you. It doesn't change other apps' settings.

## Updates

Clumsy checks for a new version every few hours. When there is one, a sheet shows what changed and offers to install it. The download is verified before anything is replaced.

After installing, **Restart Now** brings everything back: every window, every pane, every tab, on the same page. Documents with unsaved changes come back with those changes intact. You can also press Later and keep working. The update applies the next time you quit.

Clumsy menu > **Check for Updates** looks right away, and Help > **What's New** shows the release notes, which are also on the [changelog](/changelog).
:::

::: win
## Default app

To make double-clicking a PDF open it here, right-click one in File Explorer, choose **Open with > Choose another app**, pick Clumsy, and choose **Always**. The same works for Markdown files.

## Updates

Clumsy checks for a new version every few hours and shows what changed when there is one. It can't install the update itself on Windows yet: **Download** opens the release page, and running the new installer replaces the old version. Save your work first.

Clumsy menu > **Check for Updates** looks right away, and Help > **What's New** shows the release notes, which are also on the [changelog](/changelog).
:::

## What Clumsy doesn't do

No account, no sign-in, no telemetry. Your documents are read from your disk and written back to it. {{mac: The only times Clumsy talks to the network are to check for updates, to load web images in a Markdown file, and, if you use digital signatures, to fetch timestamps and certificate status.}}{{win: The only times Clumsy talks to the network are to check for updates and to load web images in a Markdown file.}}
