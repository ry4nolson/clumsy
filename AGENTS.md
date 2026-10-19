# Clumsy

A lightweight macOS PDF viewer built as an Acrobat replacement. Tauri 2 (Rust) shell, React 19 + TypeScript UI, pdf.js 6 for rendering and markup. Sponsored by Texas Beard Company, the same branding used in TheAnnex and DutiHEHE.

Repo: https://github.com/ry4nolson/clumsy (public, MIT License). The local folder is still named `pdf-viewer`. The license covers code only: the Clumsy name and icon and the Texas Beard Company name and logos are excluded (see README).

## Commands

```bash
pnpm install
pnpm tauri dev                 # run the desktop app with hot reload
pnpm dev                       # browser-only UI at http://localhost:1420 (no file paths, menus, or recents)
pnpm test                      # vitest (tests/*.test.ts)
pnpm exec tsc --noEmit         # typecheck
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --lib
pnpm tauri build --bundles app # local release build -> src-tauri/target/release/bundle/macos/Clumsy.app
```

- Node 20.19+ is required by Vite 8 (Node 22 recommended). pnpm is pinned through `packageManager` in `package.json`.
- Universal builds (`--target universal-apple-darwin`) need rustup's toolchain with `x86_64-apple-darwin` installed. Homebrew's `cargo` can't cross-compile, so put `~/.cargo/bin` first in `PATH` for those builds.

## Layout

```
src/
  App.tsx                    app shell: tab list, toolbar, menus, dialogs, keyboard routing
  components/
    DocumentTab.tsx          one open PDF: its own pdf.js viewer, sidebar, find bar
    TabStrip.tsx             tab bar (start tabs + document tabs)
    Welcome.tsx              start screen with recent files
    Toolbar.tsx              title-bar toolbar (lives in the macOS overlay title bar)
    AboutDialog.tsx, ChangelogList.tsx, DefaultAppDialog.tsx, SignatureDialog.tsx, PasswordDialog.tsx, ...
  hooks/usePdfViewer.ts      wraps pdf.js PDFViewer, EventBus, find controller, editor modes
  lib/                       pure logic (shortcuts, tabs, changelog, recent, imageRegions, defaultApp) + platform.ts
src-tauri/src/
  lib.rs                     commands, native menu, file-open events
  recent.rs                  recent files list, persisted + mirrored into File > Open Recent
  default_app.rs             Launch Services: read/set the default PDF handler
scripts/
  next-version.sh            computes the next release version
  stamp-changelog.mjs        moves [Unreleased] under a release heading
  create-dmg.sh              headless DMG (no Finder/AppleScript styling, CI-safe)
tests/                       vitest unit tests for src/lib and scripts
```

`src/lib/platform.ts` is the only place that talks to Tauri. Everything there has a browser fallback, so `pnpm dev` works for UI work.

## Architecture notes

- **Tabs.** Every document tab mounts its own `DocumentTab` with its own pdf.js `PDFViewer`. Don't swap documents inside one viewer: unsaved highlights and notes live in the viewer's editor layer and would be lost. Inactive tabs stay laid out but hidden (`visibility: hidden` + `inert`); `display: none` would reset their scroll position. App keeps per-tab `TabSnapshot`s (page, zoom, tool, modified, find state) to drive the toolbar and window title, and calls into tabs through `DocumentHandle` refs.
- **Start tabs.** Opening a file from a Start tab replaces that tab, like a browser's new-tab page. Opening a path that's already open switches to its tab. Closing the last tab leaves a Start tab.
- **Saving.** `pdfDocument.saveDocument()` writes markup and form values as an incremental update over the original bytes held by the worker, so repeated saves don't duplicate annotations. The Rust `write_pdf` command takes raw bytes with the path in a percent-encoded `x-path` header and writes atomically (temp file + rename), `.pdf` paths only.
- **Dark pages.** The default ("Keep images") applies `invert(0.92) hue-rotate(180deg)` to `.canvasWrapper` and the editor layer, then draws each image's original pixels into an unfiltered overlay canvas (`.image-restore`). Image rectangles come from pdf.js's image tracker (`imagesRightClickMinSize: 0`) and are rotated by `src/lib/imageRegions.ts`. pdf.js's own `pageColors` high-contrast mode recolors images too, so it isn't used. `enableDetailCanvas` is off because the detail canvas would cover the overlay.
- **Recent files.** Rust owns the list (`~/Library/Application Support/com.ry4nolson.clumsy/recent-files.json`, max 20, menu shows 10) so the native menu works before the webview loads. The frontend records a path after a successful load or a Save As, and listens for `recent-files-changed`.
- **Default PDF app.** `default_app.rs` calls `LSCopyDefaultRoleHandlerForContentType` / `LSSetDefaultRoleHandlerForContentType` for `com.adobe.pdf` (what `duti` uses). Only offered when running from an installed `.app`; dev builds aren't registered bundles.
- **Native menu.** Built in `install_app_menu`: custom About / Check for Updates / Make Default items, and a rebuilt File menu (New Tab ⌘T, Open… ⌘O, Open Recent, Close Tab ⌘W, Close Window ⇧⌘W). Menu items emit events the frontend listens for in `platform.ts`. A menu accelerator swallows the key, so the webview never sees it.
- **Title bar.** The window uses `titleBarStyle: Overlay` with `hiddenTitle`; the toolbar pads left for the traffic lights (except in fullscreen) and toolbar groups carry `data-tauri-drag-region`.
- **Version** shown in the app comes from `tauri.conf.json` at build time (`__APP_VERSION__` in `vite.config.ts`); CI sets it from the computed release version.

## Releases

Every push to `main` builds, signs, notarizes, and publishes a GitHub release (`.github/workflows/release.yml`). Pull requests run `ci.yml` instead.

- **Versioning** (`scripts/next-version.sh`): bump the patch of the latest `vX.Y.Z` tag. To jump to a new minor or major, set `version` in `src-tauri/tauri.conf.json` (for example `0.2.0`); the next push releases exactly that and later pushes continue from it.
- **Changelog**: add user-facing changes under `## [Unreleased]` in `CHANGELOG.md` (Keep a Changelog sections: Added / Changed / Fixed / Removed; `**bold**` renders in the app). On release, the workflow moves those entries under `## [x.y.z] - date`, builds with the stamped file so What's New is correct, uses that section as the release notes, then commits it back to `main` as `Release vx.y.z`. If `[Unreleased]` is empty, nothing is stamped and the notes list commit subjects instead.
- **After every release `origin/main` is one commit ahead** (the changelog commit). Run `git pull --rebase` before pushing again, or set `git config pull.rebase true`. Pushes made with the workflow's `GITHUB_TOKEN` don't trigger new workflow runs, so there's no release loop.
- Releases run one at a time (`concurrency: release`). Pushes touching only `README.md`, `AGENTS.md`, `CLAUDE.md`, or `docs/` don't release. The workflow can also be run manually from the Actions tab.
- Assets are `Clumsy.dmg` and `Clumsy.zip`: universal (Apple Silicon + Intel), Developer ID signed, notarized, and stapled.

### Signing

Secrets on the repo (same set as TheAnnex and DutiHEHE): `DEVELOPER_ID_P12` (base64 of the exported `.p12`), `DEVELOPER_ID_P12_PASSWORD`, `APPLE_ID`, `APPLE_ID_PASSWORD` (an app-specific password from account.apple.com). Team ID `M3C8F32WA5`; identity `Developer ID Application: Texas Beard Company LLC (M3C8F32WA5)`.

- The exported certificate lives at `~/Developer/Certificates-duti.p12` (also `Certificates.p12`). Check a password with `/usr/bin/openssl pkcs12 -in <file> -nokeys -clcerts | /usr/bin/openssl x509 -noout -subject`. Use macOS's LibreSSL; Homebrew's OpenSSL 3 rejects Keychain's legacy encryption and looks like a wrong password.
- Notarization failing with HTTP 403 "A required agreement is missing or has expired" means the account holder must accept an updated agreement at developer.apple.com/account; nothing in the repo is wrong. Rerun with `gh run rerun <id> --failed`.

## App icon

The source is `src-tauri/icons/app-icon.svg` (1024×1024, macOS icon grid: 824px rounded square at 100,100, radius ≈185). Regenerate every size with:

```bash
pnpm tauri icon src-tauri/icons/app-icon.svg
rm -r src-tauri/icons/android src-tauri/icons/ios   # desktop-only app
```

Check legibility at 32px before committing. Keep icon sources out of `public/`, which ships inside the app.

## Conventions

- Match the existing style: no code comments unless the logic truly needs one, self-explanatory names, small pure helpers in `src/lib` with vitest coverage.
- Global form-control resets use `:where(:is(button, input, select):not(.pdfViewer *))` on purpose: zero specificity so component classes win, and pdf.js's own controls (whose layers set huge font sizes) are left alone.
- pdf.js 6 API notes: `PDFDocumentProxy.destroy()` is gone (use `loadingTask.destroy()`); `page.render({ canvas, viewport })`; editor modes are set with `viewer.annotationEditorMode = { mode }`; default colors go through the `switchannotationeditorparams` event.
- Typecheck, test, clippy, and Rust tests must pass; the release workflow runs all of them before building.
- Commit messages: short imperative subject describing the change.
