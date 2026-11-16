/* Vitrine Patron — page statique ; les données viennent de la fonction vitrine-page (migration_v292).
   SÉCURITÉ : le jeton est lu après « # » (jamais envoyé au serveur de ce site) et part dans le CORPS d'un POST.
   Aucun texte reçu n'est inséré comme HTML : tout passe par textContent / attributs. */
(function () {
  var API = 'https://jnxpujsyvbenqgjbvifh.supabase.co/functions/v1/vitrine-page';
  var app = document.getElementById('app');
  var t = new URLSearchParams(location.hash.replace(/^#/, '')).get('t') || '';
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function message(text) { app.textContent = ''; var c = el('div', 'card'); c.appendChild(el('p', 'sub', text)); app.appendChild(c); }
  if (!/^[A-Za-z0-9_-]{22}$/.test(t)) { message("Cette vitrine n'est pas disponible."); return; }

  var WHOLE = { GNF: 1, XOF: 1, XAF: 1, JPY: 1, KRW: 1 };
  function money(cents, cur) {
    var v = cents / 100, whole = WHOLE[cur];
    var s = v.toLocaleString('fr-FR', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).replace(/[  ]/g, ' ');
    return s + ' ' + cur;
  }
  function initials(name) { return (name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0] || ''; }).join('').toUpperCase(); }

  fetch(API, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: t, referrerPolicy: 'no-referrer', cache: 'no-store' })
    .then(function (r) { return r.status === 429 ? { state: 'busy' } : r.json(); })
    .then(render)
    .catch(function () { message('Pas de connexion. Réessayez dans un instant.'); });

  function render(d) {
    if (!d || d.state === 'busy') { message('Trop de visites. Réessayez dans un instant.'); return; }
    if (d.state !== 'open') { message("Cette vitrine n'est pas disponible."); return; }
    document.title = d.name + ' · Vitrine';
    app.textContent = '';
    app.appendChild(el('h1', '', d.name));
    var products = d.products || [];
    app.appendChild(el('p', 'sub', products.length ? 'Touchez les produits que vous voulez, puis commandez sur WhatsApp.' : 'Les produits arrivent bientôt.'));
    var grid = el('div', 'grid'); app.appendChild(grid);
    var order = {};
    var phone = String(d.phone || '').replace(/\D/g, '');
    var bar = el('div', 'bar'); var btn = el('a', 'btn dis', 'Commander sur WhatsApp'); bar.appendChild(btn);
    if (phone) document.body.appendChild(bar);

    function update() {
      var lines = [], total = 0, count = 0;
      products.forEach(function (p, i) { var q = order[i] || 0; if (q) { lines.push(q + ' × ' + p.name); total += q * p.price_cents; count += q; } });
      btn.className = count ? 'btn' : 'btn dis';
      btn.textContent = count ? 'Commander sur WhatsApp (' + count + ')' : 'Commander sur WhatsApp';
      var text = 'Bonjour ' + d.name + ', je voudrais :\n' + lines.join('\n') + '\nTotal : ' + money(total, d.currency);
      btn.href = count ? 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text) : '#';
      btn.target = '_blank'; btn.rel = 'noopener noreferrer';
    }

    products.forEach(function (p, i) {
      var card = el('button', 'p' + (p.available ? '' : ' off')); card.type = 'button';
      var ph = el('div', 'ph');
      if (p.photo) { var img = el('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; img.src = p.photo; ph.appendChild(img); }
      else ph.textContent = initials(p.name);
      card.appendChild(ph);
      card.appendChild(el('span', 'n', p.name));
      card.appendChild(el('span', 'pr', money(p.price_cents, d.currency)));
      var row = el('span', 'row'); var sub = el('span', p.available ? 'q' : 'na', p.available ? '' : 'Épuisé');
      var minus = el('span', 'minus', '−'); minus.setAttribute('role', 'button'); minus.setAttribute('aria-label', 'Un de moins'); minus.hidden = true;
      row.appendChild(sub); row.appendChild(minus); card.appendChild(row);
      function show() {
        var q = order[i] || 0;
        card.className = 'p' + (q ? ' on' : '');
        sub.textContent = q ? q + ' dans la commande' : '';
        minus.hidden = !q;
        update();
      }
      if (p.available && phone) {
        card.addEventListener('click', function () { order[i] = Math.min(99, (order[i] || 0) + 1); show(); });
        minus.addEventListener('click', function (e) { e.stopPropagation(); order[i] = Math.max(0, (order[i] || 0) - 1); show(); });
      }
      grid.appendChild(card);
    });
    update();
  }
})();
