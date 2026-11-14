import { useEffect, useRef } from "react";

import type { Route } from "./+types/install";
import { DOWNLOAD, DOWNLOAD_WINDOWS, INSTALL, INSTALL_WINDOWS, RELEASES } from "~/lib/links";
import { pageMeta } from "~/lib/meta";
import { useVersion } from "~/lib/useVersion";

type Platform = "mac" | "windows";

type Step = { title: string; body: string };

const GUIDES: Record<Platform, { name: string; file: string; download: string; other: { label: string; href: string }; steps: Step[] }> = {
  mac: {
    name: "Mac",
    file: "Clumsy-MacOS-Universal.dmg",
    download: DOWNLOAD,
    other: { label: "Need the Windows version?", href: INSTALL_WINDOWS },
    steps: [
      {
        title: "If Chrome asks, click Keep",
        body: "Clumsy is new, so Chrome may say the file isn't commonly downloaded and hold it until you choose Keep, in the download bubble or at chrome://downloads. Until then it sits in Downloads as a file ending in .crdownload, which won't open. Safari just downloads it.",
      },
      {
        title: "Open the disk image",
        body: "Double-click Clumsy-MacOS-Universal.dmg in your Downloads folder. It's signed and notarized, so macOS opens it without a fuss.",
      },
      {
        title: "Drag Clumsy to Applications",
        body: "Then open it from Applications, not from the disk image, so it can update itself. On first launch it offers to become your default PDF app.",
      },
    ],
  },
  windows: {
    name: "Windows",
    file: "Clumsy-Windows-Installer.exe",
    download: DOWNLOAD_WINDOWS,
    other: { label: "Need the Mac version?", href: INSTALL },
    steps: [
      {
        title: "If your browser asks, keep the file",
        body: "Clumsy is new, so Edge or Chrome may say the file isn't commonly downloaded. In Edge, open the download's … menu, choose Keep, then Show more and Keep anyway. In Chrome, choose Keep.",
      },
      {
        title: "Run the installer",
        body: "The installer isn't code-signed yet, so Windows warns before running it. Choose More info, then Run anyway.",
      },
      {
        title: "Open Clumsy from the Start menu",
        body: "It doesn't update itself on Windows yet, so check back here for new versions. Printing and digital signatures are Mac-only for now.",
      },
    ],
  },
};

function platformOf(param: string | undefined): Platform {
  return param === "windows" ? "windows" : "mac";
}

export function meta({ params }: Route.MetaArgs) {
  const guide = GUIDES[platformOf(params.platform)];
  return [
    ...pageMeta(`Download Clumsy for ${guide.name}`, `Downloading Clumsy for ${guide.name}, and how to install it.`),
    { name: "robots", content: "noindex" },
  ];
}

export default function Install({ params }: Route.ComponentProps) {
  const platform = platformOf(params.platform);
  const guide = GUIDES[platform];
  const version = useVersion();
  const started = useRef<Platform | null>(null);

  useEffect(() => {
    if (started.current === platform) return;
    started.current = platform;
    window.location.assign(guide.download);
  }, [platform, guide.download]);

  return (
    <main className="section install">
      <div className="section__inner install__inner">
        <img className="install__icon" src="/icon.png" alt="" width={80} height={80} />
        <p className="section__label">Download</p>
        <h1 className="section__title">
          Clumsy{version ? ` ${version}` : ""} for {guide.name} is downloading.
        </h1>
        <p className="section__body">
          Didn&apos;t start? <a href={guide.download}>Download {guide.file}</a>.
        </p>

        <ol className="install__steps">
          {guide.steps.map((step) => (
            <li key={step.title} className="install__step">
              <h2 className="install__step-title">{step.title}</h2>
              <p className="install__step-body">{step.body}</p>
            </li>
          ))}
        </ol>

        <p className="install__more">
          <a href={guide.other.href}>{guide.other.label}</a>
          <span aria-hidden="true"> · </span>
          <a href={RELEASES}>All releases on GitHub</a>
        </p>
      </div>
    </main>
  );
}
