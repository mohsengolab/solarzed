/* eslint-disable @next/next/no-img-element -- markup mirrors the original static homepage */
import type { Metadata } from "next";
import Link from "next/link";
import HomeMotion from "./HomeMotion";
import UvRays from "./UvRays";
import SiteHeader, { SiteFooter } from "./_shared/SiteHeader";

export const metadata: Metadata = {
  title: "Solarzed Window Films | Automotive Tint & PPF Warranty",
  description:
    "Solarzed premium automotive window film and paint protection film. Register your installation, verify your warranty certificate, and explore window tint and PPF series.",
  alternates: { canonical: "https://solarzed.com" },
  openGraph: {
    url: "https://solarzed.com",
    title: "Solarzed Window Films | Automotive Tint & PPF Warranty",
    description: "Premium automotive window film and PPF. Digital warranty certificates, traceable serials and 5-window installation maps.",
  },
};

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

const MARQUEE = [
  "FILM WARRANTY", "INSTALLATION WARRANTY", "DIGITAL CERTIFICATE",
  "TRACEABLE SERIALS", "FIVE-WINDOW MAP", "DEALER NETWORK",
];

export default function HomePage() {
  return (
    <div className="sv-home">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <SiteHeader />

      <main>
        <section className="sz-hero" aria-label="Solarzed window films">
          <canvas className="sz-particles" aria-hidden="true" />
          <div className="sz-hero-bg" aria-hidden="true" />
          <div className="sz-hero-inner">
            <div className="sz-hero-copy">
              <span className="sz-kicker">WINDOW FILMS &amp; PAINT PROTECTION</span>
              <h1 className="sz-hero-title">Solarzed<br /><span>Window Films</span></h1>
              <p>Premium automotive film, installed with precision — and a verified digital record for every window you tint.</p>
              <div className="sz-hero-actions">
                <Link className="sv-button" href="/register">Register installation <i>↗</i></Link>
                <Link className="sz-ghost" href="/warranty">Check warranty</Link>
              </div>
            </div>
            <div className="sz-hero-visual">
              <div className="sz-car-wrap">
                <img src="/assets/car.webp" width={1545} height={1018} alt="Vehicle with Solarzed window film" className="sz-car" fetchPriority="high" />
                <span className="sz-glare" aria-hidden="true" />
                <UvRays />
                <span className="sz-glass-tag">UV WINDOW FILM<small>Glass protection</small></span>
                <span className="sz-body-tag">CERAMIC COATING<small>Body protection</small></span>
              </div>
              <div className="sz-car-floor" aria-hidden="true" />
            </div>
          </div>
          <div className="sz-hero-strip">
            <div><b>3</b><span>Warranty areas</span></div>
            <div><b>5</b><span>Windows mapped</span></div>
            <div><b>1</b><span>Tracking code</span></div>
            <div><b>24/7</b><span>Online lookup</span></div>
          </div>
          <a className="sz-scroll" href="#about" aria-label="Scroll to content"><span /></a>
        </section>

        <div className="sz-marquee" aria-hidden="true">
          <div>
            {[...MARQUEE, ...MARQUEE].map((t, i) => <span key={i}>{t}</span>)}
          </div>
        </div>

        <section className="sv-intro sv-container" id="about">
          <div className="sv-intro-copy">
            <h2>Window films for your vehicle.<br />A clear record for every installation.</h2>
            <div className="sv-feature">
              <span>ϟ</span>
              <div>
                <h3>Comfort and protection</h3>
                <p>Explore automotive window tint and keep the film model, roll serial and installed glass documented for your vehicle.</p>
              </div>
            </div>
            <div className="sv-feature">
              <span>ϟ</span>
              <div>
                <h3>Traceable installation</h3>
                <p>From the left and right side windows to the rear windshield, record exactly where your Solarzed film was installed and who completed the work.</p>
              </div>
            </div>
            <Link className="sv-button" href="/coverage">Learn more</Link>
          </div>
          <figure>
            <img src="/assets/solarzed-box.jpg" alt="Solarzed original product packaging" loading="lazy" />
            <figcaption>Solarzed original packaging</figcaption>
          </figure>
        </section>

        <section className="sv-facts">
          <div className="sv-facts-inner">
            <h2>A closer look at Solarzed</h2>
            <p>Product, installation and documentation — connected.</p>
            <div className="sv-fact-grid">
              <div><strong>3 <span>Warranty areas</span></strong><p>Film, installation and digital documentation</p></div>
              <div><strong>5 <span>Windows</span></strong><p>Choose the exact glass that was tinted</p></div>
              <div><strong>1 <span>Tracking code</span></strong><p>Find your registered installation record</p></div>
              <div><strong>2 <span>Coverage periods</span></strong><p>Film and installation terms defined separately</p></div>
            </div>
          </div>
        </section>

        <section className="sv-warranties" id="warranty-types">
          <div className="sv-section-title" id="films">
            <h2>The Solarzed Warranty</h2>
            <p>Three connected parts.<br />Clear terms for the film, the installation<br />and the record that brings them together.</p>
          </div>
          <div className="sv-image-cards">
            <article className="sv-photo-card sv-card-film">
              <img src="/assets/dominate.jpg" alt="Automotive window film vehicle" loading="lazy" />
              <div className="sv-card-copy">
                <span>01 / FILM</span>
                <h3>Film Warranty</h3>
                <p>For confirmed product defects under normal use, assessed against the applicable film model and approved warranty terms.</p>
                <Link className="sv-button" href="/coverage#film">LEARN MORE</Link>
              </div>
            </article>
            <article className="sv-photo-card sv-card-install">
              <img src="/assets/matrix.jpg" alt="Paint protection film vehicle" loading="lazy" />
              <div className="sv-card-copy">
                <span>02 / INSTALLATION</span>
                <h3>Installation Warranty</h3>
                <p>For verified workmanship issues, with conditions and coverage periods separate from the film itself.</p>
                <Link className="sv-button" href="/coverage#installation">LEARN MORE</Link>
              </div>
            </article>
            <article className="sv-photo-card sv-card-digital">
              <img src="/assets/phantom.jpg" alt="Tinted vehicle" loading="lazy" />
              <div className="sv-digital-badge">
                <img className="brand-photo-logo" src="/assets/solarzed-original.png" alt="SOLARZED" />
                <b>DIGITAL<br />WARRANTY</b>
                <small>YOUR VEHICLE. YOUR INSTALLATION RECORD.</small>
              </div>
              <div className="sv-card-copy">
                <span>03 / DIGITAL</span>
                <h3>Digital Warranty</h3>
                <p>A connected certificate for the product, vehicle, original customer and warranty status — with one place to find the details.</p>
                <Link className="sv-button" href="/coverage#digital">LEARN MORE</Link>
              </div>
            </article>
          </div>
          <p className="sv-policy-caption">Proposed policy v1.0. Product-specific coverage periods remain subject to approval. Registration does not by itself activate warranty coverage.</p>
        </section>

        <section className="window-story">
          <div className="wrap window-story-grid">
            <div className="window-illustration" aria-hidden="true">
              <div className="glass-sheet sheet-back" />
              <div className="glass-sheet sheet-middle" />
              <div className="glass-sheet sheet-front"><span>SZ / WINDOW FILM</span><b>Clarity,<br />layer by layer.</b></div>
              <span className="illustration-caption">THE DETAILS MAKE THE DIFFERENCE.</span>
            </div>
            <div className="window-story-copy">
              <div className="eyebrow">02 / PRECISE BY DESIGN</div>
              <h2>Not just the car.<br /><span>The exact glass.</span></h2>
              <p className="intro">Left front. Right rear. The back windshield. The hood and every panel.<br />Every installation is different. Record exactly what was covered, and keep the complete picture in one place.</p>
              <ul className="feature-list">
                <li><span>01</span> Interactive selection of all five windows</li>
                <li><span>02</span> Twelve-panel map for paint protection film</li>
                <li><span>03</span> Vehicle, VIN, product and installer details</li>
              </ul>
              <Link className="text-link" href="/register">Explore dealer registration <span>→</span></Link>
            </div>
          </div>
        </section>

        <section className="sv-registration">
          <div className="sv-container">
            <div>
              <h2>Your installation.<br />Clearly registered.</h2>
              <p>Choose your next step.</p>
            </div>
            <div className="sv-registration-actions">
              <Link href="/register"><b>Register warranty</b><span>For sellers &amp; installers</span><i>↗</i></Link>
              <Link href="/warranty"><b>Check warranty</b><span>Find your installation by code</span><i>↗</i></Link>
            </div>
          </div>
        </section>

        <section className="sv-contact sv-container">
          <div>
            <h2>Let’s get in touch</h2>
            <p>For product information, installation records<br />and warranty guidance.</p>
            <Link className="sv-button" href="/contact">CONTACT SOLARZED</Link>
          </div>
          <div className="sv-contact-visual">
            <img className="brand-photo-logo" src="/assets/solarzed-original.png" alt="SOLARZED" />
            <b>WINDOW FILMS<br />WITH A CLEAR RECORD.</b>
            <p>Film · Installation · Digital warranty</p>
          </div>
        </section>
      </main>

      <SiteFooter />

      <HomeMotion />
    </div>
  );
}
