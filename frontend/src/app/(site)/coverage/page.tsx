import Link from "next/link";
import styles from "./coverage.module.css";

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

export default function CoveragePage() {
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
          <span className={styles.heroLabel}>WARRANTY POLICY</span>
          <h1 className={styles.heroTitle}>What&rsquo;s Covered</h1>
          <p className={styles.heroSub}>
            SOLARZED films carry a manufacturer&rsquo;s warranty against material and adhesive defects.
            Coverage duration is set at installation and shown on your warranty certificate.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardBadge}>Window Tint</div>
              <h2 className={styles.cardTitle}>Tint film coverage</h2>
              <ul className={styles.itemList}>
                {TINT_ITEMS.map(item => (
                  <li key={item.title} className={styles.item}>
                    <span className={styles.itemIcon}>✓</span>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.card}>
              <div className={styles.cardBadge}>PPF</div>
              <h2 className={styles.cardTitle}>Paint protection film coverage</h2>
              <ul className={styles.itemList}>
                {PPF_ITEMS.map(item => (
                  <li key={item.title} className={styles.item}>
                    <span className={styles.itemIcon}>✓</span>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className={styles.notCoveredSection}>
          <h2 className={styles.sectionTitle}>Not covered</h2>
          <ul className={styles.notCoveredList}>
            {NOT_COVERED.map(item => (
              <li key={item} className={styles.notCoveredItem}>
                <span className={styles.xIcon}>✕</span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.claimSection}>
          <h2 className={styles.claimTitle}>How to make a warranty claim</h2>
          <ol className={styles.stepList}>
            <li className={styles.step}>
              <span className={styles.stepNum}>01</span>
              <div>
                <strong>Look up your warranty</strong>
                <p>Go to the <Link href="/warranty">Warranty page</Link> and enter your warranty code, VIN, or phone number.</p>
              </div>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum}>02</span>
              <div>
                <strong>Contact your installer</strong>
                <p>Bring your vehicle and warranty certificate to the authorised installer who performed the installation.</p>
              </div>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum}>03</span>
              <div>
                <strong>Assessment &amp; resolution</strong>
                <p>Our team will assess the defect. Covered claims are resolved by repair or replacement of the affected film section.</p>
              </div>
            </li>
          </ol>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} SOLARZED</span>
        <nav className={styles.footerNav}>
          <Link href="/contact">Contact</Link>
          <Link href="/warranty">Check warranty</Link>
        </nav>
      </footer>
    </div>
  );
}
