import { useRef, useState, type CSSProperties, type PointerEvent } from "react";

type ThemeSliderProps = {
  image: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
};

export function ThemeSlider({ image, alt, width, height, priority = false }: ThemeSliderProps) {
  const [split, setSplit] = useState(50);
  const frame = useRef<HTMLDivElement>(null);

  const follow = (event: PointerEvent<HTMLDivElement>) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box?.width) return;
    setSplit(Math.min(100, Math.max(0, ((event.clientX - box.left) / box.width) * 100)));
  };

  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    follow(event);
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) follow(event);
  };

  return (
    <div
      ref={frame}
      className="theme-slider"
      style={{ "--split": `${split}%` } as CSSProperties}
      onPointerDown={start}
      onPointerMove={move}
    >
      <img
        className="window__shot"
        src={`/screenshots/${image}-light.webp`}
        alt={alt}
        width={width}
        height={height}
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
        draggable={false}
      />
      <img
        className="theme-slider__dark"
        src={`/screenshots/${image}-dark.webp`}
        alt=""
        width={width}
        height={height}
        decoding="async"
        draggable={false}
      />
      <span className="theme-slider__label theme-slider__label--light" aria-hidden="true">
        Light
      </span>
      <span className="theme-slider__label theme-slider__label--dark" aria-hidden="true">
        Dark
      </span>
      <input
        className="theme-slider__input"
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(split)}
        onChange={(event) => setSplit(Number(event.target.value))}
        aria-label="Light and dark mode divider"
        aria-valuetext={`${Math.round(split)}% light`}
      />
      <span className="theme-slider__handle" aria-hidden="true">
        <span className="theme-slider__knob">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 6-6 6 6 6M15 6l6 6-6 6" />
          </svg>
        </span>
      </span>
    </div>
  );
}
