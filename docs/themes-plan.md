# Themes plan

Written 2026-11-23. Phases 0 and 1 shipped in v0.26.0.

How it came out: the picker is a palette button on the toolbar, with View > Theme and the Command Palette as the keyboard routes. Match System uses Clumsy Light and, in dark mode, Ember. The backdrop is flat (`--bg-bottom`), rendered Markdown keeps its own neutral palettes, and About follows the theme. Not done: the mobile status and navigation bars, and the byte-identical export test, which became a test that document colors never reference a theme slot.

## What this is

Color themes for Clumsy's chrome, ported from Metrom. Six presets, a picker, and the `styles.css` split that has to happen first.

Decided already:

- Colors only. No textures, wordmark, custom window chrome, or decorative UI.
- The document page never changes. A white page stays white in every theme.
- Reuse Metrom's themes instead of designing new ones.

Source of truth for the colors: `shared/src/commonMain/kotlin/com/metrom/shared/theme/ColorTheme.kt` in `ry4nolson/metrom`. The values below were copied from that file on 2026-11-23, with the `stage()` and `paper()` defaults already filled in.

## The six themes

Three dark, three light. Metrom calls a theme light when the luminance of `ink` is 0.55 or higher.

| slot | Ember | Ice | Forest | Paper | Snow | Bloom |
|---|---|---|---|---|---|---|
| base | dark | dark | dark | light | light | light |
| ink | 100C0A | 070B12 | 070C09 | F6F1E8 | F3F7FA | FAF3F4 |
| inkElevated | 1C1612 | 101820 | 101814 | FFFBF4 | FFFFFF | FFFCFC |
| inkLine | 3A2C26 | 243848 | 244030 | E2D6C4 | D0DCE6 | E8D4D8 |
| ash | 8B827A | 7A8A96 | 7A8B80 | 736C62 | 66717A | 7A686C |
| mist | D0C8C0 | C0D0DC | C4D4C8 | 4A433C | 3E4A54 | 4A383C |
| bone | F4EFE8 | ECF2F6 | ECF4EE | 1C1814 | 141A20 | 1C1214 |
| ember | FF6A3D | 3DB8FF | 3DDB8A | E04520 | 1A7CC7 | C41E4A |
| emberSoft | FF8F66 | 6CC8FF | 6AE8A8 | C43818 | 1568A8 | A81840 |
| emberDeep | E04520 | 1A7CC7 | 1FA05C | B83214 | 0E4F86 | 8C1436 |
| copper | D4A574 | 7EB3C9 | A8C47A | A56B3C | 4A7A90 | A06070 |
| pulse | FFC857 | 9D8CFF | C4F07A | C48A12 | 5B3FB0 | 9B3FC4 |
| backgroundTop | 1A1210 | 0C141C | 0C1610 | FBF6EE | F7FAFC | FDF7F8 |
| backgroundBottom | 0A0706 | 05080C | 050806 | EDE4D4 | E6EEF4 | F0E4E6 |

## What each slot does in Clumsy

Keep Metrom's slot names as the CSS variable names so the port stays one to one and a theme can move between the two apps as the same 13 values.

| variable | Metrom's label | Clumsy use |
|---|---|---|
| `--ink` | Background | window background, tab bar |
| `--ink-elevated` | Surface | toolbar, sidebar, sheets, dropdowns, palette, find bar |
| `--ink-line` | Line | dividers and hairline borders |
| `--bone` | Text | primary text and icons |
| `--mist` | Soft text | secondary text, inactive tab titles |
| `--ash` | Muted | placeholders, disabled items, counts, captions |
| `--ember` | Accent | active tool, selected thumbnail, focus ring, links, primary button, Document Map viewport |
| `--ember-soft` | Accent soft | hover on accent things |
| `--ember-deep` | Accent deep | pressed, and filled buttons on light themes |
| `--copper` | Copper | secondary accent: badges, the lock icon, Tool Chest group headers |
| `--pulse` | Pulse | attention: the unsaved dot, update available |
| `--bg-top`, `--bg-bottom` | Glow top, Glow bottom | the area behind the pages |

`--bg-top` and `--bg-bottom` are a gradient in Metrom. In Clumsy, start with `--bg-bottom` flat behind the pages and leave the gradient out unless it looks good in practice.

## Things that don't theme

These carry meaning or belong to the document, so they keep fixed colors in every theme:

- The page canvas, thumbnails' page images, and the Document Map's page images.
- Markup: highlight colors, shape strokes and fills, stamps, measurement captions, signatures.
- Compare: added, removed, and changed colors, in the document, the Changes list, and the map marks.
- Find match colors on the page.
- Signature status (valid, problem, unknown) and the form-field highlight.
- Rendered Markdown content can follow the theme's base (light or dark) but keeps its own readable palette. Syntax colors in the CodeMirror source view need a light set and a dark set, not thirteen-slot theming.

Each fixed color still has to be readable on all six `--ink-elevated` surfaces. Check the Changes list and the signature bar in particular.

## Contrast, measured

WCAG ratios computed from the table above.

| theme | text on bg | muted on bg | muted on surface | accent on bg | accent on surface | line on bg | `ink` on accent | `bone` on accent |
|---|---|---|---|---|---|---|---|---|
| Ember | 17.0 | 5.2 | 4.8 | 6.8 | 6.3 | 1.5 | 6.8 | 2.5 |
| Ice | 17.5 | 5.5 | 5.0 | 8.9 | 8.1 | 1.6 | 8.9 | 2.0 |
| Forest | 17.6 | 5.5 | 5.0 | 11.0 | 10.1 | 1.7 | 11.0 | 1.6 |
| Paper | 15.7 | 4.6 | 5.0 | 3.7 | 4.0 | 1.3 | 3.7 | 4.2 |
| Snow | 16.3 | 4.6 | 5.0 | 4.1 | 4.4 | 1.3 | 4.1 | 4.0 |
| Bloom | 16.7 | 4.8 | 5.1 | 5.3 | 5.7 | 1.3 | 5.3 | 3.2 |

What that means:

- Text and muted text pass 4.5 everywhere. Good as is.
- Text on a filled accent button should be `--ink`, not `--bone`. On the dark themes that's dark text on a bright button (6.8 to 11.0).
- On Paper and Snow, `--ember` is under 4.5 against the background (3.7 and 4.1). Fine for icons and selection fills, too weak for small accent-colored text or filled buttons with text. Use `--ember-deep` for those on light themes.
- `--ink-line` is 1.3 to 1.7 against the background. That's a divider, not an outline. Text inputs and focus rings need something stronger (`--ash` for input borders, `--ember` for focus).

## Phases

### Phase 0: split `styles.css` and tokenize

No visible change. This is the cleanup the roadmap already owed.

1. Audit every color in `styles.css` (2,476 lines) and any inline styles or colors set from TypeScript. List what variables exist today and how light and dark mode are switched now.
2. Split the file by area (shell, toolbar, sidebar, tabs, sheets, find, compare, markup tools, markdown), each under the 500-line rule.
3. Replace every chrome color with one of the 13 variables. Colors on the "don't theme" list get their own named variables in one file so they're easy to find.
4. Express today's light and dark looks as two themes, `clumsy-light` and `clumsy-dark`, using the same 13 slots. Screenshots before and after should match.

Also check pdf.js's own viewer CSS: it has its own variables for the toolbar-less viewer, annotation editors, and the text layer. Anything of pdf.js's that shows in Clumsy's chrome needs mapping onto the tokens. The pdf.js version is pinned, so this is a one-time job, and worth a line in `docs/pdfjs-upgrade.md`.

### Phase 1: the picker and the six presets

1. Themes live in one TypeScript module as data (id, label, base, 13 hex values), applied by setting the variables on the root element.
2. Theme list: Match System (default, uses `clumsy-light` or `clumsy-dark`), Clumsy Light, Clumsy Dark, then Ember, Ice, Forest, Paper, Snow, Bloom. Existing users see no change until they pick one.
3. Picker in settings, plus "Theme: …" entries in the Command Palette, with a live preview as you arrow through them.
4. Set `color-scheme` from the theme's base so scrollbars, form controls, and native text inputs follow.
5. Tell the native side the base (light or dark) so the title bar and the Rust-built right-click and tab menus match. Those can't take arbitrary colors, which is why every theme declares a base. Check this on macOS, Windows, and Linux separately; the title bar work in `title_bar.rs` is Mac-specific.
6. The choice is app-wide, shared by every window, applied before first paint so there's no flash of the wrong theme, and restored with restart sessions.
7. Mobile builds get the same themes. The status bar and navigation bar follow the base.

Printing and Export Pages as Images must be unaffected. Add a test that exported output is byte-identical across themes.

### Phase 2, optional: custom and saved themes

Metrom already has this: edit any of the 13 slots, save under a name (18 characters max), and delete saved themes. Its encoding is 15 pipe-separated fields: id, label, then the 13 hex values in the order ink, inkElevated, inkLine, ash, mist, bone, ember, emberSoft, emberDeep, copper, pulse, backgroundTop, backgroundBottom.

If Clumsy uses the same encoding, a theme string copies between the two apps. Only build this if the presets turn out not to be enough.

## Open questions

- Default for new installs: Match System, or one of the six?
- Does the backdrop behind pages use the gradient or stay flat?
- Do the website and the About sheet follow the theme, or keep the brand colors?
- Should the Markdown rendered view tint toward the theme (Paper's warm off-white) or stay neutral?

## Done when

- `styles.css` is split, no file over 500 lines, and no chrome color is hard-coded.
- All nine choices work on macOS, Windows, Linux, Android, and iOS, with native menus matching the base.
- Pages, markup, compare, find, and signature colors look identical in every theme.
- No flash on launch, and the theme survives restart and update.
