// AEO (Answer Engine Optimization) : être cité par ChatGPT, Claude, Perplexity, Gemini…
import { config } from './config.js';
import { fetchText, fetchRaw, fetchJson, cleanDomain, normalizeUrl, pool } from './http.js';
import { parsePage } from './page.js';
import { store, id } from './store.js';

export const AI_BOTS = [
  { ua: 'GPTBot', owner: 'OpenAI (entraînement)' },
  { ua: 'OAI-SearchBot', owner: 'ChatGPT Search' },
  { ua: 'ChatGPT-User', owner: 'ChatGPT (navigation)' },
  { ua: 'ClaudeBot', owner: 'Anthropic (entraînement)' },
  { ua: 'Claude-SearchBot', owner: 'Claude (recherche)' },
  { ua: 'PerplexityBot', owner: 'Perplexity' },
  { ua: 'Google-Extended', owner: 'Gemini' },
  { ua: 'Applebot-Extended', owner: 'Apple Intelligence' },
  { ua: 'meta-externalagent', owner: 'Meta AI' },
  { ua: 'CCBot', owner: 'Common Crawl' },
];

// Le bot a-t-il le droit de lire la page d'accueil d'après robots.txt ?
function botAllowed(robots, ua) {
  const groups = [];
  let cur = null;
  for (const raw of robots.split('\n')) {
    const line = raw.split('#')[0].trim();
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    const v = line.slice(i + 1).trim();
    if (k === 'user-agent') {
      if (!cur || cur.rules.length) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(v.toLowerCase());
    } else if (cur && (k === 'disallow' || k === 'allow')) cur.rules.push({ k, v });
  }
  const pick = groups.find((g) => g.agents.includes(ua.toLowerCase())) || groups.find((g) => g.agents.includes('*'));
  if (!pick) return true;
  const allow = pick.rules.filter((r) => r.k === 'allow' && r.v === '/').length;
  const deny = pick.rules.filter((r) => r.k === 'disallow' && r.v === '/').length;
  return !(deny && !allow);
}

// 1) Le site est-il prêt pour les IA ?
export async function aeoReadiness(input) {
  const url = normalizeUrl(input);
  if (!url) throw new Error('URL invalide');
  const home = await fetchText(url, { timeout: 15000 });
  if (!home.ok) throw new Error(`Le site répond ${home.status || home.error}${home.status === 403 ? ' : il bloque les robots (donc sans doute aussi certaines IA).' : ''}`);
  const origin = new URL(home.url).origin;
  const [robots, llms, llmsFull, sitemap] = await Promise.all([
    fetchText(`${origin}/robots.txt`, { timeout: 8000 }),
    fetchText(`${origin}/llms.txt`, { timeout: 8000 }),
    fetchText(`${origin}/llms-full.txt`, { timeout: 8000 }),
    fetchText(`${origin}/sitemap.xml`, { timeout: 8000 }),
  ]);
  const p = parsePage(home.text, home.url);

  // Quelques pages internes pour juger le contenu (FAQ, questions, schéma).
  const internal = [...new Set(p.links.filter((l) => l.internal).map((l) => l.url))].filter((u) => u !== home.url).slice(0, 6);
  const subs = (await pool(internal, 4, async (u) => {
    const r = await fetchText(u, { timeout: 10000 });
    return r.ok && /<html/i.test(r.text) ? { ...parsePage(r.text, r.url), url: r.url } : null;
  })).filter(Boolean);
  const all = [p, ...subs];

  const bots = AI_BOTS.map((b) => ({ ...b, allowed: robots.ok ? botAllowed(robots.text, b.ua) : true }));
  const schemaTypes = [...new Set(all.flatMap((x) => x.schemaTypes))];
  const questionHeadings = all.flatMap((x) => x.headings).filter((h) => /\?$|^(comment|pourquoi|quel|quelle|qu'est|combien|quand|où|qui|est-ce|how|what|why|which)\b/i.test(h.text));
  const rawWords = p.words;
  const hasLlms = llms.ok && llms.text.length > 20 && !/<html/i.test(llms.text);

  const checks = [
    { id: 'bots', ok: bots.filter((b) => b.allowed).length >= bots.length - 2, weight: 20, label: `Robots IA autorisés : ${bots.filter((b) => b.allowed).length}/${bots.length}`, fix: 'Dans robots.txt, autorise GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot et Google-Extended.' },
    { id: 'llms', ok: hasLlms, weight: 10, label: 'Fichier llms.txt', fix: 'Crée /llms.txt : un résumé de ton site et des liens vers tes pages clés, en Markdown. OpenRank peut le générer.' },
    { id: 'ssr', ok: rawWords >= 150, weight: 15, label: `Texte lisible sans JavaScript : ${rawWords} mots`, fix: "Les robots IA ne lancent pas le JavaScript. Ton texte doit être dans le HTML (rendu serveur)." },
    { id: 'org', ok: schemaTypes.some((t) => /Organization|LocalBusiness|Corporation|Store|Brand|Person/i.test(t)), weight: 10, label: 'Schéma Organization / LocalBusiness', fix: 'Ajoute un JSON-LD Organization avec nom, logo, sameAs (réseaux sociaux).' },
    { id: 'faq', ok: schemaTypes.some((t) => /FAQPage|QAPage|HowTo/i.test(t)) || questionHeadings.length >= 3, weight: 15, label: `Contenu en questions/réponses : ${questionHeadings.length} titres-questions`, fix: 'Ajoute une FAQ avec les vraies questions de tes clients, et un schéma FAQPage.' },
    { id: 'schema', ok: schemaTypes.length >= 2, weight: 10, label: `Types schema.org : ${schemaTypes.join(', ') || 'aucun'}`, fix: 'Ajoute Product, Article, Review, BreadcrumbList selon tes pages.' },
    { id: 'desc', ok: !!p.description && p.description.length >= 70, weight: 5, label: 'Meta description claire', fix: 'Décris en une phrase qui tu es, pour qui, et ce que tu vends.' },
    { id: 'sitemap', ok: sitemap.ok && /<(urlset|sitemapindex)/i.test(sitemap.text), weight: 5, label: 'Sitemap XML', fix: 'Publie /sitemap.xml pour que les robots trouvent toutes tes pages.' },
    { id: 'headings', ok: all.every((x) => x.h1.length >= 1) && all.some((x) => x.headings.filter((h) => h.tag === 'h2').length >= 3), weight: 5, label: 'Structure claire (H1 + H2)', fix: 'Découpe tes pages en sections avec des H2 explicites : les IA citent des passages.' },
    { id: 'lang', ok: !!p.lang, weight: 5, label: `Langue déclarée : ${p.lang || 'non'}`, fix: 'Ajoute lang="fr" sur <html>.' },
  ];
  const total = checks.reduce((a, c) => a + c.weight, 0);
  const score = Math.round((checks.filter((c) => c.ok).reduce((a, c) => a + c.weight, 0) / total) * 100);

  return {
    url: home.url,
    domain: cleanDomain(home.url),
    score,
    checks: checks.sort((a, b) => a.ok - b.ok || b.weight - a.weight),
    bots,
    schemaTypes,
    questionHeadings: questionHeadings.slice(0, 15),
    llmsTxt: hasLlms ? llms.text.slice(0, 3000) : null,
    llmsFull: llmsFull.ok && !/<html/i.test(llmsFull.text),
    suggestedLlms: hasLlms ? null : buildLlms(home.url, p, subs),
  };
}

function buildLlms(url, home, subs) {
  const name = (home.title || cleanDomain(url)).split(/[|\-–·]/)[0].trim();
  const lines = [`# ${name}`, '', `> ${home.description || 'Décris ici ton activité en une phrase.'}`, '', '## Pages principales', ''];
  for (const s of subs) if (s.title) lines.push(`- [${s.title.split(/[|\-–·]/)[0].trim()}](${s.url}): ${(s.description || '').slice(0, 120)}`);
  lines.push('', '## Contact', '', `- Site : ${url}`);
  return lines.join('\n');
}

// 2) Que répondent les IA ? Ton site est-il cité ?
const ENGINE_PREFS = {
  groq: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-70b-versatile', 'llama3-70b-8192'],
  openai: ['gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini'],
};
const modelCache = {};

async function pickModel(engine, base, key) {
  const envModel = process.env[`${engine.toUpperCase()}_MODEL`];
  if (envModel) return envModel;
  if (modelCache[engine]) return modelCache[engine];
  const j = await fetchJson(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
  const ids = (j?.data || []).map((m) => m.id);
  modelCache[engine] = ENGINE_PREFS[engine].find((m) => ids.includes(m)) || ids.find((m) => !/whisper|tts|embed|guard|audio|image|dall|moderation|realtime|transcribe/i.test(m)) || ENGINE_PREFS[engine][0];
  return modelCache[engine];
}

const SYSTEM = 'Tu es un assistant qui répond en français à des internautes en France. Réponds de façon utile et concrète, en citant des marques, entreprises ou sites précis (avec leur site web quand tu le connais).';

async function askOpenAICompat(engine, base, key, prompt) {
  const model = await pickModel(engine, base, key);
  const { res } = await fetchRaw(`${base}/chat/completions`, {
    method: 'POST',
    timeout: 60000,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }] }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`);
  return { model, text: j.choices?.[0]?.message?.content || '' };
}

async function askAnthropic(prompt) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
  const { res } = await fetchRaw('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    timeout: 60000,
    headers: { 'x-api-key': config.keys.anthropic, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 1200, system: SYSTEM, messages: [{ role: 'user', content: prompt }] }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`);
  return { model, text: (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n') };
}

export function engines() {
  const k = config.keys;
  const list = [];
  if (k.groq) list.push({ id: 'groq', name: 'Groq', ask: (p) => askOpenAICompat('groq', 'https://api.groq.com/openai/v1', k.groq, p) });
  if (k.openai) list.push({ id: 'openai', name: 'ChatGPT', ask: (p) => askOpenAICompat('openai', 'https://api.openai.com/v1', k.openai, p) });
  if (k.anthropic) list.push({ id: 'anthropic', name: 'Claude', ask: askAnthropic });
  return list;
}

export function suggestPrompts(topic) {
  const t = String(topic || '').trim();
  if (!t) return [];
  return [
    `Quels sont les meilleurs sites pour ${t} en France ?`,
    `Je cherche ${t}. Quelles marques ou entreprises me conseilles-tu ?`,
    `Compare les principales entreprises françaises de ${t}.`,
    `Quelle est la meilleure alternative pour ${t} avec un bon rapport qualité-prix ?`,
    `Où acheter ou trouver ${t} en ligne en toute confiance ?`,
  ];
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function mentionIndex(text, names) {
  const low = text.toLowerCase();
  let best = -1;
  for (const n of names) {
    if (!n || n.length < 3) continue;
    const m = new RegExp(`(^|[^a-z0-9])${esc(n.toLowerCase())}([^a-z0-9]|$)`).exec(low);
    if (m && (best < 0 || m.index < best)) best = m.index;
  }
  return best;
}

export async function aeoVisibility({ domain, brand, competitors = [], prompts = [] }) {
  const d = cleanDomain(domain);
  if (!d) throw new Error('Domaine invalide');
  const list = engines();
  if (!list.length) throw new Error('Aucune IA branchée. Ajoute une clé gratuite Groq dans Réglages.');
  prompts = prompts.map((p) => p.trim()).filter(Boolean).slice(0, 10);
  if (!prompts.length) throw new Error('Ajoute au moins une question.');
  const brandNames = [brand, d, d.split('.')[0]].filter(Boolean);
  const comps = competitors.map((c) => ({ raw: c.trim(), names: [c.trim(), cleanDomain(c), cleanDomain(c).split('.')[0]].filter(Boolean) })).filter((c) => c.raw);

  const tasks = prompts.flatMap((prompt) => list.map((e) => ({ prompt, engine: e })));
  const answers = await pool(tasks, 4, async ({ prompt, engine }) => {
    try {
      const { model, text } = await engine.ask(prompt);
      const me = mentionIndex(text, brandNames);
      const others = comps.map((c) => ({ name: c.raw, idx: mentionIndex(text, c.names) })).filter((c) => c.idx >= 0);
      const order = [...(me >= 0 ? [{ name: '__me', idx: me }] : []), ...others].sort((a, b) => a.idx - b.idx);
      const domainsCited = [...new Set((text.match(/\b[a-z0-9-]+\.(fr|com|net|org|io|eu|be|ch|co|shop|store)\b/gi) || []).map((x) => x.toLowerCase()))].slice(0, 15);
      return {
        prompt,
        engine: engine.name,
        model,
        mentioned: me >= 0,
        rank: me >= 0 ? order.findIndex((o) => o.name === '__me') + 1 : null,
        competitors: others.map((o) => o.name),
        domainsCited,
        text: text.slice(0, 4000),
      };
    } catch (e) {
      return { prompt, engine: engine.name, error: e.message };
    }
  });

  const ok = answers.filter((a) => !a.error);
  const sov = { [d]: ok.filter((a) => a.mentioned).length };
  for (const c of comps) sov[c.raw] = ok.filter((a) => a.competitors.includes(c.raw)).length;
  const result = {
    id: id(),
    date: new Date().toISOString(),
    domain: d,
    brand: brand || null,
    engines: list.map((e) => e.name),
    prompts,
    visibility: ok.length ? Math.round((ok.filter((a) => a.mentioned).length / ok.length) * 100) : 0,
    shareOfVoice: Object.entries(sov).map(([name, count]) => ({ name, count, pct: ok.length ? Math.round((count / ok.length) * 100) : 0 })).sort((a, b) => b.count - a.count),
    answers,
  };
  store.insert('aeo', result);
  store.trim('aeo', 50);
  return result;
}

export function aeoHistory(domain) {
  const d = cleanDomain(domain);
  return store.get('aeo').filter((r) => !d || r.domain === d).map(({ answers, ...rest }) => rest);
}

export function aeoGet(runId) {
  return store.find('aeo', (r) => r.id === runId) || null;
}
