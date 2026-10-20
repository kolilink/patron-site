#!/usr/bin/env node
// Garde des textes de la page d'invitation — assertions portées depuis
// kolilink/Patron (__tests__/invite-share.test.ts, describe « landing page
// copy ») quand le site a déménagé dans ce repo (2026-10-18).
// Zéro dépendance : node scripts/check-invite-page.mjs (exit 1 si échec).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failures += 1;
};
const contains = (label, hay, needle) => check(label, hay.includes(needle));
const notMatches = (label, hay, re) => check(label, !re.test(hay));
const matches = (label, hay, re) => check(label, re.test(hay));

const html = read('invite/index.html');
const card = read('scripts/invite-og-card.html');
const DESC = 'Note chaque vente et chaque personne qui te doit même sans internet';

// Les textes exacts de la page.
contains("titre d'invitation", html, "On t'invite sur Patron");
contains('promesse', html, 'Note chaque vente et chaque personne qui te doit même sans internet');
contains('ligne en gras au-dessus de la promesse', html, '<p class="lede">Ton carnet, dans ton téléphone</p>');
matches('la ligne en gras est bien au-dessus de la promesse', html, /class="lede">[^<]*<\/p>\s*<p class="tagline"/);
contains('bouton App Store', html, "Télécharger sur l'App Store");
contains('bouton Play Store', html, 'Télécharger sur Play Store');
contains('signature', html, 'Gratuit et fait pour les vendeurs');
contains('preuve (repli du nombre, vérifié)', html, '<span id="shop-count" class="num">131</span> commerces</strong> déjà sur Patron');
contains('preuve (lecture du nombre en direct)', html, 'public_shop_count');
matches('phrase nominative (nom nu, sans guillemets)', html, /name \+ ' t\\u2019invite sur Patron'/);
notMatches('aucun point en fin de phrase (Patron.)', html, /Patron\./);
notMatches('aucun point en fin de phrase (internet.)', html, /internet\./);
notMatches('aucun guillemet autour du nom', html, /\\u00AB ' \+ name/);
notMatches('aucune icône dans le bouton Play Store', html, /play-icon|<svg/);

// Le lien court ?s=<slug> (Patron, migration v251) : l'alphabet sans I L O 0 1, le RPC, le referrer Play avec l'id RÉSOLU,
// et la même arrivée unique (la carte se révèle quand la résolution est faite, ou au plafond de 400 ms).
contains('lien court : alphabet sans I L O 0 1', html, 'var SLUG_RE = /^[A-HJKMNP-Z2-9]{8}$/;');
contains('lien court : appelle preview_inviter_by_slug', html, 'preview_inviter_by_slug');
contains('lien court : le referrer Play porte l\u2019id résolu', html, 'setReferrer(resolved);');
contains('lien court : le chemin uuid reste (preview_inviter)', html, "fetch(SUPABASE_URL + '/rest/v1/rpc/preview_inviter',");
matches('lien court : la carte se révèle à la fin de la résolution (slug)', html, /preview_inviter_by_slug[\s\S]{0,900}reveal\(\)/);
contains('arrivée unique : plafond 400 ms conservé', html, 'setTimeout(reveal, 400);');
notMatches('ancienne accroche absente de la page', html, /Plus de page perdue/);

// Ce qui ne doit jamais revenir : bouton copier, flux à code/jeton.
notMatches('aucun flux presse-papiers ou code', html, /Copier le lien|Lien copié|J'ai déjà Patron|id="bridge"|preview_consumer_invite/);
notMatches('jamais le presse-papiers', html, /clipboard|execCommand/i);

// La carte sociale (source de invite/og.png) : les textes exacts, jamais « boutique », plus l'ancienne accroche.
// Même règle que la page : aucun point en fin de phrase.
contains('carte : marque', card, '<div class="brand">Patron</div>');
contains('carte : titre', card, '<div class="tagline">Ton carnet, dans ton téléphone</div>');
contains('carte : promesse', card, `<div class="sub">${DESC}</div>`);
contains('carte : pied', card, '<div class="foot">Gratuit et fait pour les vendeurs</div>');
notMatches('carte : aucun point en fin de phrase (internet.)', card, /internet\./);
notMatches('carte : ancienne accroche retirée', card, /Plus de page perdue/);
notMatches('carte : jamais « boutique » (toute vendeuse n\u2019a pas de boutique)', card, /boutique/i);
notMatches('carte : aucun tiret cadratin après « doit »', card.replace(/<title>.*?<\/title>/s, ''), /doit\s*—|—/);
{
  const png = readFileSync(join(root, 'invite/og.png'));
  check('og.png : un PNG', png.subarray(0, 8).toString('hex') === '89504e470d0a1a0a');
  check('og.png : 1200×630', png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630);
  check('og.png : < 300 Ko', png.length < 300 * 1024);
}

// La carte sociale, sur la page et sur le 404.
for (const f of ['invite/index.html', '404.html']) {
  const h = read(f);
  contains(`${f} : og:description`, h, '<meta property="og:description" content="Note chaque vente et chaque personne qui te doit même sans internet" />');
  contains(`${f} : og:image`, h, '<meta property="og:image" content="https://patron.kolilink.com/invite/og.png" />');
}
matches('404.html redirige vers /invite?i=', read('404.html'), /\/invite\?i=/);

if (failures > 0) {
  console.error(`\n${failures} vérification(s) en échec.`);
  process.exit(1);
}
console.log('\nPage d\u2019invitation : tous les textes sont en place.');
