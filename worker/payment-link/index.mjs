// Cloudflare Worker on patron.kolilink.com/p/*. It holds no money logic and no Djomy key: it asks the
// payment-page function for the live numbers, then returns the page with this link's own WhatsApp tags
// (GitHub Pages cannot — it serves fixed files, and WhatsApp builds its card from tags that differ per link).
// Secrets (wrangler secret put): RELAY_SECRET. Var: PAYMENT_PAGE_URL.
import { isBot, renderPage, renderInactive, renderUnavailable } from './render.mjs';

const HEAD = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store, max-age=0', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer' };
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

async function fetchPage(env, request, token, bot) {
  const r = await fetch(`${env.PAYMENT_PAGE_URL}?t=${encodeURIComponent(token)}${bot ? '&bot=1' : ''}`, {
    headers: { 'x-relay-secret': env.RELAY_SECRET, 'x-client-ip': request.headers.get('cf-connecting-ip') ?? '' },
  });
  if (r.status === 429 || r.status >= 500) return null;
  return r.ok ? r.json() : { state: 'inactive' };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/p\/([^/]+?)(\/card\.png)?\/?$/);
    if (!m || request.method !== 'GET') return new Response(renderInactive(), { status: 404, headers: HEAD });
    const [, token, card] = m;
    if (!TOKEN_RE.test(token)) return new Response(renderInactive(), { status: 404, headers: HEAD });
    const bot = isBot(request.headers.get('user-agent') ?? '');
    const page = await fetchPage(env, request, token, bot || !!card);
    if (page === null) return new Response(renderUnavailable(), { status: 503, headers: HEAD });
    if (card) {
      const { renderCardPng } = await import('./card.mjs');
      if (page.state !== 'owing' && page.state !== 'clear') return new Response('', { status: 404 });
      return new Response(await renderCardPng(page), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=300', 'x-robots-tag': 'noindex' } });
    }
    return new Response(renderPage(page, { token, v: url.searchParams.get('v'), a: url.searchParams.get('a') }), { status: page.state === 'inactive' ? 404 : 200, headers: HEAD });
  },
};
