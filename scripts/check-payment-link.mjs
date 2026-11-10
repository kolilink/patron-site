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
check('Payer montre le montant demandé et reste inactif', out.includes(`Payer 40${NB}000 GNF`) && /<button class="btn" disabled>/.test(out));
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
const spy = (f) => (u) => { seen.push(u); return f(u); };
check('jeton mal formé : jamais envoyé au serveur', (await P.loadAndRender(spy(resp(200, owing)), '?t=abc')).includes('Lien inactif') && seen.length === 0);
check('sans jeton : lien inactif', (await P.loadAndRender(spy(resp(200, owing)), '')).includes('Lien inactif') && seen.length === 0);
check('bon jeton : appelle la fonction avec le jeton', (await P.loadAndRender(spy(resp(200, owing)), `?t=${TOKEN}&a=40000`)).includes('Boutique Mariama') && seen[0] === `${P.FN}?t=${TOKEN}`);
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

if (failures) { console.error(`\n${failures} vérification(s) en échec`); process.exit(1); }
console.log('\ntout est vert');
