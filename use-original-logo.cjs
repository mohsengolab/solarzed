const fs = require('fs');
const path = require('path');
const original = fs.readFileSync('dist/assets/solarzed-original.png');
// Embed the supplied artwork unchanged, trimming only transparent canvas in the SVG viewport.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="72 72 1456 178"><image width="1600" height="322" href="data:image/png;base64,${original.toString('base64')}"/></svg>`;
fs.writeFileSync('dist/assets/solarzed-logo-light.svg', svg);
for (const name of fs.readdirSync('dist').filter(n => n.endsWith('.html') && n !== 'showcase.html')) {
  const file = path.join('dist', name);
  let html = fs.readFileSync(file, 'utf8');
  html = html.replaceAll('assets/solarzed-logo-light.svg"', 'assets/solarzed-logo-light.svg?v=original1"');
  html = html.replaceAll('<span>SOLARZED</span><b>', '<img class="brand-photo-logo" src="assets/solarzed-logo-light.svg?v=original1" alt="SOLARZED"><b>');
  if (name === 'index.html' && !html.includes('class="hero-brand-stamp"')) {
    html = html.replace('</section><h1 class="sv-main-title">', '<div class="hero-brand-stamp"><img src="assets/solarzed-logo-light.svg?v=original1" alt="SOLARZED"></div></section><h1 class="sv-main-title">');
  }
  html = html.replaceAll('reference-theme.css?v=brand2', 'reference-theme.css?v=original1');
  fs.writeFileSync(file, html);
}
fs.appendFileSync('dist/reference-theme.css', `\n/* Original supplied transparent logo: retain artwork and proportions. */
:root{--sv-navy:#1c2951;--sv-teal:#25bad0}
.brand-photo-logo{display:block;width:220px;max-width:100%;height:auto;margin-bottom:24px}
.hero-brand-stamp{position:absolute;left:32px;bottom:25px;background:#1c2951;padding:14px 18px;z-index:3}
.hero-brand-stamp img{display:block;width:200px;height:auto}
.sv-digital-badge,.sv-contact-visual{background:#1c2951}
.sv-intro figure>img{background:#fff}
@media(max-width:600px){.hero-brand-stamp{left:16px;bottom:12px;padding:10px 12px}.hero-brand-stamp img{width:140px}}
`);
console.log('Original logo installed in page headers, footers and photo badges.');
