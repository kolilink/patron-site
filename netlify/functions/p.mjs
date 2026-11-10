// Netlify Function behind pay.kolilink.com/p/<token> (and /p/?t=<token>): the page with THIS link's own
// WhatsApp preview + the card image /p/<token>/card.png. No money logic, no secret: it asks the Supabase
// `payment-page` function for the live numbers (the 128-bit token is the credential).
import { isBot, renderPage, renderInactive, renderUnavailable } from '../lib/render.mjs';

const FN = 'https://jnxpujsyvbenqgjbvifh.supabase.co/functions/v1/payment-page';
const HEAD = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store, max-age=0', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer' };
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

export async function handle(request, { ip = '', fetchFn = fetch, renderPng } = {}) {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/p(?:\/([^/]+?))?(\/card\.png)?\/?$/);
  if (!m || request.method !== 'GET') return new Response(renderInactive(), { status: 404, headers: HEAD });
  const token = m[1] ?? url.searchParams.get('t') ?? '';
  const card = !!m[2];
  if (!TOKEN_RE.test(token)) return new Response(renderInactive(), { status: 404, headers: HEAD });
  const bot = isBot(request.headers.get('user-agent') ?? '') || card;     // a robot / an image fetch never marks « Vu »
  let page;
  try {
    const r = await fetchFn(`${FN}?t=${encodeURIComponent(token)}${bot ? '&bot=1' : ''}`, { headers: { 'x-forwarded-for': ip } });
    if (r.status === 429 || r.status >= 500) throw new Error('unavailable');
    page = r.ok ? await r.json() : { state: 'inactive' };
  } catch { return new Response(renderUnavailable(), { status: 503, headers: HEAD }); }
  if (card) {
    if (page.state !== 'owing' && page.state !== 'clear') return new Response('', { status: 404 });
    return new Response(await renderPng(page), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=300', 'x-robots-tag': 'noindex' } });
  }
  return new Response(renderPage(page, { token, v: url.searchParams.get('v'), a: url.searchParams.get('a') }),
    { status: page.state === 'owing' || page.state === 'clear' ? 200 : 404, headers: HEAD });
}

export default async (request, context) => {
  const { renderCardPng } = await import('../lib/card.mjs');
  return handle(request, { ip: context?.ip ?? '', renderPng: renderCardPng });
};
export const config = { path: ['/p', '/p/*'] };
