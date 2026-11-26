/* eslint-disable @next/next/no-img-element -- markup mirrors the original static homepage */
import { Fragment } from "react";
import Link from "next/link";
import HomeMotion from "../HomeMotion";
import UvRays from "../UvRays";
import SiteHeader, { SiteFooter } from "./SiteHeader";
import { LANDING, type LandingLang } from "./landingCopy";

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Solarzed",
  url: "https://solarzed.com",
  logo: "https://solarzed.com/assets/solarzed-logo.svg",
  sameAs: ["https://instagram.com/solarzed_official"],
  contactPoint: {
    "@type": "ContactPoint",
    email: "info@solarzed.com",
    contactType: "customer service",
  },
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Solarzed",
  url: "https://solarzed.com",
  potentialAction: {
    "@type": "SearchAction",
    target: { "@type": "EntryPoint", urlTemplate: "https://solarzed.com/warranty?q={search_term_string}" },
    "query-input": "required name=search_term_string",
  },
};

/** Lines joined with <br />, as the original markup breaks them. */
const lines = (parts: readonly string[]) =>
  parts.map((part, i) => <Fragment key={i}>{i > 0 && <br />}{part}</Fragment>);

const CARD_STYLE = [
  { className: "sv-card-film", img: "/assets/dominate.jpg", alt: "Automotive window film vehicle", href: "/coverage#film" },
  { className: "sv-card-install", img: "/assets/matrix.jpg", alt: "Paint protection film vehicle", href: "/coverage#installation" },
  { className: "sv-card-digital", img: "/assets/phantom.jpg", alt: "Tinted vehicle", href: "/coverage#digital" },
];
const ACTION_HREFS = ["/activate", "/warranty", "/account"];

/** The landing page body, shared by "/" (English), "/fa" and "/ar". */
export default function HomeContent({ lang }: { lang: LandingLang }) {
  const t = LANDING[lang];
  const { hero, intro, facts, warranties, story, registration, contact } = t;
  return (
    <div className="sv-home">
      {lang === "en" && <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
      </>}
      <SiteHeader lang={lang} />

      <main>
        <section className="sz-hero" aria-label={`${hero.brand} ${hero.title}`}>
          <canvas className="sz-particles" aria-hidden="true" />
          <div className="sz-hero-bg" aria-hidden="true" />
          <div className="sz-hero-inner">
            <div className="sz-hero-copy">
              <span className="sz-kicker">{hero.kicker}</span>
              <h1 className="sz-hero-title">{hero.brand}<br /><span>{hero.title}</span></h1>
              <p>{hero.text}</p>
              <div className="sz-hero-actions">
                <Link className="sv-button" href="/activate">{hero.activate} <i>↗</i></Link>
                <Link className="sz-ghost" href="/warranty">{hero.check}</Link>
              </div>
            </div>
            <div className="sz-hero-visual">
              <div className="sz-car-wrap">
                <img src="/assets/car.webp" width={1545} height={1018} alt={hero.carAlt} className="sz-car" fetchPriority="high" />
                <span className="sz-glare" aria-hidden="true" />
                <UvRays />
                <span className="sz-glass-tag">{hero.glass[0]}<small>{hero.glass[1]}</small></span>
                <span className="sz-body-tag">{hero.body[0]}<small>{hero.body[1]}</small></span>
              </div>
              <div className="sz-car-floor" aria-hidden="true" />
            </div>
          </div>
          <div className="sz-hero-strip">
            {hero.stats.map(([value, label]) => <div key={label}><b>{value}</b><span>{label}</span></div>)}
          </div>
          <a className="sz-scroll" href="#about" aria-label={hero.scroll}><span /></a>
        </section>

        <div className="sz-marquee" aria-hidden="true">
          <div>
            {[...t.marquee, ...t.marquee].map((text, i) => <span key={i}>{text}</span>)}
          </div>
        </div>

        <section className="sv-intro sv-container" id="about">
          <div className="sv-intro-copy">
            <h2>{lines(intro.title)}</h2>
            {intro.features.map(([title, text]) => (
              <div className="sv-feature" key={title}>
                <span>ϟ</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </div>
            ))}
            <Link className="sv-button" href="/coverage">{intro.more}</Link>
          </div>
          <figure>
            <img src="/assets/solarzed-box.jpg" alt={intro.boxAlt} loading="lazy" />
            <figcaption>{intro.boxCaption}</figcaption>
          </figure>
        </section>

        <section className="sv-facts">
          <div className="sv-facts-inner">
            <h2>{facts.title}</h2>
            <p>{facts.text}</p>
            <div className="sv-fact-grid">
              {facts.items.map(([value, label, text]) => (
                <div key={label}><strong>{value} <span>{label}</span></strong><p>{text}</p></div>
              ))}
            </div>
          </div>
        </section>

        <section className="sv-warranties" id="warranty-types">
          <div className="sv-section-title" id="films">
            <h2>{warranties.title}</h2>
            <p>{lines(warranties.text)}</p>
          </div>
          <div className="sv-image-cards">
            {warranties.cards.map((card, i) => {
              const style = CARD_STYLE[i];
              return (
                <article className={`sv-photo-card ${style.className}`} key={style.className}>
                  <img src={style.img} alt={style.alt} loading="lazy" />
                  {i === 2 && (
                    <div className="sv-digital-badge">
                      <img className="brand-photo-logo" src="/assets/solarzed-original.png" alt="SOLARZED" />
                      <b>{warranties.digitalBadge[0]}<br />{warranties.digitalBadge[1]}</b>
                      <small>{warranties.digitalBadge[2]}</small>
                    </div>
                  )}
                  <div className="sv-card-copy">
                    <span>{card.tag}</span>
                    <h3>{card.title}</h3>
                    <p>{card.text}</p>
                    <Link className="sv-button" href={style.href}>{warranties.learnMore}</Link>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="sv-policy-caption">{warranties.caption}</p>
        </section>

        <section className="window-story">
          <div className="wrap window-story-grid">
            <div className="window-illustration" aria-hidden="true">
              <div className="glass-sheet sheet-back" />
              <div className="glass-sheet sheet-middle" />
              <div className="glass-sheet sheet-front"><span>{story.sheet}</span><b>{lines(story.sheetTitle)}</b></div>
              <span className="illustration-caption">{story.caption}</span>
            </div>
            <div className="window-story-copy">
              <div className="eyebrow">{story.eyebrow}</div>
              <h2>{story.title[0]}<br /><span>{story.title[1]}</span></h2>
              <p className="intro">{lines(story.intro)}</p>
              <ul className="feature-list">
                {story.features.map((text, i) => <li key={text}><span>{String(i + 1).padStart(2, "0")}</span> {text}</li>)}
              </ul>
              <Link className="text-link" href="/account">{story.dealer} <span>{lang === "en" ? "→" : "←"}</span></Link>
            </div>
          </div>
        </section>

        <section className="sv-registration">
          <div className="sv-container">
            <div>
              <h2>{lines(registration.title)}</h2>
              <p>{registration.text}</p>
            </div>
            <div className="sv-registration-actions">
              {registration.actions.map(([title, text], i) => (
                <Link href={ACTION_HREFS[i]} key={ACTION_HREFS[i]}><b>{title}</b><span>{text}</span><i>↗</i></Link>
              ))}
            </div>
          </div>
        </section>

        <section className="sv-contact sv-container">
          <div>
            <h2>{contact.title}</h2>
            <p>{lines(contact.text)}</p>
            <Link className="sv-button" href="/contact">{contact.button}</Link>
          </div>
          <div className="sv-contact-visual">
            <img className="brand-photo-logo" src="/assets/solarzed-original.png" alt="SOLARZED" />
            <b>{lines(contact.visual)}</b>
            <p>{contact.visualText}</p>
          </div>
        </section>
      </main>

      <SiteFooter lang={lang} />

      <HomeMotion />
    </div>
  );
}
