// Vérificateur on-page : une URL + un mot-clé -> une liste d'actions concrètes.
import { fetchText, normalizeUrl, cleanDomain, pool } from './http.js';
import { parsePage } from './page.js';
import { serp } from './serp.js';

const strip = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function syllables(word) {
  const m = strip(word).match(/[aeiouy]+/g);
  return Math.max(1, m ? m.length : 1);
}

// Lisibilité Flesch adaptée au français (Kandel & Moles).
function readability(text) {
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) || []).length);
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 30) return null;
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  const score = 207 - 1.015 * (words.length / sentences) - 73.6 * (syl / words.length);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function onPage(urlInput, keyword) {
  const url = normalizeUrl(urlInput);
  if (!url) throw new Error('URL invalide');
  keyword = String(keyword || '').trim().toLowerCase();
  const r = await fetchText(url, { timeout: 15000 });
  if (!r.ok) throw new Error(`La page répond ${r.status || r.error}`);
  const p = parsePage(r.text, r.url);
  // Comparaison souple : « chaussures de running » compte pour « chaussure running ».
  const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'pour', 'en', 'a', 'et', 'l', 'd']);
  const stems = (s) => strip(s || '').split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w)).map((w) => w.replace(/(s|x)$/, ''));
  const kwStems = stems(keyword);
  const has = (s) => {
    if (!kwStems.length) return false;
    const set = new Set(stems(s));
    return kwStems.every((w) => set.has(w));
  };
  // Occurrences : fenêtres de mots où tous les mots du mot-clé apparaissent proches.
  const bodyStems = stems(p.text);
  let occurrences = 0;
  if (kwStems.length) {
    const span = kwStems.length + 2;
    for (let i = 0; i < bodyStems.length; i++) {
      if (bodyStems[i] !== kwStems[0]) continue;
      const win = new Set(bodyStems.slice(Math.max(0, i - 2), i + span));
      if (kwStems.every((w) => win.has(w))) occurrences++;
    }
  }
  const density = p.words ? (occurrences * kwStems.length * 100) / p.words : 0;
  const first100 = p.text.split(' ').slice(0, 100).join(' ');

  // Longueur moyenne des pages du top 5 pour ce mot-clé.
  let competitors = [];
  if (keyword) {
    const s = await serp(keyword);
    if (s.blocked) s.results = []; // sans comparaison au top 5 plutôt qu'avec de faux concurrents
    const top = s.results.filter((x) => cleanDomain(x.url) !== cleanDomain(url)).slice(0, 5);
    competitors = (
      await pool(top, 5, async (x) => {
        const c = await fetchText(x.url, { timeout: 10000 });
        if (!c.ok) return null;
        const cp = parsePage(c.text, c.url);
        return { url: x.url, position: x.position, words: cp.words, title: cp.title, h2: cp.headings.filter((h) => h.tag === 'h2').length, schema: cp.schemaTypes };
      })
    ).filter(Boolean);
  }
  const avgWords = competitors.length ? Math.round(competitors.reduce((a, c) => a + c.words, 0) / competitors.length) : null;

  const checks = [];
  const add = (ok, weight, label, fix) => checks.push({ ok, weight, label, fix });
  if (keyword) {
    add(has(p.title), 15, 'Mot-clé dans le title', `Mets « ${keyword} » au début du titre.`);
    add(p.h1.some(has), 12, 'Mot-clé dans le H1', `Ton H1 doit contenir « ${keyword} ».`);
    add(has(p.description), 6, 'Mot-clé dans la meta description', 'Glisse le mot-clé dans la description.');
    add(has(decodeURIComponent(new URL(r.url).pathname).replace(/[-_/]/g, ' ')), 5, "Mot-clé dans l'URL", "Utilise une URL courte avec le mot-clé (ex. /chaussure-running).");
    add(has(first100), 8, 'Mot-clé dans les 100 premiers mots', 'Cite le mot-clé dès le premier paragraphe.');
    add(density >= 0.5 && density <= 3, 5, `Densité du mot-clé : ${density.toFixed(1).replace(".", ",")} %`, density < 0.5 ? 'Utilise le mot-clé un peu plus souvent (0,5 à 3 %).' : 'Trop répété : remplace par des synonymes.');
    add(p.headings.some((h) => h.tag !== 'h1' && has(h.text)), 4, 'Mot-clé dans un sous-titre (H2/H3)', 'Ajoute un H2 qui reprend le mot-clé ou une variante.');
  }
  add(!!p.title && p.title.length <= 60 && p.title.length >= 20, 6, `Longueur du title : ${p.title.length} car.`, 'Vise entre 30 et 60 caractères.');
  add(!!p.description && p.description.length <= 160 && p.description.length >= 70, 4, `Longueur de la description : ${p.description.length} car.`, 'Vise entre 120 et 160 caractères.');
  add(p.h1.length === 1, 5, `Nombre de H1 : ${p.h1.length}`, 'Un seul H1 par page.');
  if (avgWords) add(p.words >= avgWords * 0.8, 10, `Longueur : ${p.words} mots (top 5 : ${avgWords})`, `Le top 5 fait ~${avgWords} mots. Ajoute ~${Math.max(0, avgWords - p.words)} mots utiles.`);
  else add(p.words >= 300, 10, `Longueur : ${p.words} mots`, 'Vise au moins 300 mots utiles.');
  add(p.imgNoAlt === 0, 4, `Images sans alt : ${p.imgNoAlt}/${p.imgCount}`, 'Ajoute un texte alternatif à chaque image.');
  add(p.schemaTypes.length > 0, 6, `Données structurées : ${p.schemaTypes.join(', ') || 'aucune'}`, 'Ajoute du JSON-LD (FAQPage, Product, Article…).');
  add(p.links.filter((l) => l.internal).length >= 3, 4, `Liens internes : ${p.links.filter((l) => l.internal).length}`, "Ajoute au moins 3 liens vers tes autres pages.");
  add(!!p.canonical, 2, 'Balise canonical', 'Ajoute une balise canonical.');
  add(p.viewport, 3, 'Compatible mobile (viewport)', 'Ajoute la balise viewport.');
  add(r.ms < 1500, 4, `Temps de réponse : ${r.ms} ms`, 'Vise moins de 1,5 s : cache, CDN, images compressées.');
  const read = readability(p.text);
  if (read != null) add(read >= 50, 3, `Lisibilité : ${read}/100`, 'Phrases plus courtes, mots plus simples.');

  const total = checks.reduce((a, c) => a + c.weight, 0);
  const score = Math.round((checks.filter((c) => c.ok).reduce((a, c) => a + c.weight, 0) / total) * 100);

  return {
    url: r.url,
    keyword,
    score,
    title: p.title,
    description: p.description,
    h1: p.h1,
    headings: p.headings.slice(0, 40),
    words: p.words,
    occurrences,
    density: Number(density.toFixed(2)),
    readability: read,
    ms: r.ms,
    schema: p.schemaTypes,
    checks: checks.sort((a, b) => a.ok - b.ok || b.weight - a.weight),
    competitors,
    avgWords,
  };
}
