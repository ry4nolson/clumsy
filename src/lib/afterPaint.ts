export function afterPaint(run: () => void) {
  let timer = 0;
  const frame = requestAnimationFrame(() => {
    timer = window.setTimeout(run);
  });
  return () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(timer);
  };
}
