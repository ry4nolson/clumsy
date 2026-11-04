import { useEffect, useState } from "react";
import { Link } from "react-router";

import { DOWNLOAD, GITHUB } from "~/lib/links";

export default function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`nav${scrolled ? " nav--scrolled" : ""}`} aria-label="Main">
      <div className="nav__inner">
        <Link className="nav__brand" to="/">
          <img className="nav__mark" src="/icon.png" alt="" width={28} height={28} />
          Clumsy
        </Link>
        <div className="nav__links">
          <a className="nav__link nav__link--wide" href="/#features">
            Features
          </a>
          <a className="nav__link nav__link--wide" href="/#tour">
            Tour
          </a>
          <Link className="nav__link" to="/changelog">
            Changelog
          </Link>
          <a className="nav__link nav__link--wide" href={GITHUB}>
            GitHub
          </a>
          <a className="btn btn--primary btn--sm nav__cta" href={DOWNLOAD}>
            Download
          </a>
        </div>
      </div>
    </nav>
  );
}
