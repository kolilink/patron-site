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

// Les textes exacts de la page.
contains("titre d'invitation", html, "On t'invite sur Patron.");
contains('promesse', html, 'Note tes ventes, suis tes crédits avec ou sans internet');
contains('bouton App Store', html, "Télécharger sur l'App Store");
contains('bouton Play Store', html, 'Télécharger sur Play Store');
contains('signature', html, 'Gratuit · Fait pour les commerçants');
matches('phrase nominative « X t’invite sur Patron. »', html, /\\u00AB ' \+ name \+ ' \\u00BB t\\u2019invite sur Patron\./);

// Ce qui ne doit jamais revenir : bouton copier, flux à code/jeton.
notMatches('aucun flux presse-papiers ou code', html, /Copier le lien|Lien copié|J'ai déjà Patron|id="bridge"|preview_consumer_invite/);
notMatches('jamais le presse-papiers', html, /clipboard|execCommand/i);

// La carte sociale, sur la page et sur le 404.
for (const f of ['invite/index.html', '404.html']) {
  const h = read(f);
  contains(`${f} : og:description`, h, '<meta property="og:description" content="Note tes ventes, suis tes crédits avec ou sans internet" />');
  contains(`${f} : og:image`, h, '<meta property="og:image" content="https://patron.kolilink.com/invite/og.png" />');
}
matches('404.html redirige vers /invite?i=', read('404.html'), /\/invite\?i=/);

if (failures > 0) {
  console.error(`\n${failures} vérification(s) en échec.`);
  process.exit(1);
}
console.log('\nPage d\u2019invitation : tous les textes sont en place.');
