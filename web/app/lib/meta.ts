const DESCRIPTION =
  "Clumsy is a small, fast PDF viewer for macOS. Tabs, search, highlights, comments, forms, digital signatures, page edits, and document comparison, saved straight back into the file. Markdown too.";

export function pageMeta(title: string, description = DESCRIPTION) {
  const image = `${__SITE_URL__}/og-image.png`;
  return [
    { title },
    { name: "description", content: description },
    { property: "og:site_name", content: "Clumsy" },
    { property: "og:type", content: "website" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];
}
