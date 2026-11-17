import { useEffect, useRef } from "react";

import type { Route } from "./+types/install";
import {
  DOWNLOAD,
  DOWNLOAD_LINUX,
  DOWNLOAD_LINUX_DEB,
  DOWNLOAD_LINUX_RPM,
  DOWNLOAD_WINDOWS,
  INSTALL,
  INSTALL_LINUX,
  INSTALL_WINDOWS,
  RELEASES,
} from "~/lib/links";
import { pageMeta } from "~/lib/meta";
import { useVersion } from "~/lib/useVersion";

type Platform = "mac" | "windows" | "linux";

type Step = { title: string; body: string };

type Download = { file: string; href: string };

type Guide = { name: string; downloads: Download[]; starts: boolean; others: Array<{ label: string; href: string }>; steps: Step[] };

const VERSIONS: Record<Platform, { label: string; href: string }> = {
  mac: { label: "Mac version", href: INSTALL },
  windows: { label: "Windows version", href: INSTALL_WINDOWS },
  linux: { label: "Linux version", href: INSTALL_LINUX },
};

const othersFor = (platform: Platform) =>
  (Object.keys(VERSIONS) as Platform[]).filter((other) => other !== platform).map((other) => VERSIONS[other]);

const GUIDES: Record<Platform, Guide> = {
  mac: {
    name: "Mac",
    downloads: [{ file: "Clumsy-MacOS-Universal.dmg", href: DOWNLOAD }],
    starts: true,
    others: othersFor("mac"),
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
    downloads: [{ file: "Clumsy-Windows-Installer.exe", href: DOWNLOAD_WINDOWS }],
    starts: true,
    others: othersFor("windows"),
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
  linux: {
    name: "Linux",
    downloads: [
      { file: "Clumsy-Linux-x64.deb", href: DOWNLOAD_LINUX_DEB },
      { file: "Clumsy-Linux-x64.rpm", href: DOWNLOAD_LINUX_RPM },
      { file: "Clumsy-Linux-x64.AppImage", href: DOWNLOAD_LINUX },
    ],
    starts: false,
    others: othersFor("linux"),
    steps: [
      {
        title: "Pick the package for your system",
        body: "The .deb is for Debian, Ubuntu 22.04 or later, and their relatives. The .rpm is for Fedora and openSUSE. The AppImage runs on most other x64 systems without installing anything.",
      },
      {
        title: "Install it",
        body: "Open the .deb or .rpm with your software installer, or run sudo apt install ./Clumsy-Linux-x64.deb or sudo dnf install ./Clumsy-Linux-x64.rpm in the folder you saved it to. For the AppImage, allow it to run as a program in the file's properties (or chmod +x), then open it.",
      },
      {
        title: "Open Clumsy from your apps",
        body: "The .deb and .rpm add Clumsy to your app list and let you make it your default PDF app. It doesn't update itself on Linux yet, so check back here for new versions. Printing and digital signatures aren't there yet either.",
      },
    ],
  },
};

function platformOf(param: string | undefined): Platform {
  return param === "windows" || param === "linux" ? param : "mac";
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
    if (!guide.starts || started.current === platform) return;
    started.current = platform;
    window.location.assign(guide.downloads[0].href);
  }, [platform, guide]);

  return (
    <main className="section install">
      <div className="section__inner install__inner">
        <img className="install__icon" src="/icon.png" alt="" width={80} height={80} />
        <p className="section__label">Download</p>
        <h1 className="section__title">
          Clumsy{version ? ` ${version}` : ""} for {guide.name}
          {guide.starts ? " is downloading." : ""}
        </h1>
        {guide.starts ? (
          <p className="section__body">
            Didn&apos;t start? <a href={guide.downloads[0].href}>Download {guide.downloads[0].file}</a>.
          </p>
        ) : (
          <div className="install__downloads">
            {guide.downloads.map((download) => (
              <a key={download.file} className="btn btn--secondary" href={download.href}>
                {download.file}
              </a>
            ))}
          </div>
        )}

        <ol className="install__steps">
          {guide.steps.map((step) => (
            <li key={step.title} className="install__step">
              <h2 className="install__step-title">{step.title}</h2>
              <p className="install__step-body">{step.body}</p>
            </li>
          ))}
        </ol>

        <p className="install__more">
          {guide.others.map((other) => (
            <span key={other.href}>
              <a href={other.href}>{other.label}</a>
              <span aria-hidden="true"> · </span>
            </span>
          ))}
          <a href={RELEASES}>All releases on GitHub</a>
        </p>
      </div>
    </main>
  );
}
