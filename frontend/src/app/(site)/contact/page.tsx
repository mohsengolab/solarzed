import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import styles from "./contact.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
  title: t("Contact Us"),
  description:
    t("Contact Solarzed for warranty support, authorised installer inquiries, distribution partnerships and general product questions."),
  keywords: ["Solarzed contact", "warranty support", "authorised installer", "window film distributor"],
  alternates: { canonical: "https://solarzed.com/contact" },
  openGraph: {
    url: "https://solarzed.com/contact",
    title: t("Contact Us"),
    description: t("Contact Solarzed for warranty support, authorised installer inquiries, distribution partnerships and general product questions."),
  },
  };
}

export default async function ContactPage() {
  const t = await getT();
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.logo}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/solarzed-original.png" width={160} height={32} alt="SOLARZED" />
        </Link>
        <nav className={styles.nav}>
          <Link href="/products">{t("Products")}</Link>
          <Link href="/warranty">{t("Warranty")}</Link>
          <Link href="/coverage">{t("Coverage")}</Link>
          <Link href="/contact">{t("Contact")}</Link>
          <Link href="/activate" className={styles.navCta}>{t("Activate")}</Link>
        </nav>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <span className={styles.heroLabel}>{t("GET IN TOUCH")}</span>
          <h1 className={styles.heroTitle}>{t("Contact us")}</h1>
          <p className={styles.heroSub}>
            {t("Questions about your warranty, becoming an authorised installer, or distributor inquiries — we’re here.")}
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardIcon}>📋</div>
              <h2 className={styles.cardTitle}>{t("Warranty support")}</h2>
              <p className={styles.cardDesc}>
                {t("Check your warranty status or get help with a claim by looking up your certificate first.")}
              </p>
              <Link href="/warranty" className={styles.cardLink}>{t("Look up warranty →")}</Link>
            </div>

            <div className={styles.card}>
              <div className={styles.cardIcon}>🏪</div>
              <h2 className={styles.cardTitle}>{t("Authorised installers")}</h2>
              <p className={styles.cardDesc}>
                {t("Interested in becoming a SOLARZED authorised installer or distributor?")}
              </p>
              <a href="mailto:partners@solarzed.com" className={styles.cardLink}>partners@solarzed.com</a>
            </div>

            <div className={styles.card}>
              <div className={styles.cardIcon}>💬</div>
              <h2 className={styles.cardTitle}>{t("General enquiries")}</h2>
              <p className={styles.cardDesc}>
                {t("For any other questions about our products, coverage policies, or business.")}
              </p>
              <a href="mailto:info@solarzed.com" className={styles.cardLink}>info@solarzed.com</a>
            </div>

            <div className={styles.card}>
              <div className={styles.cardIcon}>📱</div>
              <h2 className={styles.cardTitle}>{t("Social")}</h2>
              <p className={styles.cardDesc}>
                {t("Follow us for product updates, installation tips, and coverage news.")}
              </p>
              <a href="https://instagram.com/solarzed_official" target="_blank" rel="noopener noreferrer" className={styles.cardLink}>@solarzed_official</a>
            </div>
          </div>
        </section>

        <section className={styles.noteSection}>
          <div className={styles.noteBox}>
            <strong>{t("Dealers & installers")}</strong>
            <p>
              {t("Dealers and installers sign in to their account with the mobile number SOLARZED sent their cartons to. Customers activate their warranty with the card inside the box.")}{" "}
              <Link href="/account">{t("Sign in to your account")}</Link>
            </p>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} SOLARZED</span>
        <nav className={styles.footerNav}>
          <Link href="/coverage">{t("Coverage policy")}</Link>
          <Link href="/warranty">{t("Check warranty")}</Link>
        </nav>
      </footer>
    </div>
  );
}
