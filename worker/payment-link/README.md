# Lien de paiement — patron.kolilink.com/p/<token>

Un Worker Cloudflare sur `patron.kolilink.com/p/*` (le reste du site reste sur GitHub Pages).
Il ne contient ni logique d'argent ni clé Djomy : il demande les chiffres à la fonction Supabase
`payment-page` (repo privé), puis renvoie la page avec les balises WhatsApp propres à ce lien
et la carte image `/p/<token>/card.png`.

Déploiement (une fois) :
1. `cd worker/payment-link && npm i && npx wrangler secret put RELAY_SECRET`
   (même valeur que le secret Supabase `PAYMENT_PAGE_RELAY_SECRET`).
2. `npx wrangler deploy`. Le domaine kolilink.com doit être sur Cloudflare (route `patron.kolilink.com/p/*`).
3. Côté Supabase : `supabase secrets set PAYMENT_PAGE_RELAY_SECRET=...` puis
   `supabase functions deploy payment-page --no-verify-jwt`.

Tests : `node scripts/check-payment-link.mjs`. Le bouton « Payer » reste inactif tant que le paiement
en ligne n'est pas ouvert (couches suivantes). Les pastilles Orange Money / MTN / PayCard sont des
placeholders de texte en attendant les vrais logos.
