// Petits utilitaires réseau partagés par toutes les sources.
export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
export const BOT_UA = 'Mozilla/5.0 (compatible; OpenRankBot/1.0; +https://github.com/Saadi2613/openrank)';

export async function fetchRaw(url, { timeout = 12000, headers = {}, method = 'GET', body, redirect = 'follow' } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      body,
      redirect,
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8', ...headers },
    });
    return { res, ms: Date.now() - started };
  } finally {
    clearTimeout(t);
  }
}

// Décode le HTML avec le bon jeu de caractères (beaucoup de vieux sites FR sont en ISO-8859-1).
export async function readText(res) {
  const buf = Buffer.from(await res.arrayBuffer());
  let charset = (res.headers.get('content-type') || '').match(/charset=["']?([\w-]+)/i)?.[1];
  if (!charset) charset = buf.subarray(0, 2048).toString('latin1').match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  try {
    return new TextDecoder((charset || 'utf-8').toLowerCase()).decode(buf);
  } catch {
    return buf.toString('utf8');
  }
}

export async function fetchText(url, opts) {
  try {
    const { res, ms } = await fetchRaw(url, opts);
    return { ok: res.ok, status: res.status, text: await readText(res), ms, url: res.url, headers: res.headers };
  } catch (e) {
    return { ok: false, status: 0, text: '', ms: 0, url, error: e.name === 'AbortError' ? 'timeout' : e.message };
  }
}

export async function fetchJson(url, opts) {
  const r = await fetchText(url, opts);
  if (!r.ok) return null;
  try {
    return JSON.parse(r.text);
  } catch {
    return null;
  }
}

// "https://www.Exemple.fr/page" -> "exemple.fr"
export function cleanDomain(input) {
  let s = String(input || '').trim().toLowerCase();
  if (!s) return '';
  if (!/^https?:\/\//.test(s)) s = 'https://' + s;
  try {
    return new URL(s).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function normalizeUrl(input) {
  let s = String(input || '').trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

// Exécute des tâches avec un nombre limité en parallèle.
export async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}
