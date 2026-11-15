A digital signature is math, not ink. It ties a document to a certificate, and anyone can check two things from it: who signed, and whether a single byte has changed since.

::: win
> Digital signatures are Mac-only for now. On Windows, Clumsy doesn't check or create signatures yet. The rest of this page describes the Mac version.
:::

## Checking a signed PDF

Open a signed PDF and a bar across the top says who signed it and whether the signature holds. You don't have to do anything.

The sidebar gains a **Signatures** tab that lists every signature in the file. **Details** on any of them shows:

- **Signer**, and who issued their certificate.
- **Signed**: when, and whether a timestamp from a trusted clock proves that time or it's only what the signer's computer claimed.
- **Document**: unchanged since signing, or altered.
- **Later changes**: whether anything was added after this signature.
- **Revocation**: whether the certificate was cancelled.
- **Allows**: for a certified document, what the author permits.
- The full certificate chain.

### Changes after signing

Signed PDFs often get more added later: a second signature, a timestamp, a filled-in field. Clumsy tells those apart from real changes. More signatures and validation data don't raise a flag. Edited content does.

**View Signed Version** opens the document exactly as it was when that person signed it, so you can see what they actually agreed to.

### Signers your Mac doesn't know

A signature from a self-signed certificate, or from an organization your Mac has never heard of, reads as unverified. That isn't the same as invalid. If you know the signer is who they say, **Trust Signer** accepts them. That trust applies inside Clumsy only and changes nothing else on your Mac.

## Signing

You need a signing certificate. Clumsy uses one you already have: in your Keychain, on a smart card, or on a security key. It doesn't issue certificates and there's no signing service to subscribe to.

Tools > Sign Digitally opens a sheet with:

- **Certificate**: which identity to sign with.
- **Place**: an empty signature field if the document has one, the lower right of the current page, a box you draw yourself, or invisible, with nothing drawn on the page.
- **Appearance**: one of your [saved signatures](/guides/signatures), or just your name.
- **Reason** and **Location**, both optional.

Then your Mac asks you to confirm, every time. The private key never leaves the Keychain or the card. Clumsy hands over a fingerprint of the document and gets a signature back.

### Built to keep verifying

Each signature is timestamped and carries its own revocation data, a level called PAdES B-LT. In practice: years from now, after your certificate has expired, the signature still checks out, because the proof that it was valid on the day is inside the file.

Under **Advanced** you can point at a different timestamp server. Only a fingerprint of the signature is sent to it, never the document.

## Certifying

Tools > Certify Document signs as the document's author and sets what others may do afterward:

- No changes at all.
- Filling in forms and signing.
- Filling in forms, signing, and comments.

Anything beyond what you allowed shows up as a problem for the next reader.

## Keeping old signatures alive

- **Add Validation Data** fetches revocation data for signatures already in the file and stores it inside, so they can be checked offline and after their certificates expire.
- **Seal with Timestamp** covers the whole file with a fresh timestamp. For documents that have to stay verifiable for a long time, do this before the existing proof ages out.

## What breaks a signature

Anything that rewrites the document: rearranging or deleting pages, flattening a form, compressing, setting or removing a password. Clumsy asks before doing any of those to a signed file.

Highlights, comments, and form answers are saved as additions on top of the signed content. The signature stays intact, and the next reader sees that something was added after it.
