// Recherche de mots-clés : suggestions Google, intention, popularité, difficulté.
import { config } from './config.js';
import { fetchJson, fetchRaw, pool } from './http.js';
import { serp, SERP_BLOCKED } from './serp.js';
import { domainOverview } from './domain.js';

const QUESTIONS = ['comment', 'pourquoi', 'quel', 'quelle', 'quels', 'où', 'quand', 'combien', 'qui', 'est-ce que'];
const MODIFIERS = ['prix', 'avis', 'meilleur', 'pas cher', 'pour', 'avec', 'sans', 'vs', 'comparatif', 'acheter'];
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

async function suggest(q, { lang, country }) {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=${lang}&gl=${country}&q=${encodeURIComponent(q)}`;
  const j = await fetchJson(url, { timeout: 6000 });
  return Array.isArray(j?.[1]) ? j[1] : [];
}

const INTENTS = [
  { id: 'T', label: 'Transactionnel', re: /\b(acheter|achat|commander|prix|pas cher|promo|code promo|soldes|livraison|devis|tarif|réserver|abonnement|location|louer)\b/ },
  { id: 'C', label: 'Commercial', re: /\b(meilleur|meilleure|meilleurs|top|avis|comparatif|vs|versus|test|alternative|classement|quel|quelle)\b/ },
  { id: 'I', label: 'Informationnel', re: /\b(comment|pourquoi|qu'est-ce|c'est quoi|définition|combien|quand|où|qui|guide|tuto|tutoriel|exemple|idée|astuce)\b/ },
];

export function intentOf(kw, brandHints = []) {
  const k = kw.toLowerCase();
  if (brandHints.some((b) => b && k.includes(b)) || /\b(login|connexion|mon compte|site officiel|\.fr|\.com)\b/.test(k)) {
    return { id: 'N', label: 'Navigationnel' };
  }
  for (const i of INTENTS) if (i.re.test(k)) return { id: i.id, label: i.label };
  // Requête courte sans question = on compare des produits/services (commercial).
  return k.split(/\s+/).length <= 4 ? { id: 'C', label: 'Commercial' } : { id: 'I', label: 'Informationnel' };
}

// Volumes exacts via DataForSEO (optionnel, payant).
async function dataForSeoVolumes(keywords, { lang }) {
  const { dataforseoLogin: login, dataforseoPassword: pass } = config.keys;
  if (!login || !pass || !keywords.length) return null;
  const locations = { fr: 2250, be: 2056, ch: 2756, ca: 2124, us: 2840, gb: 2826, ma: 2504, dz: 2012, tn: 2788 };
  try {
    const { res } = await fetchRaw('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
      method: 'POST',
      timeout: 30000,
      headers: { Authorization: 'Basic ' + Buffer.from(`${login}:${pass}`).toString('base64'), 'Content-Type': 'application/json' },
      body: JSON.stringify([{ keywords: keywords.slice(0, 700), location_code: locations[config.country] || 2250, language_code: lang }]),
    });
    const j = await res.json();
    const map = new Map();
    for (const r of j?.tasks?.[0]?.result || []) {
      map.set(r.keyword.toLowerCase(), { volume: r.search_volume ?? null, cpc: r.cpc ?? null, competition: r.competition_index ?? null });
    }
    return map;
  } catch {
    return null;
  }
}

// Keyword Magic Tool : part d'un mot-clé, renvoie des centaines d'idées classées.
export async function keywordIdeas(seed, { lang = config.lang, country = config.country, deep = true } = {}) {
  seed = String(seed || '').trim().toLowerCase();
  if (!seed) throw new Error('Mot-clé vide');
  const queries = [
    { q: seed, group: 'Général' },
    ...QUESTIONS.map((w) => ({ q: `${w} ${seed}`, group: 'Questions' })),
    ...MODIFIERS.map((w) => ({ q: `${seed} ${w}`, group: 'Variantes' })),
    ...(deep ? LETTERS.map((l) => ({ q: `${seed} ${l}`, group: 'Général' })) : []),
  ];
  const found = new Map();
  await pool(queries, 8, async ({ q, group }) => {
    const list = await suggest(q, { lang, country });
    list.forEach((kw, pos) => {
      const k = kw.toLowerCase().trim();
      if (!k) return;
      const cur = found.get(k) || { keyword: k, hits: 0, best: 99, group: QUESTIONS.some((w) => k.startsWith(w + ' ')) ? 'Questions' : group };
      cur.hits += 1;
      cur.best = Math.min(cur.best, pos);
      found.set(k, cur);
    });
  });

  let rows = [...found.values()];
  const seedWords = seed.split(/\s+/);
  const volumes = await dataForSeoVolumes(rows.map((r) => r.keyword), { lang });

  rows = rows.map((r) => {
    // Popularité relative 1-100 : vu souvent + haut dans les suggestions = recherché souvent.
    const popularity = Math.max(1, Math.min(100, Math.round(r.hits * 12 + (10 - Math.min(r.best, 10)) * 6 - (r.keyword.split(' ').length - seedWords.length) * 4)));
    const v = volumes?.get(r.keyword);
    return {
      keyword: r.keyword,
      group: r.group,
      words: r.keyword.split(/\s+/).length,
      intent: intentOf(r.keyword),
      popularity,
      volume: v?.volume ?? null,
      cpc: v?.cpc ?? null,
      competition: v?.competition ?? null,
    };
  });
  rows.sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1) || b.popularity - a.popularity);

  // Regroupement par mot fréquent (comme les « groupes » de Semrush).
  const counts = new Map();
  for (const r of rows) {
    for (const w of r.keyword.split(/\s+/)) {
      if (w.length < 3 || seedWords.includes(w)) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  const clusters = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([word, count]) => ({ word, count }));

  return { seed, total: rows.length, hasVolumes: !!volumes, rows, clusters };
}

// Keyword Overview : un mot-clé, sa SERP, sa difficulté.
export async function keywordOverview(keyword, opts = {}) {
  keyword = String(keyword || '').trim().toLowerCase();
  if (!keyword) throw new Error('Mot-clé vide');
  const [results, ideas] = await Promise.all([serp(keyword, opts), keywordIdeas(keyword, { ...opts, deep: false })]);
  if (results.blocked) throw new Error(SERP_BLOCKED);
  const top = results.results.slice(0, 10);
  const domains = await pool(top, 5, async (r) => {
    try {
      const d = await domainOverview(r.domain);
      return d.authority;
    } catch {
      return null;
    }
  });
  top.forEach((r, i) => (r.authority = domains[i]));
  const scored = domains.filter((x) => x != null);
  // Difficulté = autorité moyenne du top 10, les sites inconnus comptent comme faibles (10).
  const difficulty = top.length ? Math.round(domains.map((x) => x ?? 10).reduce((a, b) => a + b, 0) / top.length) : null;
  const self = ideas.rows.find((r) => r.keyword === keyword);
  return {
    keyword,
    engine: results.engine,
    intent: intentOf(keyword),
    difficulty,
    difficultyLabel: difficulty == null ? '—' : difficulty >= 70 ? 'Très difficile' : difficulty >= 50 ? 'Difficile' : difficulty >= 30 ? 'Possible' : 'Facile',
    volume: self?.volume ?? null,
    popularity: self?.popularity ?? null,
    serp: top,
    features: results.features,
    knownAuthorities: scored.length,
    questions: ideas.rows.filter((r) => r.group === 'Questions').slice(0, 10),
    related: ideas.rows.filter((r) => r.group !== 'Questions' && r.keyword !== keyword).slice(0, 15),
  };
}
