window.__h = (() => {
  const base = "http://127.0.0.1:4180/";
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const longTasks = [];
  try {
    new PerformanceObserver((list) => list.getEntries().forEach((entry) => longTasks.push(entry.duration))).observe({ type: "longtask", buffered: true });
  } catch {}

  const visibleViewer = () =>
    [...document.querySelectorAll(".viewer-container")].find((element) => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");

  function canvasBytes() {
    const areas = { viewer: [0, 0], sidebar: [0, 0], map: [0, 0], other: [0, 0] };
    for (const canvas of document.querySelectorAll("canvas")) {
      if (canvas.width === 300 && canvas.height === 150) {
        areas.blank = [(areas.blank?.[0] ?? 0) + 1, 0];
        continue;
      }
      const bytes = canvas.width * canvas.height * 4;
      const area = canvas.closest(".document-map") ? "map" : canvas.closest(".app-sidebar") ? "sidebar" : canvas.closest(".viewer-container") ? "viewer" : "other";
      areas[area][0] += 1;
      areas[area][1] += bytes;
    }
    return Object.fromEntries(Object.entries(areas).map(([key, [count, bytes]]) => [key, { count, mb: +(bytes / 1048576).toFixed(1) }]));
  }

  function stats() {
    return {
      canvases: canvasBytes(),
      jsHeapMb: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      domNodes: document.getElementsByTagName("*").length,
      longTaskCount: longTasks.length,
      longTaskMs: Math.round(longTasks.reduce((sum, value) => sum + value, 0)),
    };
  }

  async function open(name) {
    const started = performance.now();
    const blob = await (await fetch(base + name)).blob();
    const fetched = performance.now();
    const file = new File([blob], name.split("/").pop(), { type: name.endsWith(".md") ? "text/markdown" : "application/pdf" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const before = new Set(document.querySelectorAll(".viewer-container, .markdown-view, article"));
    const dropped = performance.now();
    window.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, clientX: innerWidth / 2, clientY: innerHeight / 2, bubbles: true, cancelable: true }));
    for (let waited = 0; waited < 120000; waited += 16) {
      await frame();
      const viewer = visibleViewer();
      if (viewer && !before.has(viewer)) {
        const canvas = viewer.querySelector(".page .canvasWrapper canvas");
        if (canvas && canvas.width > 0) {
          return { fetchMs: Math.round(fetched - started), firstPageMs: Math.round(performance.now() - dropped), sizeMb: +(blob.size / 1048576).toFixed(1) };
        }
      }
      if (name.endsWith(".md") && document.querySelector("article [data-line]") && waited > 0) {
        return { fetchMs: Math.round(fetched - started), renderedMs: Math.round(performance.now() - dropped), sizeMb: +(blob.size / 1048576).toFixed(1) };
      }
    }
    return { timeout: true };
  }

  const job = { running: false, steps: 0, ms: 0, worstStepMs: 0, done: false };

  function scrollJob(selector, stepFraction = 0.9) {
    Object.assign(job, { running: true, steps: 0, ms: 0, worstStepMs: 0, done: false, startLongTaskMs: stats().longTaskMs });
    (async () => {
      const element = selector ? [...document.querySelectorAll(selector)].find((node) => node.getClientRects().length) : visibleViewer();
      const started = performance.now();
      element.scrollTop = 0;
      await sleep(300);
      while (element.scrollTop + element.clientHeight < element.scrollHeight - 2) {
        const stepStarted = performance.now();
        element.scrollTop += element.clientHeight * stepFraction;
        await frame();
        await frame();
        await sleep(60);
        job.worstStepMs = Math.max(job.worstStepMs, Math.round(performance.now() - stepStarted));
        job.steps += 1;
      }
      await sleep(1500);
      job.ms = Math.round(performance.now() - started);
      job.longTaskMsDuring = stats().longTaskMs - job.startLongTaskMs;
      job.running = false;
      job.done = true;
    })();
    return "started";
  }

  return { open, stats, scrollJob, job, visibleViewer };
})();
"harness ready";
