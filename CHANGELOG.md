# Changelog

All notable changes to Clumsy are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
