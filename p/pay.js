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
  function methods() {
    return '<div class="m"><span class="om">Orange Money</span><span class="mtn">MTN MoMo</span><span class="pc">PayCard</span></div>';
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
      return '<div class="card"><h1>' + shop + '</h1><p class="sub">Pour ' + name + '</p><p class="big" style="font-size:22px">Vous ne devez rien à ' + shop + '. Merci !</p></div>';
    }
    var ask = requestedCents(page, a);
    var lines = (page.last_lines || []).map(function (l) {
      return '<li><span>' + esc(l.date) + (l.item ? ' · ' + esc(l.item) : '') + '</span><span>' + money(page, l.amount_cents) + '</span></li>';
    }).join('');
    var target = ask || page.balance_cents;
    return '<div class="card"><h1>' + shop + '</h1><p class="sub">Pour ' + name + '</p>' +
      '<p class="lab">Reste à payer</p><p class="big">' + formatAmount(page.balance_cents, page.decimals) + ' <small>' + esc(page.currency) + '</small></p>' +
      (ask ? '<p class="ask">' + shop + ' demande ' + money(page, ask) + ' aujourd’hui. <a href="">Tout payer</a></p>' : '') +
      (lines ? '<ul>' + lines + '</ul>' : '') + methods() +
      '<button class="btn" disabled>Payer ' + money(page, target) + '</button>' +
      '<p class="note">Le paiement en ligne n’est pas encore ouvert pour cette boutique.</p></div>';
  }
  /* search = location.search. Retourne le HTML à afficher ; ne lance jamais d'exception. */
  async function loadAndRender(fetchFn, search) {
    var q = new URLSearchParams(search || '');
    var t = q.get('t') || '';
    if (!TOKEN_RE.test(t)) return inactive();                 // un jeton mal formé ne part jamais au serveur
    var res;
    try { res = await fetchFn(FN + '?t=' + encodeURIComponent(t)); } catch (e) { return unavailable(); }
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
})(typeof window !== 'undefined' ? window : this);
