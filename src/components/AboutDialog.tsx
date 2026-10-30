import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { getDefaultAppStatus, openExternal } from "../lib/platform";
import type { UpdateInstall } from "../hooks/useUpdateInstall";
import { appVersion, isInstalling, repoUrl, useUpdateCheck } from "../lib/updates";
import { ChangelogList } from "./ChangelogList";
import { LicensesView } from "./LicensesView";
import { InstallProgress } from "./UpdateDialog";

export type AboutTab = "about" | "changelog" | "licenses";

export type AboutRequest = { tab: AboutTab; check: boolean; token: number };

const features = [
  "Search with match highlighting",
  "Thumbnails & document outline",
  "Dark pages that spare your images",
  "Highlights, notes & drawing",
  "Fill forms & sign",
  "Saves straight back into the PDF",
  "Reorder, insert & combine pages",
  "Compare two documents",
  "Markdown with a source toggle",
  "Tabs, splits & windows",
  "Export pages as images",
  "Make PDFs from images",
];

const links = [
  { title: "GitHub", icon: Code, url: repoUrl },
  { title: "Releases", icon: Download, url: `${repoUrl}/releases` },
  { title: "Issues", icon: MessageSquareWarning, url: `${repoUrl}/issues` },
];

type AboutDialogProps = {
  request: AboutRequest | null;
  updateInstall: UpdateInstall;
  onRestart: () => void;
  onClose: () => void;
};

export function AboutDialog({ request, updateInstall, onRestart, onClose }: AboutDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<AboutTab>("about");
  const releases = useMemo(() => parseChangelog(changelogSource), []);
  const { status, check } = useUpdateCheck();
  const { install, start: installUpdate, dismissFailure } = updateInstall;
  const [defaultApp, setDefaultApp] = useState<DefaultAppStatus | null>(null);
  const onOpenUrl = openExternal;

  const refreshDefaultApp = useCallback(() => {
    getDefaultAppStatus().then(setDefaultApp);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!request) {
      if (dialog?.open) {
        dialog.close();
      }
      return;
    }
    setTab(request.tab);
    if (request.check) {
      check();
    }
    refreshDefaultApp();
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    window.addEventListener("focus", refreshDefaultApp);
    return () => window.removeEventListener("focus", refreshDefaultApp);
  }, [request, check, refreshDefaultApp]);

  const makeDefault = async () => {
    if (defaultApp) {
      await promptForDefaultApp(defaultApp, "manual");
      refreshDefaultApp();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="dialog sheet info-sheet about-sheet"
      aria-label="About Clumsy"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="info-sheet-header">
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
        <button type="button" className="button" onClick={onClose}>
          Done
        </button>
      </div>

      {!request ? null : tab === "about" ? (
        <div className="about">
          <div className="about-hero">
            <img src={appIcon} alt="" width={96} height={96} />
            <div>
              <h2>Clumsy</h2>
              <p className="about-tagline">No tricks, no acrobatics.</p>
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

          <div className="about-update-block" aria-live="polite">
            <div className="about-update">
              {status.state === "checking" && (
                <>
                  <LoaderCircle size={14} className="spin" />
                  <span>Checking for updates…</span>
                </>
              )}
              {install.state === "installed" && (
                <>
                  <CircleCheck size={14} className="tone-current" />
                  <strong>v{install.version} installed</strong>
                  <button type="button" className="button primary small" onClick={onRestart}>
                    Restart Now
                  </button>
                </>
              )}
              {status.state === "available" && install.state !== "installed" && (
                <>
                  <CircleArrowDown size={14} className="tone-available" />
                  <strong>v{status.latest} available</strong>
                  {install.state === "failed" ? (
                    <>
                      <button
                        type="button"
                        className="button primary small"
                        onClick={() => {
                          dismissFailure();
                          onOpenUrl(status.url);
                        }}
                      >
                        Download
                      </button>
                      <button type="button" className="link-button" onClick={installUpdate}>
                        Try again
                      </button>
                    </>
                  ) : (
                    <button type="button" className="button primary small" disabled={isInstalling(install)} onClick={installUpdate}>
                      Install
                    </button>
                  )}
                </>
              )}
              {status.state === "current" && install.state !== "installed" && (
                <>
                  <CircleCheck size={14} className="tone-current" />
                  <span>Up to date</span>
                </>
              )}
              {status.state === "error" && install.state !== "installed" && (
                <>
                  <TriangleAlert size={14} className="tone-warning" />
                  <span>{status.message}</span>
                </>
              )}
              {status.state !== "checking" && !isInstalling(install) && install.state !== "installed" && (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    dismissFailure();
                    check();
                  }}
                >
                  Check for updates
                </button>
              )}
            </div>
            <InstallProgress install={install} />
            {status.state === "available" && install.state === "failed" && (
              <div className="about-update">
                <TriangleAlert size={14} className="tone-warning" />
                <span>{install.message}</span>
              </div>
            )}
            {status.state === "available" && install.state !== "installed" && status.releases.length > 0 && (
              <div className="about-update-notes">
                <ChangelogList releases={status.releases} onOpenUrl={onOpenUrl} expand="all" />
              </div>
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

          <p className="about-footer">Built because opening a PDF shouldn’t require an update first.</p>
        </div>
      ) : tab === "changelog" ? (
        <div className="about-changelog">
          <ChangelogList releases={releases} onOpenUrl={onOpenUrl} />
        </div>
      ) : (
        <LicensesView license={licenseSource} />
      )}
    </dialog>
  );
}
