// Vitesse : Google PageSpeed (avec clé gratuite) sinon mesure maison.
import * as cheerio from 'cheerio';
import { config } from './config.js';
import { fetchJson, fetchRaw, normalizeUrl } from './http.js';

export async function speed(input, strategy = 'mobile') {
  const url = normalizeUrl(input);
  if (!url) throw new Error('URL invalide');
  if (config.keys.google) {
    const j = await fetchJson(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&category=seo&category=accessibility&category=best-practices&key=${config.keys.google}`,
      { timeout: 90000 },
    );
    if (j?.lighthouseResult) {
      const L = j.lighthouseResult;
      const a = L.audits;
      const cat = (k) => (L.categories[k]?.score != null ? Math.round(L.categories[k].score * 100) : null);
      return {
        source: 'Google PageSpeed',
        url,
        strategy,
        scores: { performance: cat('performance'), seo: cat('seo'), accessibility: cat('accessibility'), bestPractices: cat('best-practices') },
        metrics: [
          { id: 'LCP', label: 'Affichage du contenu principal', value: a['largest-contentful-paint']?.displayValue, score: a['largest-contentful-paint']?.score },
          { id: 'CLS', label: 'Stabilité visuelle', value: a['cumulative-layout-shift']?.displayValue, score: a['cumulative-layout-shift']?.score },
          { id: 'TBT', label: 'Temps de blocage', value: a['total-blocking-time']?.displayValue, score: a['total-blocking-time']?.score },
          { id: 'FCP', label: 'Premier affichage', value: a['first-contentful-paint']?.displayValue, score: a['first-contentful-paint']?.score },
          { id: 'SI', label: "Indice de vitesse", value: a['speed-index']?.displayValue, score: a['speed-index']?.score },
        ],
        opportunities: Object.values(a)
          .filter((x) => x.details?.type === 'opportunity' && x.score != null && x.score < 0.9)
          .sort((x, y) => (y.details.overallSavingsMs || 0) - (x.details.overallSavingsMs || 0))
          .slice(0, 8)
          .map((x) => ({ title: x.title, saving: x.details.overallSavingsMs ? `${Math.round(x.details.overallSavingsMs)} ms` : null })),
      };
    }
  }
  // Mesure maison : temps de réponse, poids, nombre de ressources, compression.
  const { res, ms } = await fetchRaw(url, { timeout: 20000, headers: { 'Accept-Encoding': 'gzip, br' } });
  if (!res.ok) throw new Error(`Le site répond ${res.status}${res.status === 403 ? ' (il bloque les robots)' : ''}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const scripts = $('script[src]').length;
  const css = $('link[rel="stylesheet"]').length;
  const imgs = $('img').length;
  const lazy = $('img[loading="lazy"]').length;
  const kb = Math.round(Buffer.byteLength(html) / 1024);
  const enc = res.headers.get('content-encoding');
  const cache = res.headers.get('cache-control');
  const pts = [
    ms < 800 ? 30 : ms < 1800 ? 18 : 5,
    kb < 150 ? 20 : kb < 500 ? 12 : 4,
    scripts + css < 15 ? 20 : scripts + css < 35 ? 10 : 3,
    enc ? 15 : 0,
    imgs < 4 || lazy / imgs > 0.5 ? 15 : 6,
  ];
  return {
    source: 'Mesure OpenRank',
    url,
    strategy,
    scores: { performance: pts.reduce((a, b) => a + b, 0), seo: null, accessibility: null, bestPractices: null },
    metrics: [
      { id: 'TTFB', label: 'Temps de réponse du serveur', value: `${ms} ms`, score: ms < 800 ? 1 : ms < 1800 ? 0.5 : 0 },
      { id: 'HTML', label: 'Poids du HTML', value: `${kb} Ko`, score: kb < 150 ? 1 : kb < 500 ? 0.5 : 0 },
      { id: 'REQ', label: 'Scripts + feuilles de style', value: `${scripts + css}`, score: scripts + css < 15 ? 1 : scripts + css < 35 ? 0.5 : 0 },
      { id: 'GZIP', label: 'Compression', value: enc || 'aucune', score: enc ? 1 : 0 },
      { id: 'LAZY', label: 'Images chargées à la demande', value: `${lazy}/${imgs}`, score: imgs < 4 || lazy / imgs > 0.5 ? 1 : 0.5 },
    ],
    opportunities: [
      !enc && { title: 'Active la compression gzip ou brotli sur ton serveur' },
      !cache && { title: 'Ajoute un en-tête Cache-Control' },
      kb >= 150 && { title: `HTML lourd (${kb} Ko) : retire le code inutile, charge le reste à la demande` },
      imgs >= 4 && lazy / imgs <= 0.5 && { title: 'Ajoute loading="lazy" sur les images sous la ligne de flottaison' },
      scripts > 15 && { title: `Réduis le nombre de scripts (${scripts})` },
      ms >= 800 && { title: 'Serveur lent : cache de page, CDN ou meilleur hébergeur' },
    ].filter(Boolean),
    note: 'Ajoute une clé Google gratuite dans Réglages pour les vrais Core Web Vitals.',
  };
}
