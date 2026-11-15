A password on a PDF encrypts it. Without the password, the file is noise.

## Set a password

**File > Set Password**. Type it twice and press Set. Then save: the password takes effect when the file is written.

From then on, anyone opening the file needs the password, in Clumsy or anywhere else. Clumsy encrypts with AES-256.

> There's no recovery. If you forget the password, nobody can get the document back, including us. Keep it in a password manager.

A protected document's tab shows a lock on its icon.

## Change or remove it

With a protected document open:

- **File > Set Password** becomes **Change Password**. You don't need to type the old one again, since you already proved you know it by opening the file.
- **File > Remove Password** saves the document without encryption.

Both take effect on the next save, and both can be undone with [[⌘Z]] until then.

## Opening protected files

Clumsy asks for the password once when you open the file. After that you can edit, rearrange pages, reload, and undo without being asked again, and the file stays protected with the same password every time you save.

{{mac: Tabs with unsaved changes come back after an update restart, but a protected one will ask for its password again.}} Clumsy never writes a password to disk.

## Files that restrict printing or copying

Some PDFs open without a password but are marked "no printing" or "no copying". Those restrictions are a request to the app, not encryption, and Clumsy doesn't enforce them. If you can read it, you can print it and copy from it.

## Passwords and signatures

Setting or removing a password rewrites the whole file, which invalidates any digital signature in it. Clumsy asks before doing that to a signed document. It also won't add a digital signature to an encrypted file: remove the password, sign, and then decide whether it needs one.
