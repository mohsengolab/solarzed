import type { Metadata } from "next";
import Link from "next/link";
import styles from "./contact.module.css";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Contact Solarzed for warranty support, authorised installer inquiries, distribution partnerships and general product questions.",
  keywords: ["Solarzed contact", "warranty support", "authorised installer", "window film distributor"],
  alternates: { canonical: "https://solarzed.com/contact" },
  openGraph: {
    url: "https://solarzed.com/contact",
    title: "Contact Solarzed | Warranty & Installer Inquiries",
    description: "Contact Solarzed for warranty support, installer inquiries and product questions.",
  },
};

export default function ContactPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.logo}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/solarzed-original.png" width={160} height={32} alt="SOLARZED" />
        </Link>
        <nav className={styles.nav}>
          <Link href="/products">Products</Link>
          <Link href="/warranty">Warranty</Link>
          <Link href="/coverage">Coverage</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/register" className={styles.navCta}>Register</Link>
        </nav>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <span className={styles.heroLabel}>GET IN TOUCH</span>
          <h1 className={styles.heroTitle}>Contact us</h1>
          <p className={styles.heroSub}>
            Questions about your warranty, becoming an authorised installer, or distributor inquiries — we&rsquo;re here.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardIcon}>📋</div>
              <h2 className={styles.cardTitle}>Warranty support</h2>
              <p className={styles.cardDesc}>
                Check your warranty status or get help with a claim by looking up your certificate first.
              </p>
              <Link href="/warranty" className={styles.cardLink}>Look up warranty →</Link>
            </div>

            <div className={styles.card}>
              <div className={styles.cardIcon}>🏪</div>
              <h2 className={styles.cardTitle}>Authorised installers</h2>
              <p className={styles.cardDesc}>
                Interested in becoming a SOLARZED authorised installer or distributor?
              </p>
              <a href="mailto:partners@solarzed.com" className={styles.cardLink}>partners@solarzed.com</a>
            </div>

            <div className={styles.card}>
              <div className={styles.cardIcon}>💬</div>
              <h2 className={styles.cardTitle}>General enquiries</h2>
              <p className={styles.cardDesc}>
                For any other questions about our products, coverage policies, or business.
              </p>
              <a href="mailto:info@solarzed.com" className={styles.cardLink}>info@solarzed.com</a>
            </div>

            <div className={styles.card}>
              <div className={styles.cardIcon}>📱</div>
              <h2 className={styles.cardTitle}>Social</h2>
              <p className={styles.cardDesc}>
                Follow us for product updates, installation tips, and coverage news.
              </p>
              <a href="https://instagram.com/solarzed_official" target="_blank" rel="noopener noreferrer" className={styles.cardLink}>@solarzed_official</a>
            </div>
          </div>
        </section>

        <section className={styles.noteSection}>
          <div className={styles.noteBox}>
            <strong>Installer registration</strong>
            <p>
              If you&rsquo;re an authorised installer, register customer warranties through the{" "}
              <Link href="/register">installer registration portal</Link>.
              For admin access to the portal, contact your SOLARZED regional representative.
            </p>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} SOLARZED</span>
        <nav className={styles.footerNav}>
          <Link href="/coverage">Coverage policy</Link>
          <Link href="/warranty">Check warranty</Link>
        </nav>
      </footer>
    </div>
  );
}
