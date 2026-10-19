# Changelog

All notable changes to Clumsy are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
