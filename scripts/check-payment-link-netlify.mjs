#!/usr/bin/env node
// Garde de la version Netlify (pay.kolilink.com/p/<jeton>) : aperçu WhatsApp PAR CLIENT, carte image.
// Exige `npm i` à la racine (resvg). node scripts/check-payment-link-netlify.mjs
import { handle } from '../netlify/functions/p.mjs';
import { renderCardPng } from '../netlify/lib/card.mjs';
import { cardSvg } from '../netlify/lib/card-svg.mjs';
import * as R from '../netlify/lib/render.mjs';

let failures = 0;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failures += 1; };
const NB = ' ';
const TOKEN = 'k7q2xAbCdEfGhIjKlMnOpQ';
const owing = { state: 'owing', shop_name: 'Boutique Mariama', first_name: 'Aminata', currency: 'GNF', decimals: 0, balance_cents: 8_500_000,
  last_lines: [{ date: '2026-11-08', item: 'Riz +2', amount_cents: 2_500_000 }] };

function run(path, body, { ua = 'Mozilla/5.0', method = 'GET' } = {}) {
  const seen = [];
  const fetchFn = async (u, init) => { seen.push({ u: String(u), h: init.headers }); return typeof body === 'number' ? new Response('', { status: body }) : new Response(JSON.stringify(body), { status: 200 }); };
  const p = handle(new Request(`https://pay.kolilink.com${path}`, { method, headers: { 'user-agent': ua } }), { ip: '9.9.9.9', fetchFn, renderPng: renderCardPng });
  return { p, seen };
}

let t = run(`/p/${TOKEN}?v=3`, owing); let r = await t.p; let html = await r.text();
check('page: 200, HTML, never cached, noindex', r.status === 200 && r.headers.get('content-type').startsWith('text/html') && r.headers.get('cache-control').includes('no-store') && r.headers.get('x-robots-tag').includes('noindex'));
check('og:title carries the shop and the amount', html.includes(`og:title" content="Boutique Mariama · 85${NB}000 GNF à payer"`));
check('og:image points at this link\'s own card, versioned', html.includes(`https://pay.kolilink.com/p/${TOKEN}/card.png?v=3`) || html.includes(`/p/${TOKEN}/card.png?v=3`));
check('the customer\'s name is never in the preview tags', !/og:[^>]*(Aminata|Diallo)/.test(html));
check('the visitor address is forwarded, no bot flag for a person', t.seen[0].h['x-forwarded-for'] === '9.9.9.9' && !t.seen[0].u.includes('bot=1'));
check('« /p/?t=<jeton> » form also works', (await run(`/p/?t=${TOKEN}`, owing).p).status === 200);
t = run(`/p/${TOKEN}`, owing, { ua: 'WhatsApp/2.23.20' }); await t.p;
check('WhatsApp\'s robot is flagged so it never marks « Vu »', t.seen[0].u.includes('bot=1'));
check('unknown / disabled link: 404 inactive page', (await run(`/p/${TOKEN}`, { state: 'inactive' }).p).status === 404);
t = run('/p/short', owing); r = await t.p; check('malformed token never reaches the server', r.status === 404 && t.seen.length === 0);
for (const code of [503, 429]) { r = await run(`/p/${TOKEN}`, code).p; check(`server ${code}: « Pas de connexion » + Réessayer`, r.status === 503 && (await r.text()).includes('Réessayer')); }
check('POST refused', (await run(`/p/${TOKEN}`, owing, { method: 'POST' }).p).status === 404);

t = run(`/p/${TOKEN}/card.png`, owing); r = await t.p; const png = Buffer.from(await r.arrayBuffer());
check('card.png: real PNG, 1200×630, under 300 KB', r.headers.get('content-type') === 'image/png' && png[1] === 0x50 && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630 && png.length < 300 * 1024);
check('card fetch never marks « Vu »', t.seen[0].u.includes('bot=1'));
check('card for a dead link: 404', (await run(`/p/${TOKEN}/card.png`, { state: 'inactive' }).p).status === 404);
const svg = cardSvg(owing);
check('card: shop + amount + three methods, never the customer\'s name', svg.includes('BOUTIQUE MARIAMA') && svg.includes('85 000') && ['Orange Money', 'MTN MoMo', 'PayCard'].every((m) => svg.includes(m)) && !/Aminata|Diallo/.test(svg));
check('card: a huge amount shrinks to fit', (() => { const s = cardSvg({ ...owing, balance_cents: 99_999_999_999_900 }); const m = s.match(/font-size="(\d+)" font-weight="700" fill="#17152b">99/); return m && Number(m[1]) < 150; })());
check('page: hostile values escaped', !R.renderPage({ ...owing, shop_name: '<script>alert(1)</script>' }, { token: TOKEN }).includes('<script>alert'));

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
