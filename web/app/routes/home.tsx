import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import type { Route } from "./+types/home";
import { SignatureSpotlight } from "~/components/SignatureSpotlight";
import { ThemeSlider } from "~/components/ThemeSlider";
import { SCREENS, type ScreenId } from "~/lib/content";
import { loadFeatures } from "~/lib/features.server";
import { CHECKOUT, DOWNLOAD, GITHUB, SUPPORT_PRICE } from "~/lib/links";
import { CACHE_HEADERS } from "~/lib/remote.server";
import { useVersion } from "~/lib/useVersion";
import { pageMeta } from "~/lib/meta";

export function loader() {
  return loadFeatures();
}

export const headers: Route.HeadersFunction = () => CACHE_HEADERS;

export function meta(_args: Route.MetaArgs) {
  return pageMeta("Clumsy · A small, fast PDF (and Markdown) viewer for Mac");
}

function Showcase() {
  const [active, setActive] = useState<ScreenId>("compare");
  const current = SCREENS.find((screen) => screen.id === active) ?? SCREENS[0];

  return (
    <section className="section" id="screenshots" aria-labelledby="showcase-title">
      <div className="section__inner">
        <div className="section__header">
          <p className="section__label">In the app</p>
          <h2 id="showcase-title" className="section__title">
            Does the PDF things. Skips the circus.
          </h2>
        </div>

        <div className="showcase__tabs" role="tablist" aria-label="App screenshots">
          {SCREENS.map((screen) => (
            <button
              key={screen.id}
              type="button"
              role="tab"
              id={`tab-${screen.id}`}
              aria-selected={active === screen.id}
              aria-controls={`panel-${screen.id}`}
              className={`showcase__tab${active === screen.id ? " showcase__tab--active" : ""}`}
              onClick={() => setActive(screen.id)}
            >
              {screen.label}
            </button>
          ))}
        </div>

        <figure
          className="showcase__frame"
          role="tabpanel"
          id={`panel-${current.id}`}
          aria-labelledby={`tab-${current.id}`}
        >
          <div className="window">
            <ThemeSlider
              image={current.image}
              alt={`Clumsy ${current.label} view`}
              width={current.width}
              height={current.height}
            />
          </div>
          <figcaption className="showcase__caption">{current.caption}</figcaption>
        </figure>
      </div>
    </section>
  );
}

function SupportButton() {
  return (
    <form method="post" action={CHECKOUT} className="support-form">
      <button type="submit" className="btn btn--primary">
        Support for {SUPPORT_PRICE}
      </button>
    </form>
  );
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const version = useVersion();
  const [searchParams] = useSearchParams();
  const checkoutFailed = searchParams.get("checkout") === "failed";

  useEffect(() => {
    if (checkoutFailed) document.getElementById("download")?.scrollIntoView();
  }, [checkoutFailed]);
  return (
    <main>
      <header className="hero">
        <div className="hero__glow" aria-hidden="true" />
        <div className="hero__inner">
          <img
            className="hero__icon"
            src="/icon.png"
            alt=""
            width={128}
            height={128}
          />
          <p className="hero__brand">Clumsy</p>
          <h1 className="hero__title">No tricks, no acrobatics.</h1>
          <p className="hero__lede">
            A small, fast PDF (and Markdown) viewer. Search, highlight, comment,
            fill forms, and sign with a real certificate, saved straight back
            into the file.
          </p>
          <div className="hero__actions">
            <SupportButton />
            <a className="btn btn--secondary" href={DOWNLOAD}>
              Free download
            </a>
          </div>
          <p className="hero__note">
            Free and open source · v{version} · Apple Silicon and Intel
          </p>
          <p className="hero__note hero__note--tight">
            The {SUPPORT_PRICE} is optional. Same app either way.
          </p>
        </div>

        <div className="hero__window window">
          <ThemeSlider
            image="reading"
            alt="Clumsy showing a PDF with page thumbnails and the Document Map"
            width={1220}
            height={960}
            priority
          />
        </div>
      </header>

      <section className="section" id="features" aria-labelledby="features-title">
        <div className="section__inner">
          <div className="section__header">
            <p className="section__label">What it does</p>
            <h2 id="features-title" className="section__title">
              Everything you open a PDF for.
            </h2>
            <p className="section__body">
              Reading, markup, forms, digital signatures, page edits, and comparisons,
              in a viewer that opens before you finish double-clicking.
            </p>
          </div>

          <div className="features">
            {loaderData.features.map((feature) => (
              <article key={feature.title} className="feature">
                <h3 className="feature__title">{feature.title}</h3>
                <ul className="feature__list">
                  {feature.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <SignatureSpotlight />

      <Showcase />

      <section className="section" id="keyboard" aria-labelledby="keyboard-title">
        <div className="section__inner">
          <div className="section__header">
            <p className="section__label">Keyboard first</p>
            <h2 id="keyboard-title" className="section__title">
              Your hands can stay where they are.
            </h2>
            <p className="section__body">
              Shortcuts follow VS Code&apos;s wherever a PDF viewer has an
              equivalent. <kbd>⌘</kbd> <kbd>K</kbd> lists every one of them.
            </p>
          </div>

          <ul className="shortcuts">
            {loaderData.shortcuts.map((shortcut) => (
              <li key={shortcut.label} className="shortcut">
                <span className="shortcut__keys">
                  {shortcut.keys.map((key) => (
                    <kbd key={key}>{key}</kbd>
                  ))}
                </span>
                <span>
                  <strong className="shortcut__label">{shortcut.label}</strong>
                  <span className="shortcut__note">{shortcut.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section" id="tour" aria-labelledby="tour-title">
        <div className="section__inner">
          <div className="section__header">
            <p className="section__label">Tour</p>
            <h2 id="tour-title" className="section__title">
              Clumsy, in a minute.
            </h2>
          </div>
          <div className="tour">
            <video
              className="tour__video"
              controls
              playsInline
              preload="none"
              poster="/media/clumsy-infomercial.webp"
              width={1920}
              height={1080}
            >
              <source src="/media/clumsy-infomercial.mp4" type="video/mp4" />
            </video>
          </div>
        </div>
      </section>

      <section className="section" id="download" aria-labelledby="download-title">
        <div className="section__inner">
          <div className="download">
            <div>
              <p className="section__label">Download</p>
              <h2 id="download-title" className="section__title">
                Get Clumsy {version}
              </h2>
              <p className="section__body">
                One universal build for Apple Silicon and Intel, signed and
                notarized. After that, Clumsy updates itself: it offers each new
                version and installs it in place. Windows and Linux are planned.
              </p>
              <p className="section__body">
                Clumsy is free and always will be, and the source is on GitHub.
                If it saves you a headache, you can chip in {SUPPORT_PRICE}. You
                get the same app, plus our thanks.
              </p>
              {checkoutFailed && (
                <p className="download__error" role="alert">
                  Checkout didn&apos;t open. Try again in a minute, or just take
                  the free download.
                </p>
              )}
            </div>
            <div className="download__actions">
              <SupportButton />
              <a className="btn btn--secondary" href={DOWNLOAD}>
                Free download
              </a>
              <a className="btn btn--ghost" href={`${GITHUB}/releases/latest`}>
                All release files
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
