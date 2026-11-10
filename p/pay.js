/* Page de paiement — patron.kolilink.com/p/?t=<jeton>
 * Statique (GitHub Pages) : le navigateur demande les chiffres EN DIRECT à la fonction Supabase
 * `payment-page`. Aucune donnée privée dans ce fichier. Le bouton « Payer » reste inactif tant que
 * le paiement en ligne n'est pas ouvert. Même code testé par scripts/check-payment-link.mjs. */
(function (root) {
  'use strict';
  var FN = 'https://jnxpujsyvbenqgjbvifh.supabase.co/functions/v1/payment-page';
  var TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
  var NB = ' ';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* Montants exacts, jamais arrondis. Les montants sont en centimes (×100) comme dans la base. */
  function formatAmount(cents, decimals) {
    var n = Math.max(0, Math.trunc(Number(cents) || 0));
    var whole = Math.trunc(n / 100), frac = n % 100;
    var g = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, NB);
    return decimals > 0 ? g + ',' + String(frac).padStart(2, '0') : g;
  }
  function money(page, cents) {
    return formatAmount(cents == null ? page.balance_cents : cents, page.decimals) + ' ' + esc(page.currency);
  }
  /* La boutique peut demander moins que le total (?a=40000). Entier positif, strictement sous le Reste. */
  function requestedCents(page, raw) {
    if (!/^\d{1,12}$/.test(raw || '')) return null;
    var cents = Number(raw) * (page.decimals === 0 ? 100 : 1);
    return cents > 0 && cents < page.balance_cents ? cents : null;
  }
  /* Les marques des trois opérateurs, les mêmes tracés vectoriels que l'app (MethodLogo.tsx). */
  var LOGOS = [
    ['Orange Money', '0 0 44 24', 44 / 24, '<path d="M5 19 L17 6" stroke="#1A1A1A" stroke-width="4.2" stroke-linecap="round" fill="none"/><polyline points="7,5 17.5,5 17.5,15.5" stroke="#1A1A1A" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M39 5 L27 18" stroke="#FF7900" stroke-width="4.2" stroke-linecap="round" fill="none"/><polyline points="26.5,8.5 26.5,19 37,19" stroke="#FF7900" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'],
    ['MTN MoMo', '0 0 41 24', 41 / 24, '<rect width="41" height="24" rx="4" fill="#FFCB05"/><ellipse cx="20.5" cy="12" rx="17.5" ry="9" stroke="#1A1A1A" stroke-width="1.8" fill="none"/><text x="20.5" y="15.6" font-size="9.5" font-weight="900" fill="#1A1A1A" text-anchor="middle" font-family="Arial,Helvetica,sans-serif">MTN</text>'],
    ['PayCard', '95 112 954 536', 954 / 536, '<path d="M197 590 A267 267 0 1 1 365 647 L365 545 A165 165 0 1 0 197 380 Z" fill="#1A1A1A"/><path d="M1049 295 A268 268 0 1 0 1049 465 L938 465 A166 166 0 1 1 938 295 Z" fill="#1A1A1A"/>']
  ];
  function methods() {
    return '<div class="m">' + LOGOS.map(function (l) {
      var w = Math.round(l[2] * 26);
      return '<svg role="img" aria-label="' + l[0] + '" width="' + w + '" height="26" viewBox="' + l[1] + '">' + l[3] + '</svg>';
    }).join('') + '</div>';
  }
  function inactive() {
    return '<div class="card"><h1>Lien inactif</h1><p class="sub">Ce lien n’est plus actif. Demandez un nouveau lien à la boutique.</p></div>';
  }
  function unavailable() {
    return '<div class="card"><h1>Pas de connexion</h1><p class="sub">Réessayez dans un instant.</p><a class="btn" href="">Réessayer</a></div>';
  }
  function render(page, a) {
    if (!page || (page.state !== 'owing' && page.state !== 'clear')) return inactive();
    var name = esc(page.first_name), shop = esc(page.shop_name);
    if (page.state === 'clear') {
      return '<div class="card"><h1>' + shop + '</h1><p class="sub">Bonjour ' + name + '</p><p class="big" style="font-size:22px">Tout est réglé. Merci pour votre confiance.</p></div>';
    }
    var ask = requestedCents(page, a);
    var lines = (page.last_lines || []).map(function (l) {
      return '<li><span>' + esc(l.date) + (l.item ? ' · ' + esc(l.item) : '') + '</span><span>' + money(page, l.amount_cents) + '</span></li>';
    }).join('');
    var target = ask || page.balance_cents;
    return '<div class="card"><h1>' + shop + '</h1><p class="sub">Bonjour ' + name + '</p>' +
      '<p class="lab">Il vous reste à régler</p><p class="big">' + formatAmount(page.balance_cents, page.decimals) + ' <small>' + esc(page.currency) + '</small></p>' +
      (ask ? '<p class="ask">' + shop + ' vous propose de régler ' + money(page, ask) + ' aujourd’hui. <a href="">Tout régler</a></p>' : '') +
      (lines ? '<ul>' + lines + '</ul>' : '') + methods() +
      '<button class="btn" disabled>Payer ' + money(page, target) + '</button>' +
      '<p class="note">Le paiement en ligne s’ouvre bientôt pour cette boutique.</p></div>';
  }
  /* search = location.search. Retourne le HTML à afficher ; ne lance jamais d'exception. */
  async function loadAndRender(fetchFn, search) {
    var q = new URLSearchParams(search || '');
    var t = q.get('t') || '';
    if (!TOKEN_RE.test(t)) return inactive();                 // un jeton mal formé ne part jamais au serveur
    var res;
    try {
      // la demande a déjà été lancée par index.html (même jeton) : on la reprend au lieu d'en refaire une
      var early = root.__pay && root.__pay.t === t ? root.__pay.p : null;
      res = early ? await early : null;
      if (!res) res = await fetchFn(FN + '?t=' + encodeURIComponent(t));   // pas de demande anticipée, ou elle a échoué : une seule reprise
    } catch (e) { return unavailable(); }
    if (!res || res.status === 429 || res.status >= 500) return unavailable();
    var page;
    try { page = await res.json(); } catch (e) { return unavailable(); }
    return render(page, q.get('a'));
  }

  var api = { formatAmount: formatAmount, requestedCents: requestedCents, render: render, inactive: inactive, unavailable: unavailable, loadAndRender: loadAndRender, esc: esc, FN: FN };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.PatronPay = api;
  var app = root.document && root.document.getElementById('app');
  if (app) loadAndRender(function (u) { return root.fetch(u); }, root.location.search).then(function (h) { app.innerHTML = h; });
})(typeof window !== 'undefined' ? window : globalThis);
