import { Link } from "react-router";

import type { Route } from "./+types/guides";
import { loadGuideIndex } from "~/lib/guides.server";
import { pageMeta } from "~/lib/meta";
import { CACHE_HEADERS } from "~/lib/remote.server";

export function meta(_args: Route.MetaArgs) {
  return pageMeta(
    "Guides · Clumsy",
    "How to get the most out of Clumsy: tabs and split panes, markup, forms, signatures, page edits, comparing, Markdown, and the shortcuts that tie them together.",
  );
}

export function loader() {
  return loadGuideIndex();
}

export const headers: Route.HeadersFunction = () => CACHE_HEADERS;

export default function Guides({ loaderData }: Route.ComponentProps) {
  return (
    <main className="section guides">
      <div className="section__inner">
        <div className="section__header">
          <p className="section__label">Guides</p>
          <h1 className="section__title">The parts you haven&apos;t found yet.</h1>
          <p className="section__body">
            Clumsy keeps most of what it can do out of your face. That&apos;s
            the point, but it also means a lot of it goes unnoticed. These walk
            through each part: what it does, where it lives, and the shortcuts
            worth keeping.
          </p>
        </div>

        {loaderData.groups.map((group) => (
          <section key={group.title} className="guides__group" aria-label={group.title}>
            <h2 className="guides__group-title">{group.title}</h2>
            <ul className="guides__list">
              {group.guides.map((guide) => (
                <li key={guide.slug}>
                  <Link className="guide-card" to={`/guides/${guide.slug}`}>
                    <span className="guide-card__title">{guide.title}</span>
                    <span className="guide-card__summary">{guide.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
