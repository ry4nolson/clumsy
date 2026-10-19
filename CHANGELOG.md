# Changelog

All notable changes to Clumsy are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **About** window with version, feature overview, project links, and Texas Beard Company sponsorship
- **What's New** release history built from the bundled changelog
- Opening several PDFs from Finder or by drag-and-drop opens each one in its own tab, and reopening a file that's already open switches to its tab
- **About Clumsy** and **Check for Updates…** in the app menu, backed by GitHub releases
- **Tabs**: open several PDFs at once, each keeping its own scroll position, zoom, sidebar, search, and unsaved markup; **New Tab** (⌘T) opens the start screen, **Close Tab** (⌘W) warns about unsaved changes, and ⌃Tab, ⇧⌘[ / ⇧⌘], and ⌘1–8 switch tabs
- **Open Recent** in the File menu and a recent files list on the start screen, with relative times, per-file removal, and missing-file cleanup
- Offers to become the default PDF app on launch, with **Not Now** and **Don’t ask again**; also available from the app menu and the About window

### Changed
- Fit width and fit page now re-fit when the window is resized
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
