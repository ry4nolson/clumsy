import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { signatureFonts, type SignatureFont } from "../lib/signatureFonts";
import "./SignatureFonts.css";

type SignatureFontPickerProps = {
  text: string;
  selected: SignatureFont;
  onPick: (font: SignatureFont) => void;
};

export function SignatureFontPicker({ text, selected, onPick }: SignatureFontPickerProps) {
  const groupRef = useRef<HTMLDivElement>(null);
  const sample = text.trim() || "Signature";

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    const fit = () => {
      for (const label of group.querySelectorAll<HTMLElement>("span")) {
        label.style.fontSize = "";
        const room = label.parentElement?.clientWidth ?? 0;
        const width = label.offsetWidth;
        if (room > 0 && width > room) {
          label.style.fontSize = `${(parseFloat(getComputedStyle(label).fontSize) * room) / width}px`;
        }
      }
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(group);
    document.fonts.addEventListener("loadingdone", fit);
    return () => {
      resize.disconnect();
      document.fonts.removeEventListener("loadingdone", fit);
    };
  }, [sample]);

  return (
    <div ref={groupRef} className="signature-fonts" role="radiogroup" aria-label="Signature font">
      {signatureFonts.map((option) => (
        <button key={option.id} type="button" role="radio" aria-checked={option.id === selected.id} aria-label={option.name} title={option.name} onClick={() => onPick(option)}>
          <span style={{ fontFamily: option.family, "--size": `${Math.round(20 * option.scale)}px` } as CSSProperties}>{sample}</span>
        </button>
      ))}
    </div>
  );
}
