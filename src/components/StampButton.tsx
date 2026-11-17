import { customStamp } from "../lib/customStamps";
import { isWordStamp, stampAspect, stampLabel } from "../lib/stampSymbols";
import { StampPreview } from "./StampPreview";

const TILE = 44;
const WIDE = 118;

export function StampButton({ id, color, onPick }: { id: string; color: string; onPick: (id: string) => void }) {
  const label = stampLabel(id);
  const image = customStamp(id)?.kind === "image";
  const width = image ? Math.round(Math.min(WIDE, Math.max(TILE, TILE * stampAspect(id)))) : undefined;
  return (
    <button
      type="button"
      className={`stamp-choice${isWordStamp(id) ? " review" : ""}`}
      style={width ? { width } : undefined}
      title={label}
      aria-label={label}
      onClick={() => onPick(id)}
    >
      <StampPreview id={id} color={color} />
    </button>
  );
}
