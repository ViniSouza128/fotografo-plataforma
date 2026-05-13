const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const brandDir = path.join(process.cwd(), 'public', 'brand');
const principalPath = path.join(brandDir, 'source-symbol-principal.svg');
const darkPath = path.join(brandDir, 'source-symbol-dark.svg');

function readSvg(filename) {
  return fs.readFileSync(filename, 'utf8').trim();
}

function encodeSvg(svg) {
  return Buffer.from(svg).toString('base64');
}

function writeText(filename, content) {
  fs.writeFileSync(path.join(brandDir, filename), `${content}\n`, 'utf8');
}

function renderPng(svg, width, height, filename) {
  return sharp(Buffer.from(svg)).resize(width, height).png().toFile(path.join(brandDir, filename));
}

function buildFaviconSvg(encodedDark) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#111418" />
      <stop offset="100%" stop-color="#1b2228" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000000" flood-opacity="0.32" />
    </filter>
  </defs>
  <rect width="512" height="512" rx="132" fill="url(#bg)" />
  <rect x="58" y="58" width="396" height="396" rx="104" fill="#0d1116" stroke="#2b3339" stroke-width="4" />
  <g filter="url(#shadow)">
    <image href="data:image/svg+xml;base64,${encodedDark}" x="84" y="120" width="344" height="258" preserveAspectRatio="xMidYMid meet" />
  </g>
</svg>`;
}

function buildOgSvg(encodedPrincipal) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#121416" />
      <stop offset="100%" stop-color="#1c2328" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#2f7d6a" />
      <stop offset="100%" stop-color="#7bc7ae" />
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="0" dy="30" stdDeviation="32" flood-color="#000000" flood-opacity="0.20" />
    </filter>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <circle cx="1030" cy="98" r="120" fill="#243038" opacity="0.55" />
  <circle cx="112" cy="556" r="170" fill="#1a2328" opacity="0.90" />
  <rect x="76" y="76" width="1048" height="478" rx="34" fill="#f5f1e7" filter="url(#softShadow)" />
  <rect x="76" y="76" width="1048" height="16" rx="8" fill="url(#accent)" />
  <rect x="128" y="128" width="352" height="352" rx="40" fill="#ebe5d6" />
  <image href="data:image/svg+xml;base64,${encodedPrincipal}" x="148" y="170" width="312" height="234" preserveAspectRatio="xMidYMid meet" />
  <text x="540" y="214" fill="#111315" font-family="Montserrat, Inter, Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="5">FOTOGRAFIA</text>
  <text x="540" y="298" fill="#111315" font-family="Montserrat, Inter, Arial, sans-serif" font-size="58" font-weight="800">Vinicius Rodrigues</text>
  <text x="540" y="362" fill="#3e474d" font-family="Inter, Arial, sans-serif" font-size="32" font-weight="500">Plataforma de venda de fotos</text>
  <text x="540" y="410" fill="#3e474d" font-family="Inter, Arial, sans-serif" font-size="32" font-weight="500">com experiencia premium para eventos</text>
  <rect x="540" y="454" width="236" height="10" rx="5" fill="#2f7d6a" />
  <text x="128" y="602" fill="#e7e2d5" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="500">Galerias, selecao e checkout online</text>
</svg>`;
}

async function main() {
  const principalSvg = readSvg(principalPath);
  const darkSvg = readSvg(darkPath);
  const encodedPrincipal = encodeSvg(principalSvg);
  const encodedDark = encodeSvg(darkSvg);

  const faviconSvg = buildFaviconSvg(encodedDark);
  const ogSvg = buildOgSvg(encodedPrincipal);

  writeText('favicon.svg', faviconSvg);
  writeText('og-preview.svg', ogSvg);

  await Promise.all([
    renderPng(faviconSvg, 16, 16, 'favicon-16.png'),
    renderPng(faviconSvg, 32, 32, 'favicon-32.png'),
    renderPng(faviconSvg, 180, 180, 'apple-touch-icon.png'),
    renderPng(faviconSvg, 192, 192, 'icon-192.png'),
    renderPng(faviconSvg, 512, 512, 'icon-512.png'),
    renderPng(ogSvg, 1200, 630, 'og-preview.png'),
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
