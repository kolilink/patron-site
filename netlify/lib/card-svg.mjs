// The WhatsApp card: 1200×630, drawn as SVG (pure, testable) then rasterised to PNG (WhatsApp ignores SVG).
// Shop + Reste + seal + the three methods. NEVER the customer's name: links get forwarded.
import { esc, formatAmount } from './render.mjs';

const INK = '#17152b', MUTED = '#6b6880', PURPLE = '#6366f1', AMBER = '#e6a23c', GREEN = '#0a7a3d';
const fitSize = (text, base, maxW) => Math.max(40, Math.min(base, Math.floor(maxW / (text.length * 0.6))));

export function cardSvg(page) {
  const owing = page.state === 'owing';
  const shop = esc(String(page.shop_name).toUpperCase().slice(0, 28));
  const label = owing ? 'RESTE À PAYER' : 'MERCI';
  const amount = owing ? formatAmount(page.balance_cents, page.decimals).replace(/ /g, ' ') : 'Vous ne devez rien';
  const size = fitSize(amount, owing ? 150 : 84, 720);
  const ring = owing ? AMBER : GREEN;
  const pill = (x, w, bg, fg, t) => `<rect x="${x}" y="500" width="${w}" height="64" rx="12" fill="${bg}"/><text x="${x + w / 2}" y="543" font-size="30" font-weight="700" text-anchor="middle" fill="${fg}">${t}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="Inter">
<rect width="1200" height="630" fill="#faf8f3"/>
<text x="70" y="110" font-size="40" font-weight="700" letter-spacing="3" fill="${INK}">${shop}</text>
<circle cx="1020" cy="170" r="92" fill="none" stroke="${ring}" stroke-width="16"/>
<text x="1020" y="186" font-size="${owing ? 44 : 64}" font-weight="700" text-anchor="middle" fill="${INK}">${owing ? esc(page.currency) : '✓'}</text>
<text x="70" y="260" font-size="30" font-weight="700" letter-spacing="3" fill="${MUTED}">${label}</text>
<text x="70" y="${260 + size}" font-size="${size}" font-weight="700" fill="${INK}">${esc(amount)}${owing ? `<tspan font-size="${Math.round(size * 0.36)}" fill="${MUTED}"> ${esc(page.currency)}</tspan>` : ''}</text>
${pill(70, 270, '#ff7900', '#fff', 'Orange Money')}${pill(360, 190, '#ffcc00', '#111', 'MTN MoMo')}${pill(570, 190, GREEN, '#fff', 'PayCard')}
<circle cx="900" cy="532" r="14" fill="none" stroke="${PURPLE}" stroke-width="6"/>
<text x="930" y="545" font-size="36" font-weight="700" fill="${INK}">patron</text>
</svg>`;
}
