export type ChangelogSection = { title: string; items: string[] };

export type ChangelogRelease = { version: string; date: string | null; sections: ChangelogSection[] };

function parseVersionHeader(header: string): Pick<ChangelogRelease, "version" | "date"> {
  if (/unreleased/i.test(header)) {
    return { version: "Unreleased", date: null };
  }
  const version = header.match(/\[([^\]]+)\]/)?.[1] ?? header.trim();
  const date = header.split(" - ")[1]?.trim() || null;
  return { version, date };
}

export function parseChangelog(content: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  let release: ChangelogRelease | null = null;
  let section: ChangelogSection | null = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("## ")) {
      release = { ...parseVersionHeader(line.slice(3)), sections: [] };
      section = null;
      releases.push(release);
    } else if (line.startsWith("### ") && release) {
      section = { title: line.slice(4).trim(), items: [] };
      release.sections.push(section);
    } else if (line.startsWith("- ") && section) {
      section.items.push(line.slice(2).trim());
    } else if (line && section?.items.length && rawLine.startsWith("  ")) {
      section.items[section.items.length - 1] += ` ${line}`;
    }
  }

  return releases
    .map((entry) => ({ ...entry, sections: entry.sections.filter((group) => group.items.length) }))
    .filter((entry) => entry.sections.length);
}

export type InlineSegment = { text: string; bold: boolean };

export function parseInline(text: string): InlineSegment[] {
  return text
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith("**") && part.endsWith("**") && part.length > 4
        ? { text: part.slice(2, -2), bold: true }
        : { text: part, bold: false },
    );
}

export function isNewerVersion(candidate: string, current: string) {
  const parse = (value: string) => value.replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference) {
      return difference > 0;
    }
  }
  return false;
}
