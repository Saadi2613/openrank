// Résultats de recherche (SERP) : Google via Serper.dev si la clé existe, sinon Bing gratuit.
import * as cheerio from 'cheerio';
import { config } from './config.js';
import { fetchText, fetchRaw, cleanDomain } from './http.js';

const cache = new Map();
const TTL = 3600 * 1000;

function decodeBing(href) {
  try {
    const u = new URL(href, 'https://www.bing.com');
    if (!u.hostname.endsWith('bing.com')) return href;
    const enc = u.searchParams.get('u');
    if (!enc) return href;
    return Buffer.from(enc.replace(/^a1/, '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } catch {
    return href;
  }
}

async function bing(q, { country, lang, pages }) {
  const results = [];
  const features = new Set();
  for (let p = 0; p < pages; p++) {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(q)}&cc=${country}&setlang=${lang}&first=${p * 10 + 1}`;
    const r = await fetchText(url, { timeout: 12000 });
    if (!r.ok) break;
    const $ = cheerio.load(r.text);
    if (p === 0) {
      if ($('#relatedQnAListDisplay, .df_alaskcarousel, [data-tag="RelatedQnA.Item"]').length) features.add('Questions associées');
      if ($('.b_vidAns, #vidans, .vsa').length) features.add('Vidéos');
      if ($('#imgans, .imgans').length) features.add('Images');
      if ($('.b_ans .b_nwsAns, #nws_ans, .na_cnt').length) features.add('Actualités');
      if ($('.b_ad, .b_adTop, li.b_ad').length) features.add('Annonces');
      if ($('.b_entityTP, .b_entityTitle').length) features.add('Fiche entité');
      if ($('#lMapContainer, .b_localAns').length) features.add('Pack local');
    }
    const before = results.length;
    $('li.b_algo').each((_, el) => {
      const a = $(el).find('h2 a').first();
      const link = decodeBing(a.attr('href') || '');
      if (!/^https?:/.test(link)) return;
      results.push({
        position: results.length + 1,
        title: a.text().trim(),
        url: link,
        domain: cleanDomain(link),
        snippet: $(el).find('.b_caption p, p').first().text().trim().slice(0, 240),
      });
    });
    if (results.length === before) break;
  }
  return { engine: 'Bing', results, features: [...features] };
}

async function serper(q, { country, lang, pages }) {
  const { res } = await fetchRaw('https://google.serper.dev/search', {
    method: 'POST',
    timeout: 15000,
    headers: { 'X-API-KEY': config.keys.serper, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, gl: country, hl: lang, num: pages * 10 }),
  });
  if (!res.ok) throw new Error(`Serper: HTTP ${res.status}`);
  const j = await res.json();
  const features = [];
  if (j.answerBox) features.push('Extrait optimisé');
  if (j.knowledgeGraph) features.push('Fiche entité');
  if (j.peopleAlsoAsk?.length) features.push('Autres questions posées');
  if (j.topStories?.length) features.push('Actualités');
  if (j.images?.length) features.push('Images');
  if (j.videos?.length) features.push('Vidéos');
  if (j.places?.length) features.push('Pack local');
  if (j.ads?.length) features.push('Annonces');
  return {
    engine: 'Google',
    results: (j.organic || []).map((o, i) => ({
      position: o.position || i + 1,
      title: o.title,
      url: o.link,
      domain: cleanDomain(o.link),
      snippet: o.snippet || '',
    })),
    features,
    questions: (j.peopleAlsoAsk || []).map((p) => p.question),
  };
}

export async function serp(q, { country = config.country, lang = config.lang, pages = 1 } = {}) {
  const key = `${q}|${country}|${lang}|${pages}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  let data;
  if (config.keys.serper) {
    try {
      data = await serper(q, { country, lang, pages });
    } catch {
      data = null;
    }
  }
  if (!data) data = await bing(q, { country, lang, pages });
  cache.set(key, { at: Date.now(), data });
  return data;
}

// Position d'un domaine pour un mot-clé (top 30 avec Bing, top 50 avec Google).
export async function rankOf(domain, keyword, opts = {}) {
  const d = cleanDomain(domain);
  const data = await serp(keyword, { ...opts, pages: config.keys.serper ? 5 : 3 });
  const hit = data.results.find((r) => r.domain === d || r.domain.endsWith('.' + d));
  return { keyword, engine: data.engine, position: hit ? hit.position : null, url: hit?.url || null, top: data.results.slice(0, 3) };
}
