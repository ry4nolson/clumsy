const CHECKING = [
  "Open a signed PDF and a bar says who signed it and whether the signature holds.",
  "Details shows the certificate, when it was signed and whether a timestamp proves it, and whether the certificate was revoked.",
  "Changes made after signing are flagged. Added signatures and timestamps aren't.",
  "View Signed Version opens exactly what the signer signed.",
];

const SIGNING = [
  "Sign with the certificate you already have: in your Keychain, on a smart card, or on a security key.",
  "Into a signature field, a box you draw, the corner of the page, or invisibly, with your saved signature or just your name.",
  "Timestamped, with revocation data inside, so it keeps verifying after your certificate expires.",
  "Certify a document and choose what others may change, or seal it with a timestamp for the long haul.",
];

const DETAILS = [
  ["Document", "Not changed since signing"],
  ["Signed", "Nov 12, 2026, 2:14 PM · timestamped"],
  ["Certificate", "Valid, trusted by your Mac"],
  ["Revocation", "Not revoked"],
  ["Level", "PAdES B-LT"],
];

function SignedDocument() {
  return (
    <div
      className="window sig-demo"
      role="img"
      aria-label="Illustration of a signed PDF in Clumsy: the bar reads Signed by Jordan Avery, the signature is valid"
    >
      <div className="sig-demo__bar">
        <span className="sig-demo__check" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="16" height="16">
            <path d="M8 1.2 2.5 3.4v4c0 3.4 2.3 6.2 5.5 7.4 3.2-1.2 5.5-4 5.5-7.4v-4Z" fill="currentColor" />
            <path d="m5.4 8.1 1.8 1.8 3.5-3.6" fill="none" stroke="#0b0a0d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="sig-demo__text">Signed by Jordan Avery. The signature is valid.</span>
        <span className="sig-demo__button">Details</span>
      </div>
      <div className="sig-demo__page">
        <div className="sig-demo__lines" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <dl className="sig-demo__details">
          {DETAILS.map(([term, value]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="sig-demo__stamp" aria-hidden="true">
          <span className="sig-demo__ink">Jordan Avery</span>
          <span className="sig-demo__meta">Digitally signed by Jordan Avery · 2026-11-12</span>
        </div>
      </div>
    </div>
  );
}

export function SignatureSpotlight() {
  return (
    <section className="section signatures" id="signatures" aria-labelledby="signatures-title">
      <div className="section__inner">
        <div className="signatures__layout">
          <div>
            <p className="section__label">Digital signatures</p>
            <h2 id="signatures-title" className="section__title">
              A real signature, not a picture of one.
            </h2>
            <p className="section__body">
              Clumsy checks every signature it opens and signs with a
              certificate you already have. No signing service, no account, no
              per-document fee. Your private key never leaves your Mac or your
              card, and every signature asks first.
            </p>
          </div>
          <SignedDocument />
        </div>

        <div className="signatures__lists">
          <article className="feature">
            <h3 className="feature__title">Checking</h3>
            <ul className="feature__list">
              {CHECKING.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
          <article className="feature">
            <h3 className="feature__title">Signing</h3>
            <ul className="feature__list">
              {SIGNING.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}
