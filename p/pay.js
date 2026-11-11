/* Page de paiement — patron.kolilink.com/p/#t=<jeton>
 * Statique (GitHub Pages) : le navigateur demande les chiffres EN DIRECT à la fonction Supabase
 * `payment-page`. Aucune donnée privée dans ce fichier. « Payer » demande une page de paiement à Djomy
 * (fonction `payment-pay`), qui demande le numéro et le moyen (Orange Money, MTN MoMo, PayCard). Au retour
 * (?r=<tentative>#t=<jeton>), la page demande à NOTRE serveur si Djomy a confirmé — l'adresse de retour ne
 * prouve rien. Même code testé par scripts/check-payment-link.mjs. */
(function (root) {
  'use strict';
  var FN = 'https://jnxpujsyvbenqgjbvifh.supabase.co/functions/v1/payment-page';
  var FN_PAY = 'https://jnxpujsyvbenqgjbvifh.supabase.co/functions/v1/payment-pay';
  var TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var STORE = 'patron_pay';
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
  /* « il y a 3 min » — pour dire au client ce qu'il a déjà payé. */
  /* Forcé en nombre entier : jamais un texte venu du serveur inséré tel quel dans la page. */
  function agoText(min) { var m = Math.max(0, Math.floor(Number(min) || 0)); return m < 1 ? 'à l’instant' : 'il y a ' + m + ' min'; }
  /* Un second paiement du MÊME montant juste après un paiement confirmé ressemble à un doublon : on demande une fois. */
  function looksLikeRepeat(page, targetCents) {
    var r = page && page.recent_payment;
    return !!(r && Number(r.amount_cents) === Number(targetCents));
  }
  function recentLine(page) {
    var r = page.recent_payment;
    return r ? '<p class="ok2">Vous avez payé ' + money(page, r.amount_cents) + ' ' + agoText(r.minutes_ago) + ' ✓</p>' : '';
  }
  function advanceText(page, shop) {
    return 'Vous avez une avance de ' + money(page, page.advance_cents) + ' chez ' + shop + '. Elle sera déduite de votre prochain achat, ou rendue par la boutique.';
  }
  function render(page, a) {
    if (!page || (page.state !== 'owing' && page.state !== 'clear')) return inactive();
    var name = esc(page.first_name), shop = esc(page.shop_name);
    if (page.state === 'clear') {
      var msg = page.advance_cents > 0 ? advanceText(page, shop) : 'Tout est réglé. Merci pour votre confiance.';
      return '<div class="card"><h1>' + shop + '</h1><p class="sub">Bonjour ' + name + '</p>' + recentLine(page) +
        '<p class="big" style="font-size:22px">' + msg + '</p></div>';
    }
    var ask = requestedCents(page, a);
    var lines = (page.last_lines || []).map(function (l) {
      return '<li><span>' + esc(l.date) + (l.item ? ' · ' + esc(l.item) : '') + '</span><span>' + money(page, l.amount_cents) + '</span></li>';
    }).join('');
    var target = ask || page.balance_cents;
    var repeat = looksLikeRepeat(page, target);
    return '<div class="card"><h1>' + shop + '</h1><p class="sub">Bonjour ' + name + '</p>' + recentLine(page) +
      '<p class="lab">Il vous reste à régler</p><p class="big">' + formatAmount(page.balance_cents, page.decimals) + ' <small>' + esc(page.currency) + '</small></p>' +
      (ask ? '<p class="ask">' + shop + ' vous propose de régler ' + money(page, ask) + ' aujourd’hui. <a href="">Tout régler</a></p>' : '') +
      (lines ? '<ul>' + lines + '</ul>' : '') + methods() +
      '<label class="lab" for="pn">Votre numéro Orange Money ou MTN MoMo</label><input id="pn" type="tel" inputmode="tel" autocomplete="tel" placeholder="6XX XX XX XX" maxlength="20" style="width:100%;box-sizing:border-box;font-size:18px;padding:12px;margin:4px 0 6px;border:1px solid #cfcade;border-radius:10px"><p class="note" id="pnerr" style="color:#92400e;min-height:18px"></p>' +
      '<button class="btn" id="pay" data-cents="' + Math.trunc(Number(target) || 0) + '"' + (repeat ? ' data-repeat="1"' : '') + '>' +
      (repeat ? 'Payer encore ' : 'Payer ') + money(page, target) + '</button>' +
      (repeat ? '<p class="note">Vous venez déjà de payer ce montant. Si c’est voulu, touchez encore pour confirmer.</p>' : '') + '</div>';
  }
  /* ── Les états d'une tentative de paiement (migration_v276). Seul « confirmed » a bougé de l'argent. ── */
  var REASONS = {
    insufficient_funds: 'Solde insuffisant.',
    wrong_code: 'Code secret incorrect.',
    operator_down: 'L’opérateur ne répond pas pour le moment.',
    refused: 'Le paiement a été refusé.'
  };
  /* at = { state, reason, amount_cents, balance_cents, min_cents } ; o = { waitedMs, demo } */
  function renderAttempt(page, at, o) {
    o = o || {};
    var shop = esc(page.shop_name), amt = at.amount_cents != null ? money(page, at.amount_cents) : '';
    var banner = o.demo ? '<p class="demo">EXEMPLE · aucun paiement réel</p>' : '';
    var head = banner + '<h1>' + shop + '</h1>';
    var again = '<a class="btn" href="' + esc(o.again || '') + '">Réessayer</a>';
    var verify = '<a class="btn" href="">Vérifier</a>';
    var body;
    switch (at.state) {
      case 'open':
        body = '<p class="sub">Confirmez avec votre code secret sur votre téléphone.</p><p class="big">' + amt + '</p>' +
          ((o.waitedMs || 0) >= 120000 ? verify : '<p class="note">En attente de votre confirmation…</p>');
        break;
      case 'confirmed':
        /* Le reçu dit EXACTEMENT ce qui a été reçu (le montant confirmé), jamais le montant demandé. */
        var got = at.confirmed_cents != null ? money(page, at.confirmed_cents) : amt;
        var left = at.advance_cents > 0 ? advanceText({ currency: page.currency, decimals: page.decimals, advance_cents: at.advance_cents }, shop)
          : at.balance_cents > 0 ? 'Il vous reste ' + money(page, at.balance_cents) + '.'
          : 'Vous ne devez plus rien à ' + shop + '. Merci !';
        body = '<p class="ok">Paiement reçu ✓</p><p class="big">' + got + '</p><p class="sub">' + left + '</p>' +
          '<p class="note">Faites une capture d’écran pour garder ce reçu.</p>';
        break;
      case 'failed':
        body = '<p class="sub">Le paiement n’est pas passé. Votre argent n’a pas bougé.</p>' +
          (REASONS[at.reason] ? '<p class="why">' + REASONS[at.reason] + '</p>' : '') + again;
        break;
      case 'expired':
        body = '<p class="sub">Toujours en attente. Si votre compte a été débité, la boutique le verra dès la confirmation.</p>' + verify;
        break;
      case 'busy':
        body = '<p class="sub">Un paiement est déjà en cours sur ce lien.</p>' + verify;
        break;
      case 'too_low':
        body = '<p class="sub">Minimum ' + money(page, at.min_cents) + ' par paiement.</p>';
        break;
      case 'too_high':
        body = '<p class="sub">Le montant à régler a changé.</p>' + again;
        break;
      case 'rate_limited':
        body = '<p class="sub">Trop d’essais pour le moment. Réessayez dans une heure.</p>';
        break;
      case 'clear':
        body = '<p class="sub">Tout est réglé. Merci pour votre confiance.</p>';
        break;
      case 'invalid':
        body = '<p class="sub">Ce montant ne peut pas être payé en ligne.</p>' + again;
        break;
      default:
        return inactive();
    }
    return '<div class="card">' + head + body + '</div>';
  }
  /* ?demo=open|confirmed|failed|expired|busy|too_low — des écrans d'exemple, marqués comme tels, jamais de vraies données. */
  var DEMO_PAGE = { shop_name: 'Boutique Exemple', first_name: 'Client', currency: 'GNF', decimals: 0 };
  function demo(name, reason) {
    var states = ['open', 'confirmed', 'failed', 'expired', 'busy', 'too_low'];
    var banner = '<p class="demo">EXEMPLE · aucun paiement réel</p>';
    if (name === 'twice') {   /* il vient de payer 40 000 ; la page l'accueille avec « Vous avez payé… » */
      return banner + render({ state: 'owing', shop_name: 'Boutique Exemple', first_name: 'Client', currency: 'GNF', decimals: 0, balance_cents: 4500000,
        recent_payment: { amount_cents: 4000000, minutes_ago: 3 }, last_lines: [] }, '40000');
    }
    if (name === 'advance') {
      return banner + render({ state: 'clear', shop_name: 'Boutique Exemple', first_name: 'Client', currency: 'GNF', decimals: 0, balance_cents: 0, advance_cents: 3000000,
        recent_payment: { amount_cents: 8500000, minutes_ago: 1 }, last_lines: [] });
    }
    if (name === 'over') {
      return renderAttempt(DEMO_PAGE, { state: 'confirmed', amount_cents: 8500000, confirmed_cents: 8500000, balance_cents: 0, advance_cents: 3000000 }, { demo: true });
    }
    if (name === 'short') {
      return renderAttempt(DEMO_PAGE, { state: 'confirmed', amount_cents: 8500000, confirmed_cents: 8400000, balance_cents: 100000, advance_cents: 0 }, { demo: true });
    }
    if (states.indexOf(name) < 0) return null;
    return renderAttempt(DEMO_PAGE, { state: name, reason: reason || 'insufficient_funds', amount_cents: 4000000, balance_cents: 4500000, min_cents: 100000 },
      { demo: true, waitedMs: 0 });
  }
  /* SÉCURITÉ (couche 8) : le jeton vit APRÈS « # » dans l'adresse (#t=…). Un navigateur n'envoie jamais cette partie à
     un serveur : ni GitHub Pages, ni Supabase, ni un proxy, ni un en-tête Referer ne la voient. Les anciens liens ?t=…
     marchent encore. Dans les deux cas, le jeton part dans le CORPS d'une requête POST, jamais dans une adresse. */
  function tokenFrom(search, hash) {
    var h = new URLSearchParams(String(hash || '').replace(/^#/, ''));
    var q = new URLSearchParams(search || '');
    return h.get('t') || q.get('t') || '';
  }
  /* Une seule façon d'appeler nos fonctions : POST, text/plain (requête « simple » : pas d'aller-retour CORS de plus en 2G). */
  function post(fetchFn, url, body) {
    return fetchFn(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: body, referrerPolicy: 'no-referrer', cache: 'no-store' });
  }
  function request(fetchFn, t) { return post(fetchFn, FN, t); }
  function startBody(t, cents, payer) { return JSON.stringify({ op: 'start', t: t, amount_cents: cents, payer: payer || '' }); }
  /* Numéro mobile guinéen : 9 chiffres commençant par 6 (avec ou sans +224). Djomy refuse un paiement sans le numéro du payeur. */
  function cleanPayer(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (d.indexOf('00224') === 0) d = d.slice(5); else if (d.indexOf('224') === 0 && d.length === 12) d = d.slice(3);
    return /^6\d{8}$/.test(d) ? d : '';
  }
  function checkBody(t, a) { return JSON.stringify({ op: 'check', t: t, a: a }); }
  function attemptFrom(search) { var r = new URLSearchParams(search || '').get('r') || ''; return UUID_RE.test(r) ? r : ''; }
  /* Si Djomy nous renvoie sans la partie « # », le jeton gardé sur CE téléphone au moment de « Payer ». */
  function remembered(storage, r) {
    try { var s = JSON.parse((storage && storage.getItem(STORE)) || 'null'); return s && s.r === r && TOKEN_RE.test(s.t) ? s.t : ''; } catch (e) { return ''; }
  }
  function homeHref(t) { return '/p/#t=' + t; }
  async function readJson(res) {
    if (!res || res.status === 429 || res.status >= 500) return null;
    try { return await res.json(); } catch (e) { return null; }
  }
  var FINAL = { confirmed: 1, failed: 1, inactive: 1 };
  /* Retour de Djomy : on demande à NOTRE serveur où en est la tentative. Un réseau qui hoquette = on attend encore. */
  async function checkOnce(fetchFn, page, t, r, waitedMs) {
    var at = null;
    try { at = await readJson(await post(fetchFn, FN_PAY, checkBody(t, r))); } catch (e) { at = null; }
    if (!at) return { html: renderAttempt(page, { state: 'open' }, { waitedMs: waitedMs, again: homeHref(t) }), done: false };
    return { html: renderAttempt(page, at, { waitedMs: waitedMs, again: homeHref(t) }), done: !!FINAL[at.state] };
  }
  /* « Payer » : la page de Djomy (adresse https), ou l'état à afficher. */
  async function startPay(fetchFn, page, t, cents, payer) {
    var res = null;
    try { res = await readJson(await post(fetchFn, FN_PAY, startBody(t, cents, payer))); } catch (e) { res = null; }
    if (!res) return { html: unavailable() };
    if (res.state === 'redirect' && /^https:\/\/[^/]*djomy\.africa\//.test(String(res.url)) && UUID_RE.test(String(res.attempt_id))) {
      return { go: res.url, r: res.attempt_id };
    }
    return { html: renderAttempt(page, res, { again: homeHref(t) }) };
  }
  var last = null;
  /* search = location.search, hash = location.hash. Retourne le HTML à afficher ; ne lance jamais d'exception. */
  async function loadAndRender(fetchFn, search, hash, storage) {
    var q = new URLSearchParams(search || '');
    var d = q.get('demo') ? demo(q.get('demo'), q.get('reason')) : null;
    if (d) return d;
    var t = tokenFrom(search, hash);
    var r = attemptFrom(search);
    if (!TOKEN_RE.test(t) && r) t = remembered(storage, r);
    if (!TOKEN_RE.test(t)) return inactive();                 // un jeton mal formé ne part jamais au serveur
    var res;
    try {
      // la demande a déjà été lancée par index.html (même jeton) : on la reprend au lieu d'en refaire une
      var early = root.__pay && root.__pay.t === t ? root.__pay.p : null;
      res = early ? await early : null;
      if (!res) res = await request(fetchFn, t);   // pas de demande anticipée, ou elle a échoué : une seule reprise
    } catch (e) { return unavailable(); }
    if (!res || res.status === 429 || res.status >= 500) return unavailable();
    var page;
    try { page = await res.json(); } catch (e) { return unavailable(); }
    last = { page: page, t: t, r: '', done: true };
    if (r && page && (page.state === 'owing' || page.state === 'clear')) {
      var c = await checkOnce(fetchFn, page, t, r, 0);
      last.r = r; last.done = c.done;
      return c.html;
    }
    return render(page, q.get('a'));
  }

  var api = { cleanPayer: cleanPayer, FN_PAY: FN_PAY, startBody: startBody, checkBody: checkBody, attemptFrom: attemptFrom, remembered: remembered, checkOnce: checkOnce, startPay: startPay, STORE: STORE,
    lastState: function () { return last; }, tokenFrom: tokenFrom, request: request, looksLikeRepeat: looksLikeRepeat, agoText: agoText, renderAttempt: renderAttempt, demo: demo, REASONS: REASONS, formatAmount: formatAmount, requestedCents: requestedCents, render: render, inactive: inactive, unavailable: unavailable, loadAndRender: loadAndRender, esc: esc, FN: FN };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.PatronPay = api;
  var app = root.document && root.document.getElementById('app');
  if (!app) return;
  var fetchFn = function (u, init) { return root.fetch(u, init); };
  var storage = null;
  try { storage = root.localStorage; } catch (e) { storage = null; }
  var t0 = Date.now();
  /* Au retour de Djomy : on redemande toutes les 3 s pendant 2 min, puis « Vérifier » (qui recharge et reprend). */
  function poll() {
    setTimeout(function () {
      var w = Date.now() - t0;
      checkOnce(fetchFn, last.page, last.t, last.r, w).then(function (c) {
        app.innerHTML = c.html;
        if (!c.done && w < 120000) poll();
      });
    }, 3000);
  }
  loadAndRender(fetchFn, root.location.search, root.location.hash, storage).then(function (h) {
    app.innerHTML = h;
    if (last && last.r && !last.done) poll();
  });
  app.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('#pay') : null;
    if (!b || b.disabled || !last) return;
    if (b.getAttribute('data-repeat') === '1') { b.removeAttribute('data-repeat'); b.textContent = 'Touchez encore pour confirmer'; return; }
    var box = root.document.getElementById('pn'), payer = cleanPayer(box && box.value);
    if (!payer) { var er = root.document.getElementById('pnerr'); if (er) er.textContent = 'Entrez votre numéro mobile (9 chiffres, il commence par 6).'; if (box) box.focus(); return; }
    b.disabled = true;
    b.textContent = 'Ouverture…';
    startPay(fetchFn, last.page, last.t, Number(b.getAttribute('data-cents')), payer).then(function (s) {
      if (s.go) {
        try { if (storage) storage.setItem(STORE, JSON.stringify({ t: last.t, r: s.r })); } catch (er) { /* navigation privée : le # suffit */ }
        root.location.assign(s.go);
        return;
      }
      app.innerHTML = s.html;
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
