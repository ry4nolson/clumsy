import { useState } from "react";
import type { CustomStamp } from "../lib/customStamps";
import type { CustomStampsApi } from "../hooks/useCustomStamps";
import { StampButton } from "./StampButton";
import { StampPreview } from "./StampPreview";
import "./CustomStamps.css";

type SectionProps = {
  found: CustomStamp[];
  searching: boolean;
  color: string;
  api: CustomStampsApi;
  onPick: (id: string) => void;
  onNewText: () => void;
};

function NameField({ stamp, onRename }: { stamp: CustomStamp; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(stamp.name);
  const commit = () => (draft.trim() && draft !== stamp.name ? onRename(draft) : setDraft(stamp.name));
  return (
    <input
      className="text-input"
      aria-label={`Name of ${stamp.name}`}
      autoComplete="off"
      spellCheck={false}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}

export function CustomStampSection({ found, searching, color, api, onPick, onNewText }: SectionProps) {
  const [editing, setEditing] = useState(false);
  if (searching && !found.length) {
    return null;
  }
  const managing = editing && !searching && api.stamps.length > 0;
  return (
    <section className="stamp-section custom-stamps">
      <div className="custom-stamps-header">
        <h3>Custom</h3>
        {!searching && (
          <>
            <button type="button" className="button small" onClick={onNewText}>
              New Text Stamp…
            </button>
            <button
              type="button"
              className="button small"
              onClick={() =>
                void api.addImage().then((stamp) => {
                  if (stamp) {
                    onPick(stamp.id);
                  }
                })
              }
            >
              New Image Stamp…
            </button>
            {api.stamps.length > 0 && (
              <button type="button" className="button small" aria-pressed={managing} onClick={() => setEditing(!managing)}>
                {managing ? "Done" : "Edit"}
              </button>
            )}
          </>
        )}
      </div>
      {managing ? (
        <ul className="custom-stamp-rows">
          {api.stamps.map((stamp) => (
            <li key={stamp.id}>
              <span className={`stamp-choice static ${stamp.kind}`}>
                <StampPreview id={stamp.id} color={color} />
              </span>
              <NameField stamp={stamp} onRename={(name) => api.rename(stamp.id, name)} />
              <button type="button" className="button small" onClick={() => void api.remove(stamp)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : found.length ? (
        <div className="stamp-grid">
          {found.map((stamp) => (
            <StampButton key={stamp.id} id={stamp.id} color={color} onPick={onPick} />
          ))}
        </div>
      ) : (
        <p className="custom-stamps-empty">Make a stamp from your own image or words. It's kept on this computer for every document.</p>
      )}
    </section>
  );
}
