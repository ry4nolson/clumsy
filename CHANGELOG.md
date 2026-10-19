# Changelog

All notable changes to Clumsy are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
