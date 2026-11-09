// Réécrit le nombre figé de la page d'invitation avec le nombre en direct
// (RPC publique public_shop_count). Tourne sur GitHub Actions, qui joint
// Supabase sans le réseau lent d'un téléphone. Échec = on ne touche à rien.
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'invite/index.html';
const html = readFileSync(FILE, 'utf8');
const url = html.match(/SUPABASE_URL = '([^']+)'/)?.[1];
const key = html.match(/ANON_KEY = '([^']+)'/)?.[1];
if (!url || !key) throw new Error('SUPABASE_URL / ANON_KEY introuvables');

const t0 = Date.now();
const res = await fetch(url + '/rest/v1/rpc/public_shop_count', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key },
  body: '{}',
  signal: AbortSignal.timeout(60000),
});
const body = await res.text();
console.log(`RPC: HTTP ${res.status} en ${Date.now() - t0} ms, corps = ${body.slice(0, 200)}`);
if (!res.ok) throw new Error('RPC en échec');

const n = Number(JSON.parse(body));
if (!Number.isInteger(n) || n < 1 || n > 1000000) throw new Error('nombre invalide : ' + body);

const re = /(<span id="shop-count" class="num">)(\d+)(<\/span> vendeurs<\/strong> déjà sur Patron)/;
const m = html.match(re);
if (!m) throw new Error('nombre figé introuvable dans la page');
if (Number(m[2]) === n) { console.log('Déjà à jour : ' + n); process.exit(0); }
writeFileSync(FILE, html.replace(re, `$1${n}$3`));
console.log(`Nombre figé : ${m[2]} -> ${n}`);
