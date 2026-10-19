import { useState } from "react";
import { ChevronRight, CircleMinus, CirclePlus, RefreshCw, Wrench } from "lucide-react";
import type { ChangelogRelease } from "../lib/changelog";
import { parseInline } from "../lib/changelog";
import { appVersion, releaseUrl } from "../lib/updates";

const sectionStyles: Record<string, { icon: typeof CirclePlus; tone: string }> = {
  added: { icon: CirclePlus, tone: "added" },
  fixed: { icon: Wrench, tone: "fixed" },
  changed: { icon: RefreshCw, tone: "changed" },
  removed: { icon: CircleMinus, tone: "removed" },
};

function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((segment, index) => (segment.bold ? <strong key={index}>{segment.text}</strong> : <span key={index}>{segment.text}</span>))}
    </>
  );
}

type ChangelogListProps = {
  releases: ChangelogRelease[];
  onOpenUrl: (url: string) => void;
};

export function ChangelogList({ releases, onOpenUrl }: ChangelogListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(releases.slice(0, 1).map((release) => release.version)));

  if (!releases.length) {
    return <p className="changelog-empty">No changelog available.</p>;
  }

  const toggle = (version: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(version)) {
        next.add(version);
      }
      return next;
    });

  return (
    <ol className="changelog">
      {releases.map((release) => {
        const isOpen = expanded.has(release.version);
        const isUnreleased = release.version === "Unreleased";
        return (
          <li key={release.version} className="changelog-release">
            <div className="changelog-header">
              <button type="button" className="changelog-toggle" aria-expanded={isOpen} onClick={() => toggle(release.version)}>
                <ChevronRight size={14} className="changelog-chevron" />
                <span className="changelog-version">{isUnreleased ? "Unreleased" : `v${release.version}`}</span>
                {release.date && <span className="changelog-date">{release.date}</span>}
                {isUnreleased && <span className="badge badge-dev">dev</span>}
                {release.version === appVersion && <span className="badge badge-current">installed</span>}
              </button>
              {!isUnreleased && (
                <button type="button" className="link-button changelog-link" onClick={() => onOpenUrl(releaseUrl(release.version))}>
                  Release notes
                </button>
              )}
            </div>
            {isOpen && (
              <div className="changelog-sections">
                {release.sections.map((section) => {
                  const style = sectionStyles[section.title.toLowerCase()];
                  const Icon = style?.icon;
                  return (
                    <section key={section.title} className={`changelog-section tone-${style?.tone ?? "other"}`}>
                      <h4>
                        {Icon && <Icon size={13} />}
                        {section.title}
                      </h4>
                      <ul>
                        {section.items.map((item, index) => (
                          <li key={index}>
                            <InlineText text={item} />
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
