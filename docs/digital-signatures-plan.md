# Digital signatures plan

Written 2026-11-11 against `code-review-fixes` (v0.14.0 plus unreleased work). Nothing here is built yet. It covers two things people mean by "real" signatures: **validating** signatures already in a PDF, and **signing** with a certificate so other readers can check who signed and that nothing changed since.

## Where things stand

Clumsy's signatures today are pdf.js `SignatureEditor` ink: a drawing on the page. Under ESIGN/UETA and eIDAS that's a simple electronic signature, but nothing in the file ties it to a person or detects tampering. Anyone can move or delete it.

There's also a quiet problem with signed files people already have: **any full rewrite destroys existing digital signatures without a word.** A signature covers exact byte ranges. Saves that only append (pdf.js's `saveDocument()`, and `writeAnnotations`'s `forIncrementalUpdate` path) keep them valid. These rewrite the whole file and break them:

- every page edit (`collectGarbage` + full save in `pageEdits.ts`), including Flatten Form, which also drops signature fields on purpose (`pdfForm.ts:131`)
- Set/Change/Remove Password (`encryptPdf`, and the decrypting `protect` edit)
- sticky notes or markup on an encrypted file, or on one whose `startxref` is bad (`notesPdf.ts`'s full-rewrite fallback)

So phase 0 is worth doing even if nothing else ships.

## Background in brief

- A PDF digital signature is a `/Sig` dictionary whose `/ByteRange` names every byte of the file except its own `/Contents`, and whose `/Contents` holds a detached CMS `SignedData` over the SHA-256 of those bytes, signed with the signer's private key, with their certificate chain inside.
- **PAdES** (ETSI EN 319 142) is the profile everyone validates against. Levels: **B-B** (signature + certificate), **B-T** (adds an RFC 3161 timestamp from a timestamp authority, proving *when*), **B-LT** (adds revocation data in a `/DSS` dictionary so it validates after the certificate expires), **B-LTA** (adds a document timestamp over all of it). B-B is the minimum; B-T is what most people need.
- **Identity** comes entirely from the certificate. The math only proves "whoever holds this key signed these bytes." A reader trusts the name in the certificate because a CA it trusts vouched for it. That's the hard part, and it isn't a code problem.

## Identity: bring your own certificate

Decided: **people who need a certificate-backed signature already have a certificate.** Clumsy doesn't issue, sell, or vouch for identities, and doesn't create self-signed ones. It signs with whatever identity the user already has in the macOS Keychain:

- a software certificate imported from their CA or company (`.p12`)
- a smart card, PIV, or CAC (through CryptoTokenKit, with its own PIN prompt)
- a hardware token such as a YubiKey holding a document-signing certificate (this is how AATL certificates from SSL.com, IdenTrust, GlobalSign, or DigiCert are delivered, since AATL requires the key on FIPS 140-2 Level 2+ hardware)

With no usable identity, Sign Digitally explains in a single sentence what's needed ("Digital signatures use a certificate from your organization or a certificate authority. Add one to Keychain Access or connect your security key.") and offers nothing else. Validation uses the trust the system already has.

**Defaults are "as secure as reasonable":** the strongest signature that works without the user knowing what PAdES is. Every security choice is on by default, and anything that weakens a signature is a visible, deliberate step.

## Phase 0: protect signatures that already exist

Small and shippable on its own.

- `signatureInfo(bytes)` in the page-edit worker: finds `/Sig` fields (AcroForm `/Fields`, `/FT /Sig` with a `/V`), reads `/ByteRange`, and reports how many signatures there are and whether the last one covers the file up to a revision's `%%EOF`. Pure and tested in `src/lib/pdfSignatures.ts`.
- The tab snapshot gets `signatureCount`. Before any edit that would rewrite the file (page edits, Flatten Form, password commands, the notes/markup rewrite fallback), ask once per tab with a native alert: "This document has 2 digital signatures. Changing its pages removes them." **Continue** / **Cancel**.
- Incremental saves (markup, form values) stay allowed. A validator will correctly report "changed after signing," which is true and expected.
- Tab tooltip: "Digitally signed."

## Phase 1: validate signatures in opened PDFs

- **Parse (worker, TS):** for each signature, return the `/ByteRange`, the `/Contents` DER, `/M`, `/Reason`, `/Location`, `/Name`, the field's page and rect, and which revision it ends at. Check the byte range is sane: starts at 0, the gap is exactly the `/Contents` hex string, it ends at a revision boundary, and how many bytes and revisions come after it. Hash the covered ranges (SHA-256/384/512 as the CMS names).
- **Verify (Rust, new `signatures.rs`):** parse the CMS (`SignedData`, one `SignerInfo`). Check `messageDigest` matches the hash, check the signature over the signed attributes with the signer certificate's public key, and evaluate the chain with `SecTrust` (`SecPolicyCreateBasicX509` plus revocation). Revocation is checked by default: first against the file's own `/DSS` data, then online OCSP/CRL with a short timeout; unreachable means "revocation unknown," shown as such, not as valid. The chain is judged at the timestamp's time if there's a valid RFC 3161 token, otherwise at the current time. SHA-1 signatures or RSA keys under 2048 bits read as `weak`, not `valid`. Return a verdict per signature: `valid`, `invalid` (digest or signature mismatch), `unverified` (chain doesn't reach a trusted root), `expired` or `revoked`, and `modifiedAfter` (true when later revisions exist). Rust gets bytes and ranges, never paths, so no new file access.
- **UI:** a Signatures sidebar tab (like Comments and Changes) listing each signature: signer common name and email, issuer, signing time (marked *claimed* without a timestamp), status icon, and "Document changed after this signature" when true. Clicking a signature scrolls to its field. A one-line bar at the top of a signed tab: "Signed by Ryan Olson. The signature is valid." Details opens the certificate chain (the native `SFCertificatePanel`, macOS only, so it goes behind `platform.ts`).
- **View Signed Version:** opens the bytes up to that signature's revision as a new unsaved tab. This is nearly free with tabs that already accept raw bytes, and it's the honest answer to "what did they actually sign?"
- **Trust store:** macOS system roots plus anything the user trusts in Keychain Access. The AATL is distributed by Adobe under its own terms and isn't in macOS, so many public document-signing certificates will read as `unverified`. Phase 4 may add the EU trusted lists (public XML) as optional anchors. Clumsy doesn't change system trust settings. "Trust this signer" would be a Clumsy-only list of certificate fingerprints (`clumsy.trustedSigners`), clearly labeled.

## Phase 2: sign with a Keychain identity (PAdES B-LT by default)

**Flow.** Tools > Sign Digitally… (or a Digitally Sign item in the Sign dropdown):

1. Pick or draw where the signature goes, using the existing `SignatureEditor` placement or an empty signature field. A visible appearance draws the ink outline plus "Digitally signed by Ryan Olson, 2026-11-11." An invisible signature is also allowed.
2. A sheet lists signing identities from the Keychain (`SecItemCopyMatching` for identities that pass the certificate checks below), with each one's issuer and expiry, plus optional Reason and Location. The last identity used is preselected (`clumsy.signingIdentity`, its certificate's SHA-256 fingerprint, never the key).
3. **Signing writes the file.** A signature has to be the last thing in the file, so Sign Digitally saves: to the tab's path if it's writable, otherwise through Save As. Unsaved edits are baked in first (`viewer.save()`, `settled(tabId)`).

**Preparing (worker, TS):** append an incremental update to the saved bytes with the signature widget and field, `/AcroForm /SigFlags 3`, and a `/Sig` dictionary: `/Filter /Adobe.PPKLite`, `/SubFilter /ETSI.CAdES.detached`, `/M`, `/Reason`, `/Location`, a fixed-width `/ByteRange [0 ********** ********** **********]` placeholder, and `/Contents <000…>` reserving 32 KiB. pdf-lib can't write fixed-width placeholders, so the dictionary is written as raw bytes into the update, the same way `notesPdf.ts` already writes `/Annots` by hand.

**Signing (Rust), and the trust boundary.** The webview must never be able to get an arbitrary digest signed with the user's key, or a compromised page could sign a different document. So Rust:

- takes the prepared bytes and the destination path (which must already be allowed, like `write_pdf`), finds the placeholder itself, fills in `/ByteRange`, and computes the digest itself;
- shows its own confirmation, like `confirm_replace`: "Sign “Contract.pdf” as Ryan Olson (SSL.com)?" (Smart cards and tokens also ask for their PIN through macOS);
- builds the CMS with signed attributes `contentType`, `messageDigest`, and `signingCertificateV2` (required by PAdES; there's no `signingTime` attribute, since PAdES uses `/M`), and signs through `SecKeyCreateSignature`, so the private key never leaves the Keychain, the token, or the Secure Enclave;
- puts the DER in `/Contents`, writes atomically with the usual stamp check, and returns the new stamp. The tab reloads from the written bytes.

**Secure defaults.** Each of these is on with no setting needed:

- **Timestamp (B-T).** After signing, the signature value's hash goes to an RFC 3161 timestamp authority and the token is added as an unsigned attribute, so the signing time is proven, not claimed. Only a hash leaves the machine. Default server: DigiCert (`http://timestamp.digicert.com`, the token itself is signed and verified, so plain HTTP is normal for TSAs), with Sectigo as fallback. Users can change it in a setting.
- **Long-term validation (B-LT).** At signing time, Clumsy fetches OCSP responses (or CRLs) for the signer's chain and the timestamp authority's, and appends a `/DSS` dictionary with them and the certificates in a second incremental update, so the signature still validates after the certificate expires or the CA's responders go away.
- **Certificate checks before signing.** Refuse certificates that are expired or not yet valid, lack `digitalSignature` or `nonRepudiation` key usage, have an extended key usage that excludes document signing, use RSA under 2048 bits, or are revoked per a live OCSP/CRL check (an unreachable responder is a warning, not a refusal). A chain that doesn't reach a trusted root is allowed with a warning ("Readers may not be able to verify this certificate"), since company CAs are often trusted only on company machines.
- **Algorithms.** SHA-256 for RSA and P-256 keys, SHA-384 for P-384, SHA-512 for P-521; RSA signs with PKCS#1 v1.5 for compatibility (PSS is valid PAdES but older readers reject it). No SHA-1 anywhere.
- **Lock what was signed.** A visible signature in a form field adds a `/Lock` (FieldMDP) for that field, so its own appearance can't be swapped later. The document itself stays open to further form fill, comments, and more signatures, which is the normal approval-signature behavior.
- **Offline.** If the timestamp server or a revocation responder can't be reached, the sheet says so and offers **Sign Without Timestamp** (B-B), never silently downgrading. Revocation data can be added later (phase 3); a timestamp added later only proves the signature existed by then.

**Libraries to spike before committing:** `security-framework` (identities, `SecKey` signing, `SecTrust`) plus either `cryptographic-message-syntax` and `x509-certificate` (written for `apple-codesign`, which already signs through external keys and has an RFC 3161 client) or RustCrypto's `cms`, `x509-cert`, and `x509-tsp`. The spike succeeds if a B-LT signature (timestamp and `/DSS` included) from a Keychain identity and from a YubiKey PIV slot validates in Adobe's free reader and in pyHanko as PAdES B-LT, and if changing one signed byte turns it invalid. pyHanko (local, open source) is the reference validator for tests. Don't upload real documents to online validators.

**After signing,** the phase 0 rules apply: rewrites warn, incremental markup stays allowed.

## Phase 3: keeping signatures valid over time (B-LTA)

- **Add Validation Data:** for a signature that was made offline, or by another app at B-B or B-T, fetch what's missing (a timestamp can't be added afterwards to prove an earlier time, but revocation data can) and append it in a `/DSS` update.
- **Document timestamps (B-LTA):** an optional "Seal with timestamp" adds a `/DocTimeStamp` over the whole file, including the `/DSS`, so the evidence itself is protected as algorithms age. Keeping it valid means adding a fresh document timestamp before the last one's certificate expires, which Clumsy can offer when it opens such a file. Opt-in, since it's only needed for documents kept for many years.

## Phase 4 and later

- **Certifying signatures** (`/DocMDP`: no changes, form fill only, or form fill and comments), and phase 1 judging whether later revisions stayed within what the certifier allowed, instead of only reporting "changed after."
- Signing empty signature fields other people prepared, and signing a document someone else already signed (multiple signers; each is just another incremental update).
- **Encrypted files.** Signing needs an incremental update encrypted with the file's key, and pdf-lib can't write that (`encryptPdf` always rewrites). v1 refuses: "Password-protected PDFs can't be signed digitally yet." (Removing the password, signing, and setting it again doesn't work around it: setting a password rewrites the file and breaks the signature.) The real fix is a raw incremental writer that encrypts its strings and streams.
- Windows: CNG and the certificate store behind the same `platform.ts` functions and `cfg(target_os)` commands.

## Decided

- **Identity:** bring your own certificate. No self-signed IDs, no CA, no cloud signing service in scope.
- **Defaults:** as secure as reasonable. B-LT (timestamp plus revocation data) by default, strict certificate checks, revocation checked when validating, and an explicit choice before anything weaker.

## Still open

- **Order.** Recommended 0 → 1 → 2 → 3: phases 0 and 1 are lower risk, help with every signed PDF people already receive, and build the parser signing needs anyway.
