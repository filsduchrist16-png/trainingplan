// Génère les icônes PNG de la PWA à partir de public/favicon.svg (Chromium headless via Playwright).
// Usage : node scripts/make-icons.mjs
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const targets = [
  { file: 'icon-192.png', size: 192, pad: 0 },
  { file: 'icon-512.png', size: 512, pad: 0 },
  { file: 'icon-512-maskable.png', size: 512, pad: 0.12 }, // zone de sécurité Android
  { file: 'apple-touch-icon.png', size: 180, pad: 0 },
];

const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const page = await browser.newPage();
for (const { file, size, pad } of targets) {
  const inner = Math.round(size * (1 - pad * 2));
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:#0f201b;display:grid;place-items:center;width:${size}px;height:${size}px">
       <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>
     </body>`,
  );
  await page.screenshot({ path: `public/${file}` });
  console.log('✓', file);
}
await browser.close();
