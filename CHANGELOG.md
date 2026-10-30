# Changelog

All notable changes to Clumsy are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.8.3] - 2026-10-30

### Fixed
- Restarting after an update puts each window back where it was and focuses the one you were using, and still names any document it couldn't reopen
- An unsaved document whose folder was moved or renamed comes back after a restart as an unsaved copy instead of being left out

## [0.8.2] - 2026-10-30

### Changed
- **About** also lists exporting pages as images and making PDFs from images

## [0.8.1] - 2026-10-30

### Changed
- **About** lists more of what Clumsy does: page changes, comparing documents, Markdown, and tabs, splits, and windows

## [0.8.0] - 2026-10-30

### Added
- **Automatic updates**: when a new version is out, Install Update downloads and installs it from inside Clumsy, then Restart Now opens the new version (or it opens the next time you launch). Restarting brings back every window where it was, with its splits, tabs, pages, and zoom, and unsaved changes come back unsaved, so nothing has to be saved or discarded first. If an update can't install in place (for example when Clumsy runs straight from the disk image or Downloads), Download opens the release page as before

## [0.7.0] - 2026-10-30

### Added
- **Markdown files**: open `.md` files from Finder, the Open dialog, recent files, or by dropping them on the window, and they show up formatted, not as raw text. Press ⇧⌘V (View > Markdown Source) to edit the source and again to go back, and you stay on the same spot either way. Images next to the file, links to other Markdown files and PDFs, code highlighting, tables, task lists, and footnotes all work. The sidebar outlines the headings, a minimap beside the document shows where you are (⌥⌘B, like the Document Map for PDFs), Find works in both views, and the file reloads in place when another app changes it. Clumsy > Make Clumsy the Default Markdown App… makes double-clicking a `.md` file open it here

## [0.6.0] - 2026-10-30

### Added
- **Page Labels** (Pages > Page Labels…, or right-click a thumbnail): name a range of pages with 1, 2, 3, roman numerals, or letters, an optional prefix like "A-", and a starting number, with a preview. Pages outside the range keep their labels, Remove All Labels goes back to plain page numbers, and Undo works like any other page edit

## [0.5.0] - 2026-10-30

### Added
- **Export Pages as Images**: File > Export Pages as Images… (also Pages > Export Selected Pages as Images… and the thumbnail menu) saves pages as PNG or JPEG at 72, 150, or 300 dpi. Export every page, the current page, the selected pages, or a range like “1-3, 5”. Highlights, notes, and filled-in forms come out the way they'd print, even before you save. Several pages go into a folder you choose, named “Report - page 01.png” and so on, and Clumsy asks before replacing any files already there. Longer exports show progress and can be cancelled, and when an export finishes you can jump to the files in Finder
- **New PDF from Images**: File > New PDF from Images… makes a PDF with one page per image and opens it in a new tab. Dropping images on the window does the same, and dropping PDFs and images together opens the PDFs and puts the images in one new PDF. Works with PNG, JPEG, HEIC, WebP, GIF, TIFF, BMP, and AVIF. Phone photos come out right side up, and JPEGs keep their original quality
- **Insert images as pages**: drop images on the page thumbnails to insert them where you drop, or pick them in Pages > Insert Pages from File…, which now takes several files at once. Undo works like any other page change

### Changed
- **About** and **Keyboard Shortcuts** open as sheets in the window instead of separate windows. Press Esc or ⌘W to close them

### Fixed
- The **Highlight** button that appears over selected text now highlights it. Before, it only cleared the selection unless the Highlight tool was already on

## [0.4.2] - 2026-10-30

### Fixed
- Undo and Redo from the Command Palette work again; they acted on the palette's search field instead of the document
- The Document Map toggle no longer shows in the Command Palette or responds to ⌥⌘B while scrolling horizontally or by page, where the map can't show

## [0.4.1] - 2026-10-30

### Added
- **Scrolling and spreads**: View > Vertical, Horizontal, Wrapped, or Page Scrolling, and No, Odd, or Even Spreads. Each tab keeps its own, and new tabs start with your last choice. The Document Map shows spreads side by side; it hides in horizontal and page scrolling, and linked scrolling in a comparison pauses until both sides scroll up and down again
- **Go Back and Go Forward** (⌃- / ⌃⇧-, or the mouse's back and forward buttons) retrace jumps from links, the outline, Go to Page, first and last page, search results, and comparison changes. Each tab keeps its own history, even when it moves to another window
- **Page labels**: documents that number their pages "iv" or "A-3" show that label in the page box, with the page number beside it, and on thumbnails. Go to Page takes a label or a number, and so do the Command Palette and Go to File after a colon (`:iv`)
- Documents can choose how they open: the page or spot to start on, Outline or Pages in the sidebar, and one or two pages at a time. This only applies the first time you open a file; after that, your own settings win
- **Hand tool** (Tools > Hand) drags the page around. Hold Space to use it for a moment from any tool; a quick tap of Space still scrolls a screen
- **Drawing options**: thickness and opacity for Draw, font size for Text Note, and thickness for freehand highlights sit next to the colors. They change the selected markup, or the next one you add, and are remembered
- **Match Diacritics** in the find bar: off by default, so "cafe" finds "café". Works with regular expressions too
- **Caret Browsing** (View > Caret Browsing, F7) puts a text cursor in the page so the arrow keys, Home, and End move through the text and Shift selects it

### Fixed
- Moving, deleting, inserting, or extracting pages keeps each page's label with it, instead of leaving labels where the old pages were
- Regular-expression search now finds accented words typed with accents

## [0.4.0] - 2026-10-30

### Added
- **Document Map**: a narrow pane beside each document shows every page with the part you're looking at highlighted. Click to jump, drag the highlight to scroll, or scroll over the map. Search matches, comparison changes, and selected pages are marked on it. Long documents shrink to fit, then scroll with the viewer. Toggle it with View > Document Map (⌥⌘B)

## [0.3.2] - 2026-10-29

### Changed
- The **Changes** list follows the document as you scroll, keeping the change you're reading centered and marked

## [0.3.1] - 2026-10-29

### Added
- **Export Comparison Report**: File > Export Comparison Report… (or the export button on the comparison bar) saves a PDF listing both file names, the date, how many changes of each kind and how many words were added and removed, then every change with its pages in each document and its full before and after text
- The **Changes** list can show only added, removed, or changed text, and counts how many words were added and removed

## [0.3.0] - 2026-10-29

### Added
- **Compare documents** side by side: File > Compare With File… or View > Compare Split Panes highlights removed, added, and changed text on both pages, lists every change in a new **Changes** sidebar tab, and scrolls the two panes together. Next Change and Previous Change (⌥F5 / ⇧⌥F5) step through them

## [0.2.13] - 2026-10-29

### Added
- **Regular expression search**: turn on the .* button in the find bar to search with a pattern. Match Case and Whole Words still apply, and an invalid pattern says so instead of searching

## [0.2.12] - 2026-10-29

### Fixed
- **Find** finds text in the app now; the 0.2.11 fix wasn't enough, and searches still came back with no matches

## [0.2.11] - 2026-10-29

### Fixed
- **Find** now finds text; every search had been coming back with no matches

## [0.2.10] - 2026-10-21

### Fixed
- Download disk image shows the branded background again (icon layout alone had been making it through)

## [0.2.9] - 2026-10-21

### Added
- Checks for updates on startup and when the window is focused again (not on a background timer), and shows release notes for every version since the one you have installed

## [0.2.8] - 2026-10-21

### Changed
- The download disk image opens to a branded window (drag Clumsy onto Applications)

## [0.2.6] - 2026-10-21

### Changed
- Releases keep `package.json`, `tauri.conf.json`, and `Cargo.toml` on the same version (they had drifted to 0.1.0 / 0.2.0)

## [0.2.5] - 2026-10-21

### Fixed
- About (and Help menu) links open in the browser again; the opener permission was missing its URL allowlist

## [0.2.4] - 2026-10-21

### Added
- **Command Palette** (⇧⌘P): search every command by name and run it, with its shortcut shown next to it
- **Go to File…** (⌘P): jump to an open tab or a recent file by typing part of its name
- **Reopen Closed Tab** (⇧⌘T) brings back the last tab you closed, on the same page and zoom
- **Save All** (⌥⌘S) saves every edited document in the window

### Changed
- Keyboard shortcuts now follow the popular code editor layout: **Toggle Sidebar** is ⌘B, **Page Thumbnails** ⇧⌘E, **Outline** ⇧⌘O, **New Tab** ⌘N (⌘T still works), **New Window** ⇧⌘N, **Go to Page** ⌃G, and **First Page** / **Last Page** ⌘↑ / ⌘↓

## [0.2.3] - 2026-10-21

### Added
- **Organize pages** from the sidebar: drag thumbnails to reorder, ⌘-click or ⇧-click to select several, Delete to remove, and right-click to rotate, delete, extract, or insert pages; the new **Pages** menu has the same commands
- **Insert Pages from File…** (⌥⌘I), or drop PDFs onto the page thumbnails to insert them right where you drop
- **Extract Pages to New Tab** turns the selected pages into their own document
- **Combine Files…** in the File menu merges several PDFs into one new document
- Page changes can be undone and redone with ⌘Z / ⇧⌘Z
- Deleting pages removes them from the file completely, along with their form fields and any links or bookmarks that pointed to them

## [0.2.2] - 2026-10-20

### Added
- PDFs reload automatically when another app changes them, keeping your page, zoom, and scroll position, as long as you haven't edited them in Clumsy

### Fixed
- Clicking a menu item acted on the most recently opened window instead of the one in front
- **Quit** (⌘Q) asks before discarding unsaved changes in any window instead of quitting right away
- Opening a PDF that's already open in another window switches to it there instead of opening a second, separately saved copy
- Saving warns when the file was changed by another app since you opened it, instead of silently replacing those changes
- Saving a PDF through a symlink updates the linked file and keeps its permissions instead of replacing the link
- Opening and saving large PDFs no longer freezes menus and the window while the file is read or written

### Changed
- Clumsy only reads and writes files you opened, dropped, picked, or recently used, and pages run under a content security policy

## [0.2.0] - 2026-10-20

### Added
- **Multiple windows**: **New Window** (⌘N), **Move Tab to New Window** (⌥⌘N), drag a tab out of the window to open it in its own window, or drop it on another Clumsy window to move it there; a window whose last tab moves away closes
- Moved documents keep their page, scroll position, zoom, rotation, and unsaved changes; menus and shortcuts always act on the window in front, and PDFs opened from Finder go to the most recently used window
- **Keyboard Shortcuts** also opens with ⌘K

### Fixed
- A drawing still in progress, or a text note still being typed, is now included when you save, and closing a tab or window with one asks before discarding it

## [0.1.8] - 2026-10-20

### Added
- **Split view**: show documents side by side, each pane with its own tabs. **Split Right** (⌘\) opens the current PDF again beside itself, drag a tab onto another pane to move it or onto a pane's right edge to split, drag the divider to resize, and **Close Split** (⇧⌘\) merges everything back
- Move tabs between panes (⌃⌘← / ⌃⌘→) and switch the focused pane (⌥⌘← / ⌥⌘→); the focused pane drives the toolbar, menus, and window title
- Drag tabs to reorder them

### Changed
- **Toggle Sidebar** moved to ⌥⌘S so ⌘\ can split

## [0.1.7] - 2026-10-20

### Changed
- New tagline: "No tricks, no acrobatics."

## [0.1.6] - 2026-10-19

### Fixed
- Pages no longer shake when a document's fitted height lands right at the scroll threshold with always-visible scrollbars; the page also no longer shifts sideways when the scrollbar appears

### Removed
- Two sample PDFs that were accidentally bundled into the v0.1.4 and v0.1.5 apps; those releases have been withdrawn

## [0.1.5] - 2026-10-19

### Changed
- **About** (with What's New and Licenses) and **Keyboard Shortcuts** open in their own windows instead of popups; they can sit beside your document, and reopening one brings it to the front
- The default PDF app prompt is a native macOS alert
- Password and signature prompts slide down from the toolbar like macOS sheets
- About and Keyboard Shortcuts open centered over the Clumsy window, on whichever display it's on

## [0.1.4] - 2026-10-19

### Added
- **Licenses** tab in the About window with Clumsy's license and the licenses of every bundled open source package
- Full menu bar with every command and its shortcut: **Go** and **Tools** menus, a **Help** menu with **Keyboard Shortcuts** (⌘/), **What's New**, **Clumsy on GitHub**, and **Report an Issue…**; macOS Help search now finds Clumsy commands
- New shortcuts: Rotate Left (⌘L), Fit Page (⌥⌘9), Page Thumbnails / Outline (⌥⌘1 / ⌥⌘2), Go to Page (⌥⌘G), previous / next / first / last page (⌥⌘↑ / ⌥⌘↓ / ⇧⌥⌘↑ / ⇧⌥⌘↓), Dark Pages (⇧⌘D), Use Selection for Find (⌘E), Show in Finder (⌥⌘R), and ⌃⌘ shortcuts for the markup tools
- Menu items for document commands are disabled when no PDF is open, and Dark Pages / Invert Images show checkmarks

### Fixed
- ⌘Z / ⇧⌘Z now undo and redo highlights, notes, and drawings instead of only text edits

## [0.1.3] - 2026-10-19

### Changed
- What's New now shows every release under its own version instead of an ever-growing Unreleased section
- Clumsy is now open source under the MIT License

## [0.1.2] - 2026-10-19

### Added
- **Tabs**: open several PDFs at once, each keeping its own scroll position, zoom, sidebar, search, and unsaved markup; **New Tab** (⌘T) opens the start screen, **Close Tab** (⌘W) warns about unsaved changes, and ⌃Tab, ⇧⌘[ / ⇧⌘], and ⌘1–8 switch tabs
- **Open Recent** in the File menu and a recent files list on the start screen, with relative times, per-file removal, and missing-file cleanup
- Opening several PDFs from Finder or by drag-and-drop opens each one in its own tab, and reopening a file that's already open switches to its tab

### Changed
- Fit width and fit page now re-fit when the window is resized

## [0.1.1] - 2026-10-19

### Added
- **About** window with version, feature overview, project links, and Texas Beard Company sponsorship
- **What's New** release history built from the bundled changelog
- **About Clumsy** and **Check for Updates…** in the app menu, backed by GitHub releases
- Offers to become the default PDF app on launch, with **Not Now** and **Don’t ask again**; also available from the app menu and the About window

### Changed
- New app icon: a PDF sent flying by a banana peel, replacing the Tauri placeholder

## [0.1.0] - 2026-10-19

### Added
- Tauri + pdf.js PDF viewer that opens from Finder, ⌘O, or drag-and-drop
- Continuous scrolling, zoom (presets, ⌘+/−, pinch), rotation, and page jump
- Sidebar with page thumbnails and document outline
- Find in document with match count, case-sensitive and whole-word options
- Dark pages that invert text while keeping images untouched, with an option to invert images too
- Markup: highlights, text notes, freehand drawing, images, form filling, and a reusable drawn signature
- Saves markup and form values back into the PDF (⌘S / ⇧⌘S) with unsaved-change protection
- Toolbar integrated into the macOS title bar
