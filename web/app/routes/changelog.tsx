import { Fragment } from "react";

import changelog from "../../../CHANGELOG.md?raw";
import { parseChangelog, parseInline } from "../../../src/lib/changelog";
import type { Route } from "./+types/changelog";
import { RELEASES } from "~/lib/links";
import { pageMeta } from "~/lib/meta";

export function meta(_args: Route.MetaArgs) {
  return pageMeta(
    "Changelog · Clumsy",
    "Every Clumsy release and what changed in it.",
  );
}

export function loader() {
  return {
    releases: parseChangelog(changelog).filter(
      (release) => release.version !== "Unreleased",
    ),
  };
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((segment, index) => (
        <Fragment key={index}>
          {segment.bold ? <strong>{segment.text}</strong> : segment.text}
        </Fragment>
      ))}
    </>
  );
}

export default function Changelog({ loaderData }: Route.ComponentProps) {
  return (
    <main className="section changelog">
      <div className="section__inner changelog__inner">
        <div className="section__header">
          <p className="section__label">Release history</p>
          <h1 className="section__title">Changelog</h1>
          <p className="section__body">
            Everything that changed, release by release. The same notes show up
            in Clumsy under About &gt; What&apos;s New. Downloads for each
            version are on <a href={RELEASES}>GitHub</a>.
          </p>
        </div>

        <ol className="releases">
          {loaderData.releases.map((release) => (
            <li key={release.version} className="release" id={`v${release.version}`}>
              <div className="release__header">
                <h2 className="release__version">
                  <a href={`#v${release.version}`}>v{release.version}</a>
                </h2>
                {release.date && (
                  <time className="release__date" dateTime={release.date}>
                    {formatDate(release.date)}
                  </time>
                )}
              </div>
              {release.sections.map((section) => (
                <div key={section.title} className="release__section">
                  <span className={`badge badge--${section.title.toLowerCase()}`}>
                    {section.title}
                  </span>
                  <ul className="release__items">
                    {section.items.map((item, index) => (
                      <li key={index}>
                        <Inline text={item} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
