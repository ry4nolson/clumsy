import { useState } from "react";
import { FileText, FolderOpen, Info, X } from "lucide-react";
import appIcon from "../../src-tauri/icons/128x128@2x.png";
import { formatRelativeTime, type RecentEntry } from "../lib/recent";

const COLLAPSED_COUNT = 8;

export type WelcomeProps = {
  loading: boolean;
  shortcut: string;
  recent: RecentEntry[] | null;
  onOpen: () => void;
  onOpenRecent: (entry: RecentEntry) => void;
  onRemoveRecent: (entry: RecentEntry) => void;
  onClearRecent: () => void;
  onAbout: () => void;
};

export function Welcome({ loading, shortcut, recent, onOpen, onOpenRecent, onRemoveRecent, onClearRecent, onAbout }: WelcomeProps) {
  const [expanded, setExpanded] = useState(false);
  const now = Date.now();
  const visible = recent && (expanded ? recent : recent.slice(0, COLLAPSED_COUNT));

  return (
    <div className="welcome">
      <header className="welcome-header">
        <img src={appIcon} alt="" width={72} height={72} />
        <div>
          <h1>Clumsy</h1>
          <p>{loading ? "Opening…" : "No tricks, no acrobatics."}</p>
        </div>
      </header>

      <div className={`welcome-columns${recent ? "" : " single"}`}>
        <section className="welcome-start">
          <h2>Start</h2>
          <button type="button" className="welcome-action" onClick={onOpen} disabled={loading}>
            <FolderOpen size={16} />
            Open File…
            <kbd>{shortcut}</kbd>
          </button>
          <button type="button" className="welcome-action" onClick={onAbout}>
            <Info size={16} />
            About Clumsy
          </button>
          <p className="welcome-hint">Or drop a PDF or Markdown file anywhere in this window.</p>
        </section>

        {recent && visible && (
          <section className="welcome-recent">
            <div className="welcome-recent-header">
              <h2>Recent</h2>
              {recent.length > 0 && (
                <button type="button" className="link-button" onClick={onClearRecent}>
                  Clear
                </button>
              )}
            </div>
            {recent.length === 0 ? (
              <p className="welcome-hint">Files you open will show up here.</p>
            ) : (
              <ul>
                {visible.map((entry) => (
                  <li key={entry.path} className={entry.exists ? undefined : "missing"}>
                    <button
                      type="button"
                      className="recent-open"
                      onClick={() => onOpenRecent(entry)}
                      disabled={loading}
                      title={entry.exists ? entry.path : `${entry.path} (missing)`}
                    >
                      <FileText size={16} />
                      <span className="recent-name">{entry.name}</span>
                      <span className="recent-location">{entry.location}</span>
                      <span className="recent-time">{entry.exists ? formatRelativeTime(entry.openedAt, now) : "Missing"}</span>
                    </button>
                    <button
                      type="button"
                      className="icon-button recent-remove"
                      aria-label={`Remove ${entry.name} from recent files`}
                      title="Remove from recent"
                      onClick={() => onRemoveRecent(entry)}
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {recent.length > COLLAPSED_COUNT && (
              <button type="button" className="link-button welcome-more" onClick={() => setExpanded(!expanded)}>
                {expanded ? "Show fewer" : `More… (${recent.length - COLLAPSED_COUNT})`}
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
