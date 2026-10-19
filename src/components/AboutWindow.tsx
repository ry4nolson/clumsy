import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleArrowDown,
  CircleCheck,
  Code,
  Download,
  LoaderCircle,
  MessageSquareWarning,
  TriangleAlert,
} from "lucide-react";
import changelogSource from "../../CHANGELOG.md?raw";
import licenseSource from "../../LICENSE?raw";
import appIcon from "../../src-tauri/icons/128x128@2x.png";
import sponsorLogo from "../assets/brand/HorizontalLogo.png";
import sponsorLogoWhite from "../assets/brand/HorizontalLogoWhite.png";
import { parseChangelog } from "../lib/changelog";
import type { DefaultAppStatus } from "../lib/defaultApp";
import { promptForDefaultApp } from "../lib/defaultAppPrompt";
import { getDefaultAppStatus, initialWindowParams, onAuxWindowParams, openExternal, type AuxWindowParams } from "../lib/platform";
import { appVersion, repoUrl, useUpdateCheck } from "../lib/updates";
import { ChangelogList } from "./ChangelogList";
import { LicensesView } from "./LicensesView";

export type AboutTab = "about" | "changelog" | "licenses";

const features = [
  "Search with match highlighting",
  "Thumbnails & document outline",
  "Dark pages that spare your images",
  "Highlights, notes & drawing",
  "Fill forms & sign",
  "Saves straight back into the PDF",
];

const links = [
  { title: "GitHub", icon: Code, url: repoUrl },
  { title: "Releases", icon: Download, url: `${repoUrl}/releases` },
  { title: "Issues", icon: MessageSquareWarning, url: `${repoUrl}/issues` },
];

const isAboutTab = (value: string | undefined): value is AboutTab => value === "about" || value === "changelog" || value === "licenses";

export function AboutWindow() {
  const [tab, setTab] = useState<AboutTab>(() => {
    const requested = initialWindowParams().tab;
    return isAboutTab(requested) ? requested : "about";
  });
  const releases = useMemo(() => parseChangelog(changelogSource), []);
  const { status, check } = useUpdateCheck();
  const [defaultApp, setDefaultApp] = useState<DefaultAppStatus | null>(null);
  const onOpenUrl = openExternal;

  const refreshDefaultApp = useCallback(() => {
    getDefaultAppStatus().then(setDefaultApp);
  }, []);

  useEffect(() => {
    const apply = (params: AuxWindowParams) => {
      if (isAboutTab(params.tab)) {
        setTab(params.tab);
      }
      if (params.check === "1") {
        check();
      }
      refreshDefaultApp();
    };
    apply(initialWindowParams());
    const dispose = onAuxWindowParams(apply);
    window.addEventListener("focus", refreshDefaultApp);
    return () => {
      dispose.then((unlisten) => unlisten());
      window.removeEventListener("focus", refreshDefaultApp);
    };
  }, [check, refreshDefaultApp]);

  const makeDefault = async () => {
    if (defaultApp) {
      await promptForDefaultApp(defaultApp, "manual");
      refreshDefaultApp();
    }
  };

  return (
    <div className="aux-window about-window">
      <div className="about-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "about"} onClick={() => setTab("about")}>
          About
        </button>
        <button type="button" role="tab" aria-selected={tab === "changelog"} onClick={() => setTab("changelog")}>
          What's New
        </button>
        <button type="button" role="tab" aria-selected={tab === "licenses"} onClick={() => setTab("licenses")}>
          Licenses
        </button>
      </div>

      {tab === "about" ? (
        <div className="about">
          <div className="about-hero">
            <img src={appIcon} alt="" width={96} height={96} />
            <div>
              <h2>Clumsy</h2>
              <p className="about-tagline">Not an acrobat. Just opens your PDFs.</p>
              <p className="about-version">Version {appVersion}</p>
            </div>
          </div>

          <dl className="about-facts">
            <div>
              <dt>Developer</dt>
              <dd>ry4nolson</dd>
            </div>
            <div>
              <dt>Engine</dt>
              <dd>pdf.js + Tauri</dd>
            </div>
            <div>
              <dt>License</dt>
              <dd>MIT</dd>
            </div>
            <div>
              <dt>Platform</dt>
              <dd>macOS Universal</dd>
            </div>
          </dl>

          <section className="about-features">
            <h3>Features</h3>
            <ul>
              {features.map((feature) => (
                <li key={feature}>
                  <CircleCheck size={14} />
                  {feature}
                </li>
              ))}
            </ul>
          </section>

          <div className="about-links">
            {links.map(({ title, icon: Icon, url }) => (
              <button key={title} type="button" className="link-button" onClick={() => onOpenUrl(url)}>
                <Icon size={14} />
                {title}
              </button>
            ))}
          </div>

          <div className="about-update" aria-live="polite">
            {status.state === "checking" && (
              <>
                <LoaderCircle size={14} className="spin" />
                <span>Checking for updates…</span>
              </>
            )}
            {status.state === "available" && (
              <>
                <CircleArrowDown size={14} className="tone-available" />
                <strong>v{status.latest} available</strong>
                <button type="button" className="button primary small" onClick={() => onOpenUrl(status.url)}>
                  View release
                </button>
              </>
            )}
            {status.state === "current" && (
              <>
                <CircleCheck size={14} className="tone-current" />
                <span>Up to date</span>
              </>
            )}
            {status.state === "error" && (
              <>
                <TriangleAlert size={14} className="tone-warning" />
                <span>{status.message}</span>
              </>
            )}
            {status.state !== "checking" && (
              <button type="button" className="link-button" onClick={check}>
                Check for updates
              </button>
            )}
          </div>

          {defaultApp?.supported && (
            <div className="about-update">
              {defaultApp.isDefault ? (
                <>
                  <CircleCheck size={14} className="tone-current" />
                  <span>Clumsy is your default PDF app</span>
                </>
              ) : (
                <>
                  <span>PDFs open in {defaultApp.currentApp ?? "another app"}</span>
                  <button type="button" className="link-button" onClick={makeDefault}>
                    Make Clumsy the default
                  </button>
                </>
              )}
            </div>
          )}

          <div className="about-sponsor">
            <span>Sponsored by</span>
            <button type="button" className="sponsor-logo" onClick={() => onOpenUrl("https://www.texasbeardcompany.com")} aria-label="Texas Beard Company">
              <picture>
                <source srcSet={sponsorLogoWhite} media="(prefers-color-scheme: dark)" />
                <img src={sponsorLogo} alt="Texas Beard Company" height={30} />
              </picture>
            </button>
          </div>

          <p className="about-footer">Built because Acrobat wanted to update again.</p>
        </div>
      ) : tab === "changelog" ? (
        <div className="about-changelog">
          <ChangelogList releases={releases} onOpenUrl={onOpenUrl} />
        </div>
      ) : (
        <LicensesView license={licenseSource} />
      )}
    </div>
  );
}
