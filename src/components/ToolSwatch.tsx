import { useEffect, useRef } from "react";
import type { SavedTool } from "../lib/toolChest";
import { swatchSvg } from "../lib/toolSwatch";

export function ToolSwatch({ tool, large = false }: { tool: SavedTool; large?: boolean }) {
  const host = useRef<HTMLSpanElement>(null);
  const latest = useRef(tool);
  latest.current = tool;
  const look = JSON.stringify([tool.tool, tool.style, tool.measure ?? null]);

  useEffect(() => {
    host.current?.replaceChildren(swatchSvg(latest.current));
  }, [look]);

  return <span ref={host} className={large ? "tool-swatch-host large" : "tool-swatch-host"} aria-hidden="true" />;
}
