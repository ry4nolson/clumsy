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
pnpm licenses                  # regenerate public/third-party-licenses.txt (also runs as part of pnpm build)
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
    AboutDialog.tsx, ChangelogList.tsx, LicensesView.tsx, ShortcutsDialog.tsx, DefaultAppDialog.tsx, SignatureDialog.tsx, ...
  hooks/usePdfViewer.ts      wraps pdf.js PDFViewer, EventBus, find controller, editor modes
  lib/                       pure logic (commands, tabs, changelog, recent, imageRegions, defaultApp) + platform.ts, menu.ts
src-tauri/src/
  lib.rs                     IPC commands and macOS file-open events
  recent.rs                  recent files list, persisted to app data
  default_app.rs             Launch Services: read/set the default PDF handler
scripts/
  next-version.sh            computes the next release version
  stamp-changelog.mjs        moves [Unreleased] under a release heading
  create-dmg.sh              headless DMG (no Finder/AppleScript styling, CI-safe)
  third-party-licenses.mjs   generates public/third-party-licenses.txt (gitignored) for the About > Licenses tab
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
- **Commands, shortcuts, and menus.** `src/lib/commands.ts` is the single source of truth: every command's id, label, menu, and key combos. The same table builds the native menu bar (`src/lib/menu.ts`, via Tauri's JS menu API, so the menu shows each shortcut), resolves keyboard shortcuts in `App.tsx`, and renders the Keyboard Shortcuts sheet (⌘/). Every path ends in `runCommand(id)` in `App.tsx`. To add a command: add it to the table, place it in `menuLayout` if it belongs in a menu (the tests check every menu command is placed exactly once and no combo is used twice), and handle it in `runCommand`. Combos use physical keys (`event.code`), so ⌥ shortcuts work even though Option changes the typed character. Plain-letter combos (`h`, `n`, `Home`) are ignored while typing and never become menu accelerators, because a native accelerator swallows the key everywhere, including text fields. Native menu accelerators win over the webview's keydown, which is why Undo/Redo are custom items that route to the focused text field or to pdf.js's `editingaction` event; the predefined Undo would never reach pdf.js. Document commands set `needsDocument` and are disabled in the menu when the active tab has no PDF. The Rust side no longer builds menus.
- **Title bar.** The window uses `titleBarStyle: Overlay` with `hiddenTitle`; the toolbar pads left for the traffic lights (except in fullscreen) and toolbar groups carry `data-tauri-drag-region`.
- **Third-party licenses.** `pnpm build` (and so every release) runs `scripts/third-party-licenses.mjs`, which collects license texts for the npm packages the UI bundles (production `dependencies`, walked transitively) and the Rust crates compiled into the binary (`cargo metadata`, normal dependencies only). For "A OR B" licenses it uses MIT when offered. Crates that ship without a license file get the shared Apache/MPL text or an MIT/BSD template with the crate's authors. Identical texts are listed once. The About window shows the result under Licenses. New dependencies are picked up automatically; check the "without a bundled license file" section of the output if a new license type appears.
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
