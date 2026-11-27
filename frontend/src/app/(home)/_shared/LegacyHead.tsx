// The homepage and product pages keep the original static-site stylesheets verbatim
// (public/legacy). Both the home/products root layout and the /fa, /ar root layout load them.
const LEGACY_CSS = [
  "style", "warranty", "solarzed", "presentation", "reference-theme", "polish", "protection",
];
// Bump when lang.css or rtl.css change: /legacy files are cached for a day.
const LANG_CSS_VERSION = "6";

// Vazirmatn is only downloaded by pages that show Persian or Arabic text.
const FONTS = "family=Vazirmatn:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800";

/** rtl.css only applies inside dir="rtl", so the shared stylesheet also supports localized product pages. */
export default function LegacyHead() {
  return (
    <head>
      {LEGACY_CSS.slice(0, 5).map(name => (
        <link key={name} rel="stylesheet" href={`/legacy/${name}.css`} />
      ))}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?${FONTS}&display=swap`} />
      {LEGACY_CSS.slice(5).map(name => (
        <link key={name} rel="stylesheet" href={`/legacy/${name}.css`} />
      ))}
      <link rel="stylesheet" href={`/legacy/lang.css?v=${LANG_CSS_VERSION}`} />
      <link rel="stylesheet" href={`/legacy/rtl.css?v=${LANG_CSS_VERSION}`} />
    </head>
  );
}
