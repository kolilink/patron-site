/* Vitrine Patron — page statique ; les données viennent de la fonction vitrine-page (migrations v292, v293).
   SÉCURITÉ : le jeton est lu après « # » (jamais envoyé au serveur de ce site) et part dans le CORPS d'un POST.
   Aucun texte reçu n'est inséré comme HTML : tout passe par textContent / attributs.
   Ce que veut l'acheteur : voir vite, choisir sans réfléchir, envoyer un message qu'il aurait écrit lui-même. */
(function () {
  var API = 'https://jnxpujsyvbenqgjbvifh.supabase.co/functions/v1/vitrine-page';
  var JOIN = 'https://patron.kolilink.com/';
  var app = document.getElementById('app');
  var foot = document.getElementById('foot');
  var t = new URLSearchParams(location.hash.replace(/^#/, '')).get('t') || '';

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function buzz() { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* not every phone */ } }

  // The one promotion on the page: credited to the shop that sent the visitor (its owner's invite slug, v251/v293).
  function joinLink(slug) {
    foot.textContent = '';
    var a = el('a', 'join');
    a.href = slug && /^[A-HJKMNP-Z2-9]{8}$/.test(slug) ? 'https://patron.kolilink.com/invite/?s=' + slug : JOIN;
    a.rel = 'noopener';
    a.appendChild(document.createTextNode('Vous avez une boutique ? '));
    a.appendChild(el('b', '', 'Créez votre vitrine gratuite'));
    foot.appendChild(a);
    foot.appendChild(el('span', 'made', 'Vitrine faite avec Patron'));
  }

  function closed(title, text) {
    app.textContent = '';
    var c = el('div', 'card'); c.appendChild(el('h2', '', title)); c.appendChild(el('p', '', text)); app.appendChild(c);
    joinLink(null);
  }

  // Instant: the shape of the shop is on screen before the first byte arrives.
  (function skeleton() {
    var hd = el('div', 'hd'); hd.appendChild(el('h1', '', ' '));
    var g = el('div', 'grid');
    for (var i = 0; i < 6; i++) { var s = el('div', 'sk'); s.appendChild(el('div', 'ph')); s.appendChild(el('div', 'l')); g.appendChild(s); }
    app.appendChild(hd); app.appendChild(g);
  })();

  if (!/^[A-Za-z0-9_-]{22}$/.test(t)) { closed('Vitrine indisponible', 'Ce lien ne mène à aucune vitrine. Demandez le bon lien à la boutique.'); return; }

  var WHOLE = { GNF: 1, XOF: 1, XAF: 1, JPY: 1, KRW: 1 };
  function money(cents, cur) {
    var v = cents / 100, whole = WHOLE[cur];
    var s = v.toLocaleString('fr-FR', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).replace(/[  ]/g, ' ');
    return s + ' ' + cur;
  }

  fetch(API, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: t, referrerPolicy: 'no-referrer', cache: 'no-store' })
    .then(function (r) { return r.status === 429 ? { state: 'busy' } : r.json(); })
    .then(render)
    .catch(function () { closed('Connexion lente', 'La vitrine n’a pas pu s’ouvrir. Réessayez dans un instant.'); });

  function render(d) {
    if (!d || d.state === 'busy') { closed('Beaucoup de visites', 'Réessayez dans un instant.'); return; }
    if (d.state !== 'open') { closed('Vitrine fermée', 'Cette boutique a fermé sa vitrine pour le moment.'); return; }
    document.title = d.name + ' · Vitrine';
    app.textContent = '';
    // Only what can be bought (the server already filters; an older answer is filtered here too).
    var products = (d.products || []).filter(function (p) { return p && p.available !== false && p.price_cents > 0; });
    var phone = String(d.phone || '').replace(/\D/g, '');

    var hd = el('div', 'hd');
    hd.appendChild(el('h1', '', d.name));
    var tag = el('span', 'tag');
    if (phone) { tag.appendChild(el('span', 'dot')); tag.appendChild(document.createTextNode('Commandez sur WhatsApp')); }
    else tag.textContent = 'Nos produits et nos prix';
    hd.appendChild(tag);
    app.appendChild(hd);

    if (!products.length) {
      var c = el('div', 'card'); c.appendChild(el('h2', '', 'Nouveautés en route')); c.appendChild(el('p', '', 'La boutique prépare sa vitrine. Revenez bientôt.')); app.appendChild(c);
      joinLink(d.invite); return;
    }

    var grid = el('div', 'grid'); app.appendChild(grid);
    var order = {};
    var bar = el('div', 'bar'); var btn = el('a', 'btn dis', 'Choisissez vos produits'); bar.appendChild(btn);
    btn.target = '_blank'; btn.rel = 'noopener noreferrer';
    if (phone) document.body.appendChild(bar);

    // The message a customer would have written: a greeting, the lines with their prices, the total, and a question
    // that invites the shop to answer — the conversation starts by itself.
    function message() {
      var lines = [], total = 0;
      products.forEach(function (p, i) {
        var q = order[i] || 0;
        if (q) { lines.push('• ' + q + ' × ' + p.name + ' — ' + money(q * p.price_cents, d.currency)); total += q * p.price_cents; }
      });
      return 'Bonjour ' + d.name + ' 👋\nJ’ai vu votre vitrine. Je voudrais commander :\n' + lines.join('\n') +
        '\n\nTotal : ' + money(total, d.currency) + '\nC’est disponible ? Merci !';
    }

    function update() {
      var total = 0, count = 0;
      products.forEach(function (p, i) { var q = order[i] || 0; total += q * p.price_cents; count += q; });
      btn.textContent = '';
      if (!count) { btn.className = 'btn dis'; btn.textContent = 'Choisissez vos produits'; btn.removeAttribute('href'); return; }
      btn.className = 'btn';
      btn.appendChild(el('span', 'sum', count + (count > 1 ? ' articles · ' : ' article · ') + money(total, d.currency)));
      btn.appendChild(el('span', '', 'Commander sur WhatsApp ›'));
      btn.href = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message());
    }

    products.forEach(function (p, i) {
      var card = el('div', 'p'); card.setAttribute('role', 'button'); card.tabIndex = 0;
      card.setAttribute('aria-label', p.name + ', ' + money(p.price_cents, d.currency));
      var ph = el('div', 'ph');
      if (p.photo) {
        var img = el('img'); img.alt = ''; img.loading = i < 6 ? 'eager' : 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
        img.onload = function () { img.className = 'in'; };
        img.onerror = function () { img.remove(); ph.insertBefore(el('div', 'cover', p.name), ph.firstChild); };
        img.src = p.photo; ph.appendChild(img);
      } else ph.appendChild(el('div', 'cover', p.name));
      if (p.low) ph.appendChild(el('span', 'low', 'Bientôt épuisé'));
      var badge = el('span', 'badge', ''); badge.hidden = true; ph.appendChild(badge);
      card.appendChild(ph);

      var body = el('div', 'body');
      body.appendChild(el('span', 'n', p.name));
      var row = el('div', 'row');
      row.appendChild(el('span', 'pr', money(p.price_cents, d.currency)));
      var minus = el('span', 'minus', '−'); minus.setAttribute('role', 'button'); minus.setAttribute('aria-label', 'Un de moins'); minus.hidden = true;
      var add = el('span', 'add', '+'); add.setAttribute('aria-hidden', 'true');
      if (phone) { row.appendChild(minus); row.appendChild(add); }
      body.appendChild(row); card.appendChild(body);

      function show(popped) {
        var q = order[i] || 0;
        card.className = 'p' + (q ? ' on' : '') + (popped ? ' pop' : '');
        badge.hidden = !q; badge.textContent = q ? String(q) : '';
        minus.hidden = !q;
        update();
      }
      if (phone) {
        var inc = function () { order[i] = Math.min(99, (order[i] || 0) + 1); buzz(); card.className = 'p on'; void card.offsetWidth; show(true); };
        card.addEventListener('click', inc);
        card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inc(); } });
        minus.addEventListener('click', function (e) { e.stopPropagation(); order[i] = Math.max(0, (order[i] || 0) - 1); buzz(); show(false); });
      }
      grid.appendChild(card);
    });
    update();
    joinLink(d.invite);
  }
})();
