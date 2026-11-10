// Pure rendering for patron.kolilink.com/p/<token>: no network, no secrets, fully testable.
// The page is server-rendered (works with no JavaScript, opens on 2G in WhatsApp's browser,
// under 100 KB, no web fonts). Nothing here moves money: until the shop's online payment is
// switched on, « Payer » is shown but inactive.

export const ORIGIN = 'https://patron.kolilink.com';
export const METHODS = ['Orange Money', 'MTN MoMo', 'PayCard'];
const BOT_RE = /whatsapp|facebookexternalhit|facebot|twitterbot|telegrambot|slackbot|linkedinbot|discordbot|googlebot|bingbot|skypeuripreview|applebot/i;
export const isBot = (ua = '') => BOT_RE.test(ua);

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 85000 -> « 85 000 » (non-breaking space groups, never a rounding: amounts are exact). */
export function formatAmount(cents, decimals = 0) {
  const n = Math.max(0, Math.trunc(Number(cents) || 0));
  const whole = Math.trunc(n / 100), frac = n % 100;
  const g = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return decimals > 0 ? `${g},${String(frac).padStart(2, '0')}` : g;
}
export const money = (page, cents = page.balance_cents) => `${formatAmount(cents, page.decimals)} ${esc(page.currency)}`;

/** The shop may ask for less than the total (?a=40000). Only a whole, positive amount strictly below the Reste counts. */
export function requestedCents(page, raw) {
  if (!/^\d{1,12}$/.test(raw ?? '')) return null;
  const unit = page.decimals === 0 ? 100 : 1;               // GNF: whole francs; 2-decimal currencies: the number is in cents
  const cents = Number(raw) * unit;
  return cents > 0 && cents < page.balance_cents ? cents : null;
}

const CSS = `*{box-sizing:border-box}body{margin:0;background:#f6f5fb;color:#17152b;font:16px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
main{max-width:440px;margin:0 auto;padding:20px 16px 40px}.card{background:#fff;border-radius:16px;padding:20px;box-shadow:0 1px 3px rgba(23,21,43,.08)}
h1{font-size:15px;letter-spacing:.06em;text-transform:uppercase;margin:0 0 2px}.sub{color:#6b6880;margin:0 0 18px}
.lab{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b6880;margin:0}.big{font-size:44px;font-weight:700;line-height:1.1;margin:2px 0 14px}.big small{font-size:18px;font-weight:600;color:#6b6880}
.ask{background:#fff7e6;border-radius:10px;padding:10px 12px;margin:0 0 14px;font-size:14px}
ul{list-style:none;margin:0 0 16px;padding:0}li{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid #ece9f6;font-size:14px}li span:first-child{color:#6b6880}
.m{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}.m span{font-weight:700;font-size:13px;border-radius:6px;padding:5px 9px}.om{background:#ff7900;color:#fff}.mtn{background:#ffcc00;color:#111}.pc{background:#0a7a3d;color:#fff}
.btn{display:block;width:100%;border:0;border-radius:12px;padding:15px;font:inherit;font-weight:700;font-size:17px;background:#6366f1;color:#fff;text-align:center}.btn[disabled]{background:#c9c8e8;color:#fff}
.alt{display:block;text-align:center;margin-top:10px;font-size:14px;color:#4f46e5}.note{color:#6b6880;font-size:13px;margin:12px 0 0;text-align:center}
.foot{text-align:center;color:#6b6880;font-size:12px;margin-top:18px}`;

const shell = (title, body, head = '') => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="robots" content="noindex,nofollow,noarchive">${head}<style>${CSS}</style></head>
<body><main>${body}<p class="foot">Patron ne vous demande jamais votre code secret.<br>patron</p></main></body></html>`;

function methodsRow() {
  return '<div class="m"><span class="om">Orange Money</span><span class="mtn">MTN MoMo</span><span class="pc">PayCard</span></div>';
}

export function ogTags(page, token, v) {
  const image = `${ORIGIN}/p/${encodeURIComponent(token)}/card.png${v ? `?v=${encodeURIComponent(v)}` : ''}`;
  const title = page.state === 'owing' ? `${page.shop_name} · ${formatAmount(page.balance_cents, page.decimals)} ${page.currency} à payer` : `${page.shop_name}`;
  const desc = page.state === 'owing' ? 'Payez en 30 secondes : Orange Money, MTN MoMo ou PayCard.' : 'Merci !';
  // never the customer's name: links get forwarded
  return `<meta property="og:type" content="website"><meta property="og:site_name" content="Patron">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${ORIGIN}/p/${esc(token)}"><meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">`;
}

export function renderPage(page, { token, v, a } = {}) {
  if (!page || (page.state !== 'owing' && page.state !== 'clear')) return renderInactive();
  const name = esc(page.first_name);
  if (page.state === 'clear') {
    return shell(page.shop_name, `<div class="card"><h1>${esc(page.shop_name)}</h1>
<p class="sub">Pour ${name}</p><p class="big" style="font-size:22px">Vous ne devez rien à ${esc(page.shop_name)}. Merci !</p></div>`, ogTags(page, token, v));
  }
  const ask = requestedCents(page, a);
  const lines = (page.last_lines ?? []).map((l) =>
    `<li><span>${esc(l.date)}${l.item ? ` · ${esc(l.item)}` : ''}</span><span>${money(page, l.amount_cents)}</span></li>`).join('');
  const target = ask ?? page.balance_cents;
  const body = `<div class="card"><h1>${esc(page.shop_name)}</h1><p class="sub">Pour ${name}</p>
<p class="lab">Reste à payer</p><p class="big">${formatAmount(page.balance_cents, page.decimals)} <small>${esc(page.currency)}</small></p>
${ask ? `<p class="ask">${esc(page.shop_name)} demande ${money(page, ask)} aujourd'hui. <a href="/p/${esc(token)}">Tout payer</a></p>` : ''}
${lines ? `<ul>${lines}</ul>` : ''}${methodsRow()}
<button class="btn" disabled>Payer ${money(page, target)}</button>
<p class="note">Le paiement en ligne n'est pas encore ouvert pour cette boutique.</p></div>`;
  return shell(`${page.shop_name} · ${formatAmount(page.balance_cents, page.decimals)} ${page.currency}`, body, ogTags(page, token, v));
}

export function renderInactive() {
  return shell('Patron', `<div class="card"><h1>Lien inactif</h1><p class="sub">Ce lien n'est plus actif. Demandez un nouveau lien à la boutique.</p></div>`);
}
export function renderUnavailable() {
  return shell('Patron', `<div class="card"><h1>Pas de connexion</h1><p class="sub">Réessayez dans un instant.</p><a class="btn" href="">Réessayer</a></div>`);
}
