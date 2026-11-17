import { imageHref } from "../lib/customStamps";
import { hexColor } from "../lib/markup";
import { LABEL_FONT } from "../lib/markupSvg";
import { dateLabel } from "../lib/marks";
import { CAP_HEIGHT, isDatedStamp, stampColor, stampDesign, type StampDesign } from "../lib/stampSymbols";

export function DesignPreview({ design, color }: { design: StampDesign; color: string }) {
  return (
    <svg viewBox={`0 0 ${design.width} ${design.height}`} aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
      {design.image && <image href={imageHref(design.image)} width={design.width} height={design.height} preserveAspectRatio="none" />}
      {design.shapes.map((shape, index) => (
        <path key={index} d={shape.d} fill={shape.fill ? color : "none"} stroke={shape.fill ? "none" : color} strokeWidth={shape.fill ? undefined : (shape.strokeWidth ?? design.strokeWidth)} />
      ))}
      {design.labels.map((label, index) => (
        <text key={index} x={label.x} y={label.y + (label.size * CAP_HEIGHT) / 2} fontSize={label.size} fontFamily={LABEL_FONT} fontWeight={700} textAnchor="middle" fill={color}>
          {label.text}
        </text>
      ))}
    </svg>
  );
}

export function StampPreview({ id, color }: { id: string; color: string }) {
  const design = stampDesign(id, isDatedStamp(id) ? dateLabel(new Date()) : null);
  const own = stampColor(id);
  return design ? <DesignPreview design={design} color={own ? hexColor(own) : color} /> : null;
}
