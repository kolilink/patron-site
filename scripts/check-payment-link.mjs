#!/usr/bin/env node
// Garde de la page de paiement statique /p/?t=<jeton> : rendu, états, aperçu WhatsApp générique.
// Zéro dépendance : node scripts/check-payment-link.mjs (exit 1 si échec).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = createRequire(import.meta.url)(join(root, 'p/pay.js'));
const html = readFileSync(join(root, 'p/index.html'), 'utf8');
const js = readFileSync(join(root, 'p/pay.js'), 'utf8');
const png = readFileSync(join(root, 'p/og.png'));

let failures = 0;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failures += 1; };
const NB = ' ';
const TOKEN = 'k7q2xAbCdEfGhIjKlMnOpQ';
const owing = { state: 'owing', shop_name: 'Boutique Mariama', first_name: 'Aminata', currency: 'GNF', decimals: 0, balance_cents: 8_500_000,
  last_lines: [{ date: '2026-11-08', item: 'Riz +2', amount_cents: 2_500_000 }] };

// ── montants
check('85 000 GNF', P.formatAmount(8_500_000, 0) === `85${NB}000`);
check('devise à 2 décimales : les centimes restent', P.formatAmount(123_456, 2) === `1${NB}234,56`);
check('jamais négatif', P.formatAmount(-5, 0) === '0');
check('?a=40000 respecté sous le Reste', P.requestedCents(owing, '40000') === 4_000_000);
check('?a= égal ou au-dessus du Reste ignoré', P.requestedCents(owing, '85000') === null && P.requestedCents(owing, '999999') === null);
check('?a= absurde ignoré', ['', '-5', '1e3', '40000.5', 'abc', '0', "1'or'1"].every((x) => P.requestedCents(owing, x) === null));

// ── page
const out = P.render(owing, '40000');
check('boutique, prénom, Reste', out.includes('Boutique Mariama') && out.includes('Bonjour Aminata') && out.includes(`85${NB}000`));
check('montant demandé + « Tout payer »', out.includes(`vous propose de régler 40${NB}000 GNF`) && out.includes('Tout régler'));
check('Payer montre le montant demandé, est actif et porte ce montant (centimes)', out.includes(`Payer 40${NB}000 GNF`) && out.includes('id="pay" data-cents="4000000"') && !out.includes('disabled'));
check('les trois moyens', ['Orange Money', 'MTN MoMo', 'PayCard'].every((m) => out.includes(m)));
check('dernières lignes de crédit affichées', out.includes('Riz +2'));
check('valeurs hostiles échappées', !P.render({ ...owing, shop_name: '<script>alert(1)</script>', first_name: '"><img src=x>' }).match(/<script>alert|<img src=x>/));
const clear = P.render({ ...owing, state: 'clear', balance_cents: 0 });
check('rien dû : remerciement, pas de bouton', clear.includes('Tout est réglé. Merci pour votre confiance.') && !clear.includes('<button'));
const dead = P.render({ state: 'inactive' });
check('inactif : une phrase générique, aucune donnée', dead.includes('n’est plus actif') && !dead.includes('Boutique'));

// ── chargement (fetch simulé)
const resp = (status, body) => async () => ({ status, json: async () => body });
const seen = [];
const inits = [];
const spy = (f) => (u, init) => { seen.push(u); inits.push(init); return f(u, init); };
check('jeton mal formé : jamais envoyé au serveur', (await P.loadAndRender(spy(resp(200, owing)), '?t=abc')).includes('Lien inactif') && seen.length === 0);
check('sans jeton : lien inactif', (await P.loadAndRender(spy(resp(200, owing)), '')).includes('Lien inactif') && seen.length === 0);
check('ancien lien ?t= : marche encore, et le jeton part dans le CORPS, pas dans l’adresse', (await P.loadAndRender(spy(resp(200, owing)), `?t=${TOKEN}&a=40000`)).includes('Boutique Mariama') && seen[0] === P.FN && inits[0].method === 'POST' && inits[0].body === TOKEN);
check('lien inconnu / désactivé : lien inactif', (await P.loadAndRender(resp(200, { state: 'inactive' }), `?t=${TOKEN}`)).includes('Lien inactif'));
for (const s of [429, 500, 503]) check(`serveur ${s} : « Pas de connexion » + Réessayer`, (await P.loadAndRender(resp(s, {}), `?t=${TOKEN}`)).includes('Réessayer'));
check('réseau coupé : « Pas de connexion », sans exception', (await P.loadAndRender(async () => { throw new Error('x'); }, `?t=${TOKEN}`)).includes('Pas de connexion'));
check('réponse illisible : « Pas de connexion »', (await P.loadAndRender(async () => ({ status: 200, json: async () => { throw new Error('x'); } }), `?t=${TOKEN}`)).includes('Pas de connexion'));

// ── vitesse : la demande part dès le HTML, pay.js la reprend
check('index.html lance la demande des chiffres avant pay.js, avec le même jeton et la même adresse', html.indexOf('window.__pay') > -1 && html.indexOf('window.__pay') < html.indexOf('<script src="/p/pay.js">') && html.includes(P.FN) && html.includes('^[A-Za-z0-9_-]{22}$'));
globalThis.__pay = { t: TOKEN, p: Promise.resolve({ status: 200, json: async () => owing }) };
let called = 0;
check('pay.js reprend la demande anticipée : aucune 2e demande', (await P.loadAndRender(async () => { called += 1; return { status: 200, json: async () => owing }; }, `?t=${TOKEN}`)).includes('Boutique Mariama') && called === 0);
globalThis.__pay = { t: TOKEN, p: Promise.resolve(null) };
check('demande anticipée échouée : une seule reprise normale', (await P.loadAndRender(async () => { called += 1; return { status: 200, json: async () => owing }; }, `?t=${TOKEN}`)).includes('Boutique Mariama') && called === 1);
globalThis.__pay = { t: 'autre'.padEnd(22, 'x'), p: Promise.resolve({ status: 200, json: async () => ({ state: 'inactive' }) }) };
check('demande anticipée d\'un autre jeton ignorée', (await P.loadAndRender(async () => ({ status: 200, json: async () => owing }), `?t=${TOKEN}`)).includes('Boutique Mariama'));
delete globalThis.__pay;

// ── aperçu WhatsApp (page statique : générique, jamais de nom)
check('og : titre, description, image', html.includes('og:title" content="Votre reste à régler"') && html.includes('En un instant') && html.includes('https://patron.kolilink.com/p/og.png'));
check('aucune donnée de client dans la page statique', !/Aminata|Mariama|Diallo/.test(html + js));
check('noindex, pas de référent', html.includes('noindex') && html.includes('no-referrer'));
check('ne demande jamais le code secret', html.includes('ne vous demandera jamais votre code secret'));
check('léger : < 100 Ko, aucune police web, aucun script tiers', html.length + js.length < 100_000 && !/@font-face|<script src="https?:/.test(html));
check('og.png : vrai PNG 1200×630 sous 300 Ko', png[1] === 0x50 && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630 && png.length < 300 * 1024);

// ── les états d'une tentative (layer 5)
const at = (state, extra = {}) => P.renderAttempt(owing, { state, amount_cents: 4_000_000, balance_cents: 4_500_000, min_cents: 100_000, ...extra });
check('en attente : phrase simple, pas de bouton Payer, pas de Vérifier tout de suite', at('open').includes('Confirmez avec votre code secret') && !at('open').includes('Vérifier') && !at('open').includes('Payer'));
check('en attente > 2 min : « Vérifier », jamais un second « Payer »', P.renderAttempt(owing, { state: 'open', amount_cents: 1 }, { waitedMs: 130_000 }).includes('Vérifier') && !at('open', {}).includes('Payer'));
check('payé en partie : reçu + nouveau Reste', at('confirmed').includes('Paiement reçu') && at('confirmed').includes(`45${NB}000`));
check('payé en entier : « Vous ne devez plus rien »', at('confirmed', { balance_cents: 0 }).includes('Vous ne devez plus rien à Boutique Mariama'));
check('échec : « Votre argent n’a pas bougé » + Réessayer', at('failed').includes('Votre argent n’a pas bougé') && at('failed').includes('Réessayer'));
for (const r of Object.keys(P.REASONS)) check(`échec « ${r} » : une raison en clair`, at('failed', { reason: r }).includes(P.REASONS[r]));
check('échec : raison inconnue ou hostile = aucune raison affichée', !at('failed', { reason: '<img src=x>' }).includes('<img') && !at('failed', { reason: 'other' }).includes('class="why"'));
check('expiré : « Toujours en attente… » + Vérifier', at('expired').includes('Toujours en attente') && at('expired').includes('Vérifier'));
check('déjà un paiement en cours : Vérifier', at('busy').includes('déjà en cours') && at('busy').includes('Vérifier'));
check('sous le minimum : le minimum est dit', at('too_low').includes(`Minimum 1${NB}000 GNF`));
check('état inconnu : lien inactif', P.renderAttempt(owing, { state: 'weird' }).includes('Lien inactif'));
check('aucun état n’appelle le serveur ni ne contient de script', ['open', 'confirmed', 'failed', 'expired', 'busy', 'too_low'].every((s) => !/<script|fetch\(/.test(at(s))));
// exemples : chaque état s'ouvre avec ?demo=, clairement marqué, sans aucune vraie donnée
for (const s of ['open', 'confirmed', 'failed', 'expired', 'busy', 'too_low']) {
  const h = await P.loadAndRender(async () => { throw new Error('jamais'); }, `?demo=${s}`);
  check(`démo « ${s} » : marquée EXEMPLE, boutique fictive, aucun appel réseau`, h.includes('EXEMPLE') && h.includes('Boutique Exemple') && !/Mariama|Aminata/.test(h));
}
check('démo inconnue : ignorée (jeton absent = lien inactif)', (await P.loadAndRender(resp(200, owing), '?demo=hack')).includes('Lien inactif'));
check('les phrases de la page ont un seul ton : aucun mot d’alerte (« erreur », « échoué », « impayé »)', !/erreur|échoué|impay/i.test(Object.values(P.REASONS).join(' ') + at('failed') + at('expired')));

// ── ce que la page dit d'un paiement déjà fait (v278) : plus de doublon par doute
const recent = { ...owing, balance_cents: 4_500_000, recent_payment: { amount_cents: 4_000_000, minutes_ago: 3 }, advance_cents: 0 };
check('paiement récent : « Vous avez payé 40 000 GNF il y a 3 min ✓ » en tête', P.render(recent).includes(`Vous avez payé 40${NB}000 GNF il y a 3 min ✓`));
check('à l’instant si moins d’une minute', P.agoText(0) === 'à l’instant' && P.agoText(7) === 'il y a 7 min');
check('même montant qu’il vient de payer : « Payer encore » + une phrase, jamais un refus', P.render(recent, '40000').includes('Payer encore') && P.render(recent, '40000').includes('touchez encore pour confirmer'));
check('autre montant : bouton normal, pas d’avertissement', !P.render(recent).includes('Payer encore') && !P.render(recent, '10000').includes('touchez encore'));
check('rien payé récemment : aucune ligne « Vous avez payé »', !P.render(owing).includes('Vous avez payé'));
check('looksLikeRepeat tolère l’absence de donnée', P.looksLikeRepeat(null, 5) === false && P.looksLikeRepeat({}, 5) === false && P.looksLikeRepeat({ recent_payment: { amount_cents: '5' } }, 5) === true);
const adv = P.render({ ...owing, state: 'clear', balance_cents: 0, advance_cents: 3_000_000, recent_payment: null });
check('avance : jamais « Tout est réglé », mais l’avance et ce qu’on en fait', adv.includes(`avance de 3${NB}000${NB}000`.replace(`3${NB}000${NB}000`, `30${NB}000`)) && adv.includes('déduite de votre prochain achat') && !adv.includes('Tout est réglé'));
const rec = (extra) => P.renderAttempt(owing, { state: 'confirmed', amount_cents: 8_500_000, confirmed_cents: 8_500_000, balance_cents: 0, advance_cents: 0, ...extra });
check('reçu : le montant CONFIRMÉ, pas le montant demandé', rec({ confirmed_cents: 8_400_000, balance_cents: 100_000 }).includes(`84${NB}000`) && !rec({ confirmed_cents: 8_400_000, balance_cents: 100_000 }).includes(`85${NB}000 GNF</p>`));
check('reçu trop payé : la phrase de l’avance', rec({ advance_cents: 3_000_000 }).includes('déduite de votre prochain achat'));
check('reçu soldé : « Vous ne devez plus rien »', rec({}).includes('Vous ne devez plus rien'));
for (const d of ['twice', 'advance', 'over', 'short']) {
  const h = await P.loadAndRender(async () => { throw new Error('jamais'); }, `?demo=${d}`);
  check(`démo « ${d} » : EXEMPLE, boutique fictive, aucun appel réseau`, h.includes('EXEMPLE') && h.includes('Boutique Exemple') && !/Mariama|Aminata/.test(h));
}

// ── SÉCURITÉ (couche 8)
const crypto = await import('node:crypto');
// ── couche 9 : « Payer » (Djomy) et le retour
const ATT = '6f1c2a40-1b2c-4d5e-8f90-a1b2c3d4e5f6';
const json = (body, status = 200) => async () => ({ status, json: async () => body });
check('startBody / checkBody : JSON, jamais de montant ni d’état dans une vérification', JSON.parse(P.startBody(TOKEN, 4_000_000)).amount_cents === 4_000_000
  && Object.keys(JSON.parse(P.checkBody(TOKEN, ATT))).sort().join() === 'a,op,t');
check('Payer → la page de Djomy (https, djomy.africa) seulement', (await P.startPay(json({ state: 'redirect', attempt_id: ATT, url: 'https://pay.djomy.africa/x' }), owing, TOKEN, 1)).go === 'https://pay.djomy.africa/x');
for (const url of ['http://pay.djomy.africa/x', 'https://evil.example/x', 'https://djomy.africa.evil.com/x', 'javascript:alert(1)']) {
  check(`Payer : une adresse de redirection non-Djomy n’est jamais suivie (${url})`, !(await P.startPay(json({ state: 'redirect', attempt_id: ATT, url }), owing, TOKEN, 1)).go);
}
check('Payer : l’appel part vers payment-pay, en POST text/plain, sans jeton dans l’adresse', await (async () => {
  seen.length = 0; inits.length = 0;
  await P.startPay(spy(json({ state: 'busy' })), owing, TOKEN, 4_000_000);
  return seen[0] === P.FN_PAY && !seen[0].includes(TOKEN) && inits[0].method === 'POST' && inits[0].headers['content-type'] === 'text/plain';
})());
check('Payer refusé : l’état est dit (déjà en cours, minimum, montant changé, trop d’essais)', (await P.startPay(json({ state: 'busy' }), owing, TOKEN, 1)).html.includes('déjà en cours')
  && (await P.startPay(json({ state: 'too_low', min_cents: 1_000_000 }), owing, TOKEN, 1)).html.includes(`Minimum 10${NB}000 GNF`)
  && (await P.startPay(json({ state: 'too_high' }), owing, TOKEN, 1)).html.includes('a changé')
  && (await P.startPay(json({ state: 'rate_limited' }), owing, TOKEN, 1)).html.includes('Trop d’essais'));
check('Payer : Djomy indisponible → « Le paiement n’est pas passé. Votre argent n’a pas bougé » + Réessayer vers le lien', (await P.startPay(json({ state: 'failed', reason: 'operator_down' }), owing, TOKEN, 1)).html.includes('Votre argent n’a pas bougé')
  && (await P.startPay(json({ state: 'failed', reason: 'operator_down' }), owing, TOKEN, 1)).html.includes(`href="/p/#t=${TOKEN}"`));
check('Payer : serveur ou réseau en panne → « Pas de connexion », sans exception', (await P.startPay(async () => { throw new Error('x'); }, owing, TOKEN, 1)).html.includes('Pas de connexion')
  && (await P.startPay(json({}, 503), owing, TOKEN, 1)).html.includes('Pas de connexion'));
check('retour de Djomy (?r=…#t=…) : la page demande à NOTRE serveur, puis montre le reçu', await (async () => {
  const urls = [];
  const f = async (u) => { urls.push(u); return u === P.FN ? { status: 200, json: async () => owing } : { status: 200, json: async () => ({ state: 'confirmed', amount_cents: 4_000_000, confirmed_cents: 4_000_000, balance_cents: 4_500_000 }) }; };
  const h = await P.loadAndRender(f, `?r=${ATT}&status=success`, `#t=${TOKEN}`);
  return h.includes('Paiement reçu') && urls.join() === `${P.FN},${P.FN_PAY}` && P.lastState().done === true;
})());
check('retour : « status=success » dans l’adresse ne prouve rien — en attente tant que le serveur ne dit pas « confirmed »', await (async () => {
  const f = async (u) => u === P.FN ? { status: 200, json: async () => owing } : { status: 200, json: async () => ({ state: 'open', amount_cents: 4_000_000 }) };
  const h = await P.loadAndRender(f, `?r=${ATT}&status=success&amount=999999`, `#t=${TOKEN}`);
  return !h.includes('Paiement reçu') && h.includes('Confirmez') && P.lastState().done === false;
})());
check('retour sans « # » : le jeton gardé sur ce téléphone pour CETTE tentative seulement', await (async () => {
  const store = { getItem: () => JSON.stringify({ t: TOKEN, r: ATT }) };
  const f = async (u) => u === P.FN ? { status: 200, json: async () => owing } : { status: 200, json: async () => ({ state: 'failed' }) };
  const ok = (await P.loadAndRender(f, `?r=${ATT}`, '', store)).includes('n’est pas passé');
  const other = (await P.loadAndRender(f, '?r=11111111-1b2c-4d5e-8f90-a1b2c3d4e5f6', '', store)).includes('Lien inactif');
  const broken = (await P.loadAndRender(f, `?r=${ATT}`, '', { getItem: () => '{oops' })).includes('Lien inactif');
  return ok && other && broken;
})());
check('retour : une tentative mal formée est ignorée (page normale)', P.attemptFrom('?r=abc') === '' && P.attemptFrom(`?r=${ATT}`) === ATT);
check('retour : réseau coupé pendant l’attente = on attend encore (jamais « échec »)', await (async () => {
  const c = await P.checkOnce(async () => { throw new Error('x'); }, owing, TOKEN, ATT, 0);
  return c.done === false && c.html.includes('Confirmez');
})());
check('la page ne fabrique jamais de « Paiement reçu » : il vient seulement de la réponse du serveur', !/Paiement reçu[^']*'\s*\+[^;]*status=/.test(js));

check('nouveau lien #t= : lu après « # », envoyé en POST text/plain, l’adresse appelée ne contient jamais le jeton', await (async () => {
  seen.length = 0; inits.length = 0;
  const h = await P.loadAndRender(spy(resp(200, owing)), '', `#t=${TOKEN}`);
  return h.includes('Boutique Mariama') && seen.length === 1 && !seen[0].includes(TOKEN) && inits[0].method === 'POST'
    && inits[0].body === TOKEN && inits[0].headers['content-type'] === 'text/plain' && inits[0].referrerPolicy === 'no-referrer';
})());
check('« # » gagne sur « ? » ; un jeton mal formé après « # » ne part jamais', P.tokenFrom(`?t=${'a'.repeat(22)}`, `#t=${TOKEN}`) === TOKEN && await (async () => {
  seen.length = 0; const h = await P.loadAndRender(spy(resp(200, owing)), '', '#t=abc'); return h.includes('Lien inactif') && seen.length === 0;
})());
check('aucune adresse construite par la page ne contient « ?t= » (le jeton n’est jamais dans une URL de requête)', !/FN \+ '\?t='|payment-page\?t=/.test(js + html));
const inline = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const sha = crypto.createHash('sha256').update(inline, 'utf8').digest('base64');
const csp = (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
check('CSP présente : rien par défaut, nos scripts seulement, seule la fonction Supabase joignable', /default-src 'none'/.test(csp) && /script-src 'self' 'sha256-/.test(csp) && /connect-src https:\/\/jnxpujsyvbenqgjbvifh\.supabase\.co;/.test(csp) && /base-uri 'none'/.test(csp) && /form-action 'none'/.test(csp));
check('CSP : l’empreinte autorise EXACTEMENT le script en ligne actuel (sinon la page casse en silence)', csp.includes(`'sha256-${sha}'`));
check('CSP : jamais unsafe-inline / unsafe-eval pour les scripts', !/script-src[^;]*unsafe/.test(csp));
check('un seul script en ligne (tout autre script serait bloqué par la CSP)', (html.match(/<script>/g) || []).length === 1);
// La page ne demande JAMAIS un code secret : aucun champ de saisie, sur aucun écran, y compris les démos.
const screens = [P.render(owing), P.render(owing, '40000'), P.render({ ...owing, state: 'clear', balance_cents: 0, advance_cents: 3_000_000 }),
  P.inactive(), P.unavailable(), ...['open', 'confirmed', 'failed', 'expired', 'busy', 'too_low'].map((st) => P.renderAttempt(owing, { state: st, amount_cents: 1, balance_cents: 1, min_cents: 1 })),
  ...['twice', 'advance', 'over', 'short', 'open', 'confirmed'].map((d) => P.demo(d))];
// Seule exception : le numéro MOBILE du payeur (Djomy le exige), un seul champ type=tel, sur l'écran « il vous reste à régler ».
const inputs = (h) => (h.match(/<input[^>]*>/gi) || []);
const onlyPhone = (h) => inputs(h).every((i) => /id="pn"/.test(i) && /type="tel"/.test(i) && !/password|pin|code|otp/i.test(i.replace(/placeholder="[^"]*"/, '')));
check('aucun champ de saisie sauf le numéro mobile (un seul, type=tel) ; jamais <textarea>/<form> ; jamais de champ code/PIN/mot de passe',
  screens.every((h) => onlyPhone(h) && inputs(h).length <= 1 && !/<textarea|<form/i.test(h)) && !/<textarea|<form/i.test(html) && inputs(html).length === 0);
check('seul l’écran « montant à régler » demande le numéro ; aucun écran d’état (échec, confirmé, attente…) n’a de champ', screens.filter((h) => inputs(h).length).every((h) => h.includes('id="pay"')));
check('« Patron ne vous demandera jamais votre code secret » toujours affiché', html.includes('ne vous demandera jamais votre code secret'));
// Chaque champ venant du serveur est échappé, sur chaque écran (une boutique ou un article piégé ne peut rien injecter).
const evil = '"><img src=x onerror=alert(1)><script>alert(1)</script>';
const hostile = { ...owing, shop_name: evil, first_name: evil, currency: evil, last_lines: [{ date: evil, item: evil, amount_cents: 1 }],
  recent_payment: { amount_cents: 1, minutes_ago: evil } };
const hostileScreens = [P.render(hostile), P.render({ ...hostile, state: 'clear', advance_cents: 5 }),
  ...['open', 'confirmed', 'failed', 'expired', 'busy', 'too_low'].map((st) => P.renderAttempt(hostile, { state: st, reason: evil, amount_cents: 1, balance_cents: 1, min_cents: 1, advance_cents: 1 }))];
check('valeurs hostiles échappées sur TOUS les écrans (boutique, prénom, devise, article, date, raison, minutes)', hostileScreens.every((h) => !/<img|<script/i.test(h)));
check('« il y a N min » : un texte hostile devient un nombre', P.agoText('<b>') === 'à l’instant' && P.agoText('7') === 'il y a 7 min' && P.agoText(-3) === 'à l’instant');

if (failures) { console.error(`\n${failures} vérification(s) en échec`); process.exit(1); }
console.log('\ntout est vert');
