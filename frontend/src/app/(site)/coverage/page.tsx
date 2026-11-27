import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import styles from "./coverage.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
  title: t("What's Covered | Warranty Policy"),
  description:
    t("Solarzed window film and PPF warranty coverage. Learn what is covered — UV rejection, delamination, adhesive failure — and how to make a warranty claim."),
  keywords: ["window film warranty coverage", "PPF warranty", "automotive tint claim", "Solarzed warranty policy"],
  alternates: { canonical: "https://solarzed.com/coverage" },
  openGraph: {
    url: "https://solarzed.com/coverage",
    title: t("What's Covered | Warranty Policy"),
    description: t("Solarzed window film and PPF warranty coverage. Learn what is covered — UV rejection, delamination, adhesive failure — and how to make a warranty claim."),
  },
  };
}

const TINT_ITEMS = [
  { title: "UV & heat rejection", desc: "Film blocks 99% of UV and reduces interior heat." },
  { title: "Colour integrity", desc: "No bubbling, peeling, or discolouration under normal use." },
  { title: "Adhesive failure", desc: "Delamination from factory-defective adhesive." },
  { title: "Optical clarity", desc: "Hazing, streaking, or significant visual distortion." },
];

const PPF_ITEMS = [
  { title: "Self-healing", desc: "Surface micro-scratches disappear at ambient temperature." },
  { title: "Yellowing & hazing", desc: "Film remains optically clear without yellowing." },
  { title: "Delamination", desc: "Film lifting or peeling from factory adhesive failure." },
  { title: "Edge lifting", desc: "Edges remain flush without lifting under normal conditions." },
];

const NOT_COVERED = [
  "Damage caused by improper washing, chemical cleaners, or abrasives",
  "Physical impact, scratches, or stone chips after installation",
  "Improper installation by non-authorised installers",
  "Modifications, cuts, or repairs by third parties",
  "Normal wear on high-contact areas (door handles, edges)",
  "Damage from parking impacts, accidents, or vandalism",
];

export default async function CoveragePage() {
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
          <span className={styles.heroLabel}>{t("WARRANTY POLICY")}</span>
          <h1 className={styles.heroTitle}>{t("What’s Covered")}</h1>
          <p className={styles.heroSub}>
            {t("SOLARZED films carry a manufacturer’s warranty against material and adhesive defects. Coverage duration is set at installation and shown on your warranty certificate.")}
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardBadge}>{t("Window Tint")}</div>
              <h2 className={styles.cardTitle}>{t("Tint film coverage")}</h2>
              <ul className={styles.itemList}>
                {TINT_ITEMS.map(item => (
                  <li key={item.title} className={styles.item}>
                    <span className={styles.itemIcon}>✓</span>
                    <div>
                      <strong>{t(item.title)}</strong>
                      <p>{t(item.desc)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.card}>
              <div className={styles.cardBadge}>PPF</div>
              <h2 className={styles.cardTitle}>{t("Paint protection film coverage")}</h2>
              <ul className={styles.itemList}>
                {PPF_ITEMS.map(item => (
                  <li key={item.title} className={styles.item}>
                    <span className={styles.itemIcon}>✓</span>
                    <div>
                      <strong>{t(item.title)}</strong>
                      <p>{t(item.desc)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className={styles.notCoveredSection}>
          <h2 className={styles.sectionTitle}>{t("Not covered")}</h2>
          <ul className={styles.notCoveredList}>
            {NOT_COVERED.map(item => (
              <li key={item} className={styles.notCoveredItem}>
                <span className={styles.xIcon}>✕</span>
                {t(item)}
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.claimSection}>
          <h2 className={styles.claimTitle}>{t("How to make a warranty claim")}</h2>
          <ol className={styles.stepList}>
            <li className={styles.step}>
              <span className={styles.stepNum}>01</span>
              <div>
                <strong>{t("Look up your warranty")}</strong>
                <p>{t("Go to the Warranty page and enter your VIN or mobile number.")} <Link href="/warranty">{t("Warranty page")}</Link></p>
              </div>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum}>02</span>
              <div>
                <strong>{t("Contact your installer")}</strong>
                <p>{t("Bring your vehicle and warranty certificate to the authorised installer who performed the installation.")}</p>
              </div>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum}>03</span>
              <div>
                <strong>{t("Assessment & resolution")}</strong>
                <p>{t("Our team will assess the defect. Covered claims are resolved by repair or replacement of the affected film section.")}</p>
              </div>
            </li>
          </ol>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} SOLARZED</span>
        <nav className={styles.footerNav}>
          <Link href="/contact">{t("Contact")}</Link>
          <Link href="/warranty">{t("Check warranty")}</Link>
        </nav>
      </footer>
    </div>
  );
}
