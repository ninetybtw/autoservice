#!/usr/bin/env node
/**
 * Генерирует демонстрационные фотографии и иконки для студий из папки studios/.
 * Настоящие фото владелец загружает в кабинете или кладёт рядом со studio.json.
 *
 *   node scripts/generate-demo-images.mjs <slug> [accentHex] [logoText]
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [slug = 'noir-detailing', accent = '#ff1f2d', logoText = 'NOIR'] = process.argv.slice(2);
const dir = join('studios', slug);
mkdirSync(dir, { recursive: true });

function car({ paint = '#141518', paint2 = '#050506', rim = accent, light = '#ffffff' } = {}) {
  const body =
    'M250 705 C246 680 250 655 262 640 C280 618 320 604 380 596 L470 590 C540 560 610 500 700 474 C760 458 860 452 930 462 C990 470 1050 520 1110 560 C1190 572 1290 586 1350 610 C1380 622 1396 650 1398 676 L1400 705 Z';
  const windows =
    'M520 586 C580 540 640 500 712 484 C760 474 840 470 905 476 L940 480 C980 500 1020 530 1060 560 Z';
  const wheel = (cx) => `
    <g>
      <circle cx="${cx}" cy="705" r="92" fill="#000"/>
      <circle cx="${cx}" cy="705" r="86" fill="#0b0b0c" stroke="#1d1d20" stroke-width="6"/>
      <circle cx="${cx}" cy="705" r="62" fill="url(#rim)"/>
      ${Array.from({ length: 10 }, (_, i) => {
        const a = (i * Math.PI * 2) / 10;
        return `<line x1="${cx + Math.cos(a) * 14}" y1="${705 + Math.sin(a) * 14}" x2="${cx + Math.cos(a) * 58}" y2="${705 + Math.sin(a) * 58}" stroke="#3a3b40" stroke-width="7" stroke-linecap="round"/>`;
      }).join('')}
      <path d="M${cx - 40} ${705 - 30} A50 50 0 0 1 ${cx + 8} ${705 - 50}" stroke="${rim}" stroke-width="12" fill="none" stroke-linecap="round"/>
      <circle cx="${cx}" cy="705" r="12" fill="#2a2b2f"/>
    </g>`;
  return `
    <g>
      <path d="${body}" fill="url(#paint)"/>
      <path d="${body}" fill="url(#sheen)" opacity="0.9"/>
      <path d="M470 590 C540 560 610 500 700 474 C760 458 860 452 930 462 C990 470 1050 520 1110 560 C1190 572 1290 586 1350 610" stroke="${rim}" stroke-width="5" fill="none" filter="url(#glow)" opacity="0.95"/>
      <path d="M300 640 L1360 640" stroke="#ffffff" stroke-opacity="0.08" stroke-width="3"/>
      <path d="${windows}" fill="url(#glass)"/>
      <path d="M1300 600 C1330 606 1365 616 1385 632" stroke="${light}" stroke-width="7" stroke-linecap="round" filter="url(#glow)"/>
      <path d="M256 626 L300 610" stroke="${rim}" stroke-width="9" stroke-linecap="round" filter="url(#glow)"/>
      <rect x="250" y="690" width="1150" height="18" fill="#000" opacity="0.6"/>
      ${wheel(470)}
      ${wheel(1170)}
    </g>
    <defs>
      <linearGradient id="paint" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${paint}"/>
        <stop offset="1" stop-color="${paint2}"/>
      </linearGradient>
      <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/>
        <stop offset="0.45" stop-color="#fff" stop-opacity="0.10"/>
        <stop offset="0.55" stop-color="#fff" stop-opacity="0.02"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#2a2d34"/>
        <stop offset="0.5" stop-color="#07080a"/>
        <stop offset="1" stop-color="#1b1d22"/>
      </linearGradient>
      <radialGradient id="rim">
        <stop offset="0" stop-color="#26272b"/>
        <stop offset="1" stop-color="#101113"/>
      </radialGradient>
    </defs>`;
}

function scene({ paint, paint2, transform = '', glowColor = accent, bg = '#050505' }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="blur40"><feGaussianBlur stdDeviation="40"/></filter>
    <filter id="blur8"><feGaussianBlur stdDeviation="8"/></filter>
    <radialGradient id="spot" cx="0.5" cy="0" r="0.8">
      <stop offset="0" stop-color="${glowColor}" stop-opacity="0.55"/>
      <stop offset="0.5" stop-color="${glowColor}" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#121212"/>
      <stop offset="1" stop-color="#000"/>
    </linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.35"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="reflMask"><rect x="0" y="790" width="1600" height="210" fill="url(#fade)"/></mask>
  </defs>
  <rect width="1600" height="1000" fill="${bg}"/>
  <rect width="1600" height="800" fill="url(#spot)"/>
  ${Array.from({ length: 9 }, (_, i) => `<rect x="${i * 180 + 40}" y="0" width="2" height="780" fill="#fff" opacity="0.035"/>`).join('')}
  <rect x="300" y="70" width="1000" height="10" rx="5" fill="#fff" opacity="0.9" filter="url(#blur8)"/>
  <rect x="340" y="72" width="920" height="5" rx="3" fill="#fff"/>
  <rect y="790" width="1600" height="210" fill="url(#floor)"/>
  <ellipse cx="820" cy="800" rx="640" ry="40" fill="#000" filter="url(#blur40)" opacity="0.9"/>
  <g transform="${transform}">
    ${car({ paint, paint2 })}
    <g mask="url(#reflMask)"><g transform="translate(0 1594) scale(1 -1)">${car({ paint, paint2 })}</g></g>
  </g>
  <rect x="0" y="788" width="1600" height="3" fill="${glowColor}" opacity="0.5" filter="url(#blur8)"/>
</svg>`;
}

const images = {
  'hero.jpg': scene({ paint: '#17181c', paint2: '#040405' }),
  'work-1.jpg': scene({ paint: '#e9e9ec', paint2: '#8d8f96', glowColor: '#ffffff', transform: 'translate(-80 -40) scale(1.08)' }),
  'work-2.jpg': scene({ paint: '#b3121c', paint2: '#3d0408', transform: 'translate(-900 -560) scale(2.2)' }),
  'work-3.jpg': scene({ paint: '#1b2a44', paint2: '#070b14', glowColor: '#4c8dff', transform: 'translate(-60 0)' }),
  'work-4.jpg': scene({ paint: '#2b2c30', paint2: '#0a0a0b', transform: 'translate(-1500 -380) scale(2.1)' }),
};

for (const [name, svg] of Object.entries(images)) {
  const isHero = name === 'hero.jpg';
  await sharp(Buffer.from(svg))
    .resize(isHero ? 1600 : 1200)
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(join(dir, name));
  console.log('✓', join(dir, name));
}

const logo = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#0a0a0a"/>
  <rect x="24" y="24" width="464" height="464" rx="92" fill="none" stroke="${accent}" stroke-width="10"/>
  <path d="M120 300 C170 230 220 200 300 196 C340 194 370 210 392 232" stroke="${accent}" stroke-width="22" fill="none" stroke-linecap="round"/>
  <text x="256" y="372" font-family="Arial, Helvetica, sans-serif" font-size="${logoText.length > 5 ? 74 : 96}" font-weight="800" letter-spacing="6" text-anchor="middle" fill="#fff">${logoText}</text>
</svg>`;
writeFileSync(join(dir, 'logo.svg'), logo);
for (const size of [192, 512]) {
  await sharp(Buffer.from(logo)).resize(size, size).png().toFile(join(dir, `icon-${size}.png`));
}
console.log('✓ logo + icons in', dir);
