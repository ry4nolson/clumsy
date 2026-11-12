import { Link } from "react-router";

import { FsgMark } from "~/components/FsgMark";
import { FSG, GITHUB, ISSUES, LICENSE, RELEASES, SPONSOR } from "~/lib/links";
import { useVersion } from "~/lib/useVersion";

export default function SiteFooter() {
  const version = useVersion();
  return (
    <>
      <section className="sponsor" aria-labelledby="sponsor-title">
        <div className="section__inner sponsor__inner">
          <p className="sponsor__text" id="sponsor-title">
            Proudly sponsored by <strong>Texas Beard Company</strong> and{" "}
            <strong>Facility Solutions Group</strong>.
          </p>
          <div className="sponsor__logos">
            <a href={SPONSOR} rel="noopener noreferrer" aria-label="Texas Beard Company">
              <img
                className="sponsor__logo"
                src="/texas-beard-logo.png"
                alt="Texas Beard Company"
                width={154}
                height={32}
              />
            </a>
            <a className="sponsor__fsg" href={FSG} rel="noopener noreferrer" aria-label="Facility Solutions Group">
              <FsgMark />
            </a>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-footer__inner">
          <div>
            <div className="site-footer__brand">
              <img src="/icon.png" alt="" width={22} height={22} />
              Clumsy
            </div>
            <p className="site-footer__copy">
              No tricks, no acrobatics. v{version}, MIT licensed.
            </p>
          </div>
          <nav className="site-footer__links" aria-label="Footer">
            <Link to="/changelog">Changelog</Link>
            <a href={RELEASES}>Releases</a>
            <a href={GITHUB}>GitHub</a>
            <a href={ISSUES}>Report a bug</a>
            <a href={LICENSE}>License</a>
            <a href={SPONSOR}>Texas Beard Co.</a>
            <a href={FSG}>FSG</a>
          </nav>
        </div>
      </footer>
    </>
  );
}
