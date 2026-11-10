#!/usr/bin/env node
// Garde de la page de paiement (/p/<token>) : rendu, aperçu WhatsApp, carte image.
// node scripts/check-payment-link.mjs (exit 1 si échec). La carte PNG n'est vérifiée que si
// worker/payment-link/node_modules est installé (npm i dans ce dossier).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = join(root, 'worker/payment-link');
const R = await import(pathToFileURL(join(W, 'render.mjs')));
const { cardSvg } = await import(pathToFileURL(join(W, 'card-svg.mjs')));
const Worker = (await import(pathToFileURL(join(W, 'index.mjs')))).default;

let failures = 0;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failures += 1; };

const TOKEN = 'k7q2xAbCdEfGhIjKlMnOpQ';
const owing = { state: 'owing', shop_name: 'Boutique Mariama', first_name: 'Aminata', currency: 'GNF', decimals: 0, balance_cents: 8_500_000,
  last_lines: [{ date: '2026-11-08', item: 'Riz +2', amount_cents: 2_500_000 }] };

// ── amounts
check('85 000 GNF', R.formatAmount(8_500_000, 0) === '85 000');
check('two-decimal currency keeps its cents', R.formatAmount(123_456, 2) === '1 234,56');
check('never negative', R.formatAmount(-5, 0) === '0');
// ── requested amount
check('« ?a=40000 » is honoured below the Reste', R.requestedCents(owing, '40000') === 4_000_000);
check('a request at or above the Reste is ignored', R.requestedCents(owing, '85000') === null && R.requestedCents(owing, '999999') === null);
check('garbage in ?a= is ignored', ['', '-5', '1e3', '40000.5', 'abc', '0', "1'or'1"].every((x) => R.requestedCents(owing, x) === null));
// ── page
const html = R.renderPage(owing, { token: TOKEN, v: '3', a: '40000' });
check('shows shop, first name, Reste', html.includes('Boutique Mariama') && html.includes('Pour Aminata') && html.includes('85 000'));
check('shows what the shop asked for + « Tout payer »', html.includes('demande 40 000 GNF') && html.includes('Tout payer'));
check('Payer shows the requested amount and is inactive until payments open', html.includes('Payer 40 000 GNF') && /<button class="btn" disabled>/.test(html));
check('the three methods', ['Orange Money', 'MTN MoMo', 'PayCard'].every((m) => html.includes(m)));
check('og tags: title, description, image with ?v=', html.includes('og:title" content="Boutique Mariama · 85 000 GNF à payer"') && html.includes('Payez en 30 secondes') && html.includes(`/p/${TOKEN}/card.png?v=3`));
check('the customer\'s name is never in the preview tags', !/og:[^>]*(Aminata|Diallo)/.test(html));
check('noindex', html.includes('noindex'));
check('light: under 100 KB, no web fonts, no external requests', html.length < 100_000 && !/@font-face|<link|<script|https?:\/\/(?!patron\.kolilink\.com)/.test(html.replace(/xmlns="[^"]*"/g, '')));
check('asks for no secret code', html.includes('ne vous demande jamais votre code secret'));
check('hostile values are escaped', !R.renderPage({ ...owing, shop_name: '<script>alert(1)</script>', first_name: '"><img src=x>' }, { token: TOKEN }).match(/<script>alert|<img src=x>/));
const clear = R.renderPage({ ...owing, state: 'clear', balance_cents: 0 }, { token: TOKEN });
check('nothing owed: thank-you, no pay button', clear.includes('Vous ne devez rien à Boutique Mariama. Merci !') && !clear.includes('<button'));
check('inactive: one generic sentence, no shop data', R.renderPage({ state: 'inactive' }).includes("Ce lien n'est plus actif") && !R.renderPage({ state: 'inactive' }).includes('Boutique'));
check('bots recognised', ['WhatsApp/2.23', 'facebookexternalhit/1.1', 'TelegramBot'].every(R.isBot) && !R.isBot('Mozilla/5.0 (Linux; Android 12) Chrome/120'));

// ── worker routing (fetch stubbed)
function worker(pageOrStatus) {
  const seen = [];
  globalThis.fetch = async (u, init) => { seen.push({ u: String(u), h: init.headers });
    return typeof pageOrStatus === 'number' ? new Response('', { status: pageOrStatus }) : new Response(JSON.stringify(pageOrStatus), { status: 200 }); };
  const call = (path, ua = 'Mozilla/5.0') => Worker.fetch(new Request(`https://patron.kolilink.com${path}`, { headers: { 'user-agent': ua, 'cf-connecting-ip': '9.9.9.9' } }),
    { PAYMENT_PAGE_URL: 'https://x/payment-page', RELAY_SECRET: 's' });
  return { call, seen };
}
let w = worker(owing); let r = await w.call(`/p/${TOKEN}`);
check('worker serves HTML, never cached, with the relay secret and the visitor address', r.status === 200 && r.headers.get('content-type').startsWith('text/html') && r.headers.get('cache-control').includes('no-store') && w.seen[0].h['x-relay-secret'] === 's' && w.seen[0].h['x-client-ip'] === '9.9.9.9');
check('a person is not flagged as a bot', !w.seen[0].u.includes('bot=1'));
w = worker(owing); await w.call(`/p/${TOKEN}`, 'WhatsApp/2.23.20');
check('WhatsApp\'s robot is flagged (so it never marks « Vu »)', w.seen[0].u.includes('bot=1'));
w = worker({ state: 'inactive' }); r = await w.call(`/p/${TOKEN}`);
check('unknown / disabled link: 404 page', r.status === 404);
w = worker(owing); r = await w.call('/p/short');
check('malformed token never reaches the server', r.status === 404 && w.seen.length === 0);
for (const code of [503, 429]) { w = worker(code); r = await w.call(`/p/${TOKEN}`); check(`server ${code}: « Pas de connexion » + Réessayer, not a crash`, r.status === 503 && (await r.text()).includes('Réessayer')); }
w = worker(owing); r = await w.call('/p/x/y/z'); check('other paths: 404', r.status === 404);

// ── card
const svg = cardSvg(owing);
check('card: shop + amount + the three methods', svg.includes('BOUTIQUE MARIAMA') && svg.includes('85 000') && ['Orange Money', 'MTN MoMo', 'PayCard'].every((m) => svg.includes(m)));
check('card: never the customer\'s name', !/Aminata|Diallo/.test(svg));
check('card: a huge amount shrinks to fit', (() => { const s = cardSvg({ ...owing, balance_cents: 99_999_999_999_900 }); const m = s.match(/font-size="(\d+)" font-weight="700" fill="#17152b">99/); return m && Number(m[1]) < 150; })());
const resvgDir = join(W, 'node_modules/@resvg/resvg-wasm');
if (existsSync(resvgDir)) {
  const { Resvg, initWasm } = await import(pathToFileURL(join(resvgDir, 'index.mjs')));
  await initWasm(readFileSync(join(resvgDir, 'index_bg.wasm')));
  const fonts = ['Inter_700Bold', 'Inter_400Regular'].map((f) => new Uint8Array(readFileSync(join(W, `fonts/${f}.ttf`))));
  for (const [label, p] of [['owing', owing], ['nothing owed', { ...owing, state: 'clear', balance_cents: 0 }]]) {
    const img = new Resvg(cardSvg(p), { font: { fontBuffers: fonts, defaultFontFamily: 'Inter', loadSystemFonts: false } }).render();
    const png = img.asPng();
    check(`card PNG (${label}): real PNG, 1200×630, under 300 KB (${Math.round(png.length / 1024)} KB)`, png[1] === 0x50 && img.width === 1200 && img.height === 630 && png.length < 300 * 1024);
  }
} else console.log('· card PNG not rasterised (run npm i in worker/payment-link)');

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
