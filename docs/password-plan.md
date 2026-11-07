# Password plan

Written 2026-11-06 against `main` at v0.12.0. Roadmap item 1: password protect and remove password. Also fixes two known gaps: page edits refuse password-protected PDFs, and sticky notes are read-only in them.

## What was checked first

A spike ran in the container against the pinned `@cantoo/pdf-lib` 2.11.1 and `pdfjs-dist` 6.4.299:

- pdf-lib's `encrypt()` writes AES-256 by default. pdf.js refuses the result without the password and opens it with it, text intact, including `(`, `)`, and `\`.
- pdf.js can `saveDocument()` an encrypted file (an incremental update, still encrypted), and pdf-lib loads that result with the password.
- `decryptPdf` (print's worker job) output reloads in pdf-lib as unencrypted, page edits run on it, and it re-encrypts with a new password that reopens. Owner-only files decrypt with `''`.
- One trap: a plain pdf-lib `save()` after decrypting keeps the old cross-reference stream as an ordinary object, and that object still says `/Encrypt`. pdf-lib then reads the output as encrypted on the next load. The repo's `save()` runs `collectGarbage` first, which drops it, so the real path is fine. A test should pin that down so nobody "simplifies" the save.

## The model: tabs hold plain bytes, Save applies the password

Each PDF source gets an optional `protection: { password: string }`: the open password Clumsy writes with. Everything else follows from one rule: **once Clumsy has rewritten a protected document, the tab works on plain bytes in memory, and Save encrypts them on the way to disk.**

- **Opening a protected file.** After the password prompt, the source gets `protection` with the typed password. Nothing else changes: pdf.js holds the encrypted file, and a Save with only markup and form values is still pdf.js's incremental update, encrypted exactly as before.
- **Owner-only files** (restrictions, no open password) get no `protection`. They open without a prompt, as today.
- **Reopening a source** (undo, a failed edit restoring the previous version, a reload after a page edit) tries `source.protection.password` first, so it never asks again for a password Clumsy already has. `loadPdf`'s `requestPassword` answers with the known password on the first call and only falls through to the sheet if that's wrong.
- **Save.** If the tab has `protection` and the outgoing bytes aren't encrypted (`hasEncryptEntry`, a check of the last trailer or cross-reference stream for `/Encrypt`), the worker encrypts them: load, `collectGarbage`, `encrypt({ userPassword, ownerPassword })` with the same password for both, full rewrite. Save As does the same. An encrypted save is always a full rewrite, which is fine.

## Commands

Two new File menu commands, next to Print:

- **Set Password…** opens a sheet: New Password, Confirm, a show-characters toggle, and one line: "Anyone opening this PDF will need this password. It can't be recovered if it's lost." Set is disabled until both fields match and aren't empty. On a protected tab the same sheet is titled Change Password. It doesn't ask for the current password, since the tab already has it open.
- **Remove Password**, enabled only on a protected tab (`needsProtection`, like `needsForm`).

Both are page edits (`{ kind: "protect", password: string | null }`), so they're queued, undoable, mark the tab edited, and go through the worker like the rest. The edit takes `viewer.save()`'s bytes, decrypts them if they're encrypted (with the current password, or `''` for owner-only files), and returns plain bytes with the new `protection` (or none). Nothing touches the disk until Save.

A small lock glyph on the tab and "Password protected" in its tooltip show which tabs will be written encrypted.

## What else changes

- **Page edits on protected files.** `load` takes the source's password (or `''`) instead of throwing `PageEditError`. The output is plain and the tab keeps its `protection`, so Save re-encrypts. "Pages in password-protected PDFs can't be changed yet" goes away.
- **Sticky notes on protected files.** When the bytes pdf.js saved are encrypted and there are note changes, `writeStickyNotes` decrypts first (same password), then writes the notes as a full rewrite, and Save re-encrypts. Notes stop being read-only; `readOnly` in `stickyNotes.ts` goes.
- **Print** keeps working as is. Plain sources skip the decrypt step, and encrypted ones still decrypt with the password.
- **Moving a tab between windows** carries `protection` with the transfer, in memory only, so the other window doesn't ask for the password.
- **Restart sessions** write a protected tab's bytes encrypted and never write its password. After the restart that tab asks for its password once. The restart folder is on disk, and neither plaintext of a protected document nor its password belongs there.
- **Outside changes** reload as today. If the file's password changed underneath, the known one fails and the prompt appears.

## As built

The implementation differs from this plan in a few places; AGENTS.md (Passwords) describes what shipped.

- `protection` lives on the tab (`DocTab.protection`), not on `PdfSource`: learning the password after the prompt would otherwise replace the source and reload the viewer. Page-edit versions carry it, so undo and redo restore it.
- The code is in `src/lib/protection.ts` (`hasEncryptEntry`, `bytesForDisk`, no pdf-lib), `src/lib/pdfDecrypt.ts` (`loadDecrypting`, `passwordRole`, `encryptUncompressedStrings`), `encryptPdf` in `pageEdits.ts`, and `src/lib/passwordAnswers.ts` (known passwords before the prompt, used by `DocumentTab`), not `pdfProtection.ts` and `pdfjs.ts`.
- Set and Remove Password on bytes that are already plain only change the tab's protection, without reloading the viewer.
- A file opened with its owner password is detected in the background, and the first save that would write fresh encryption asks first, since it would otherwise lock out everyone who only has the user password.
- Sticky notes are written in the page-edit worker.
- pdf-lib loses `/Info` when decrypting files with cross-reference streams and never encrypts strings; both are worked around (see AGENTS.md).

## Code (as planned)

- `src/lib/pdfProtection.ts` (new, pure where it can be): `hasEncryptEntry(bytes)`, `encryptPdf(bytes, password)` and the `protect` edit, reusing `decryptPdf`, `load`, and `save` from `pageEdits.ts`. Loaded with pdf-lib, through the worker.
- `pageEditPlan.ts`: the `protect` edit kind. `pageEdits.ts`: `load` gets the password, and `answerPageEditJob` gets `encrypt`.
- `platform.ts`: `protection` on `PdfSource`.
- `DocumentTab.tsx` / `pdfjs.ts`: known password first in `requestPassword`.
- `useSaveDocument.ts`: the encrypt step before `write_pdf`.
- `notesPdf.ts`, `stickyNotes.ts`: decrypt-then-write, drop `readOnly`.
- `useTabTransfer.ts`, `useRestartSession.ts`: carry `protection` in memory for moves; encrypt and drop it for restart sessions.
- New sheet `PasswordSetDialog.tsx`, styled like the other sheets. `commands.ts` / `menu.ts`: the two commands and `needsProtection`. Tab strip: the lock.

## Tests (Linux container)

- Protect: a plain fixture goes through `protect`, then Save's encrypt step. pdf.js refuses it without the password and opens it with it; text, form values, page labels, and annotations are intact.
- Remove: an encrypted fixture comes out with no `/Encrypt`, and pdf-lib reloads it as unencrypted. This pins the stale cross-reference stream trap.
- Change: old password fails, new one opens.
- Page edits on a user-password file and an owner-only file both succeed; output is plain; the user-password tab keeps `protection`.
- pdf.js's incremental save of an encrypted file loads in pdf-lib with the password.
- Sticky notes written into an encrypted file survive encrypt → decrypt.
- `hasEncryptEntry` on plain, encrypted, and incrementally updated files, both with classic trailers and cross-reference streams.
- Strings with `(`, `)`, `\`, and non-ASCII bytes survive decrypt → encrypt → decrypt (with `installDecryptedStrings` in play).
- Restart session entry for a protected unsaved tab: the bytes are encrypted and the JSON has no password.
- `documentMenu` / menu tests: Remove Password only enabled with `protection`.

## Mac checklist (for the PR)

- Set a password, Save, close, reopen in Clumsy: it asks. The file also opens with the password in Preview and a browser, and not without it.
- Change and remove a password; Save; reopen each.
- Undo Set Password: the tab is plain again, no prompt. Redo: protected again, no prompt.
- Rotate or delete a page in a protected file, Save, reopen: it asks for the same password.
- Add a sticky note to a protected file, Save, reopen: the note is there.
- Move a protected tab to another window: no prompt. Restart Now with an unsaved protected tab: it asks once after the restart, and the unsaved changes are there.
- Print a protected file at full quality.
- An owner-only "no printing, no copying" file: rotate a page and Save. The result opens anywhere with no restrictions. A markup-only Save of the same file keeps its restrictions.

## Decisions for Ryan

1. **Open password only, no restriction options.** The sheet sets a password to open the file, and nothing about printing, copying, or editing. Clumsy ignores those flags in other files, so offering to set them would be selling the same trick. Lean: yes.
2. **Restart sessions ask for protected tabs' passwords again** instead of writing passwords (or the plain document) to disk. Lean: yes.
3. **Owner-only files lose their restrictions when Clumsy rewrites them** (page edits, sticky notes, Set Password), and keep them on a markup-only save. It follows from ignoring permissions, but it does change the file for other readers. Lean: yes.
4. **Lock on the tab.** Lean: yes, it's small, and it's how you'd know a Save will write an encrypted file.

## Done when

Merged with all four checks and the Mac checklist passed. AGENTS.md updates Page edits, Sticky notes, Saving, and Restart sessions, and gets a Passwords section. The two known gaps come off the roadmap. CHANGELOG has the entry under Unreleased as Added.
