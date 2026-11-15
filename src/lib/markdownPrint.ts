export const IMAGE_WAIT_MS = 5000;

function settleImages(root: HTMLElement, waitMs: number) {
  const images = [...root.querySelectorAll("img")].map((image) => image.decode().catch(() => undefined));
  return Promise.race([Promise.all(images), new Promise((resolve) => setTimeout(resolve, waitMs))]);
}

export const PAGE_MARGINS = "@page { margin: 0.5in; }";

export async function printArticle<T>(article: HTMLElement, print: () => Promise<T>, waitMs = IMAGE_WAIT_MS, pageRule = "") {
  const root = document.createElement("div");
  root.className = "markdown-print";
  root.append(article);
  if (pageRule) {
    const style = document.createElement("style");
    style.textContent = pageRule;
    root.append(style);
  }
  document.body.append(root);
  const page = document.documentElement.style;
  page.setProperty("--app-width", `${window.innerWidth}px`);
  page.setProperty("--app-height", `${window.innerHeight}px`);
  try {
    await settleImages(root, waitMs);
    return await print();
  } finally {
    root.remove();
    page.removeProperty("--app-width");
    page.removeProperty("--app-height");
  }
}
