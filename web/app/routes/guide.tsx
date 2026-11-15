import { data, Link } from "react-router";

import type { Route } from "./+types/guide";
import { PlatformChooser } from "~/components/PlatformChooser";
import { ThemeSlider } from "~/components/ThemeSlider";
import { SHOTS } from "~/lib/content";
import { loadGuide } from "~/lib/guides.server";
import { INSTALL } from "~/lib/links";
import { pageMeta } from "~/lib/meta";
import { CACHE_HEADERS } from "~/lib/remote.server";

export async function loader({ params }: Route.LoaderArgs) {
  const guide = await loadGuide(params.slug);
  if (!guide) throw data(null, { status: 404 });
  return guide;
}

export const headers: Route.HeadersFunction = () => CACHE_HEADERS;

export function meta({ loaderData }: Route.MetaArgs) {
  return loaderData
    ? pageMeta(`${loaderData.guide.title} · Clumsy guides`, loaderData.guide.summary)
    : pageMeta("Guides · Clumsy");
}

export default function Guide({ loaderData }: Route.ComponentProps) {
  const { guide, group, html, sections, previous, next } = loaderData;
  const shot = guide.image && SHOTS[guide.image];

  return (
    <main className="section guide">
      <div className="section__inner">
        <nav className="guide__crumbs" aria-label="Breadcrumb">
          <Link to="/guides">Guides</Link>
          <span aria-hidden="true">/</span>
          <span>{group}</span>
        </nav>

        <header className="section__header guide__header">
          <h1 className="section__title">{guide.title}</h1>
          <p className="section__body">{guide.summary}</p>
        </header>

        <div className="guide__layout">
          <article className="guide__article">
            {guide.image && shot && (
              <div className="window guide__shot">
                <ThemeSlider
                  image={guide.image}
                  alt={guide.imageAlt ?? ""}
                  width={shot.width}
                  height={shot.height}
                  priority
                />
              </div>
            )}
            <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
          </article>

          <aside className="guide__aside">
            <div className="guide__platform">
              <p className="guide__toc-title">Show this guide for</p>
              <PlatformChooser />
            </div>
            {sections.length > 1 && (
              <nav className="guide__toc" aria-label="On this page">
                <p className="guide__toc-title">On this page</p>
                <ul>
                  {sections.map((section) => (
                    <li key={section.id} className={section.only && `only-${section.only}`}>
                      <a href={`#${section.id}`}>{section.title}</a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </aside>
        </div>

        <nav className="guide__pager" aria-label="More guides">
          {previous ? (
            <Link className="guide-card guide__pager-link" to={`/guides/${previous.slug}`}>
              <span className="guide-card__summary">Previous</span>
              <span className="guide-card__title">{previous.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link className="guide-card guide__pager-link guide__pager-link--next" to={`/guides/${next.slug}`}>
              <span className="guide-card__summary">Next</span>
              <span className="guide-card__title">{next.title}</span>
            </Link>
          ) : (
            <a className="guide-card guide__pager-link guide__pager-link--next" href={INSTALL}>
              <span className="guide-card__summary">That&apos;s all of them</span>
              <span className="guide-card__title">Download Clumsy</span>
            </a>
          )}
        </nav>
      </div>
    </main>
  );
}
