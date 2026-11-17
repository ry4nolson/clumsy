import { useState } from "react";
import { MAX_TEXT_LENGTH, cleanText, newCustomId, type TextStamp } from "../lib/customStamps";
import { colorFromHex } from "../lib/markup";
import { defaultMarkupParams, markupColors } from "../lib/markupParams";
import { dateLabel } from "../lib/marks";
import { wordDesign } from "../lib/stampSymbols";
import { MarkupColors } from "./MarkupTools";
import { DesignPreview } from "./StampPreview";
import "./CustomStamps.css";

const SAMPLE = "YOUR TEXT";

export function CustomStampForm({ onAdd, onCancel }: { onAdd: (stamp: TextStamp) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [color, setColor] = useState(markupColors[3]);
  const [dated, setDated] = useState(true);
  const word = cleanText(text);
  const design = wordDesign(word || SAMPLE, dated ? dateLabel(new Date()) : null);

  const submit = () => {
    if (word) {
      onAdd({ id: newCustomId(), name: word, kind: "text", text: word, color: colorFromHex(color), date: dated });
    }
  };

  return (
    <form
      className="custom-stamp-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h3>New Text Stamp</h3>
      <div className="label-form">
        <label className="label-form-name" htmlFor="custom-stamp-text">
          Text
        </label>
        <input
          id="custom-stamp-text"
          className="text-input"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          maxLength={MAX_TEXT_LENGTH}
          placeholder="APPROVED AS NOTED"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <span className="label-form-name">Color</span>
        <MarkupColors params={{ ...defaultMarkupParams, color }} onChange={(patch) => patch.color && setColor(patch.color)} />
        <span />
        <label className="custom-stamp-check">
          <input type="checkbox" checked={dated} onChange={(event) => setDated(event.target.checked)} />
          Add the date it's placed
        </label>
      </div>
      <div className={`custom-stamp-preview${word ? "" : " sample"}`}>
        <DesignPreview design={design} color={color} />
      </div>
      <div className="dialog-actions">
        <span className="spacer" />
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button primary" disabled={!word}>
          Add Stamp
        </button>
      </div>
    </form>
  );
}
