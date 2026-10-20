// Suivi de positions : des projets (domaine + mots-clés), vérifiés chaque jour.
import { cleanDomain, pool } from './http.js';
import { serp } from './serp.js';
import { config } from './config.js';
import { store, id } from './store.js';

// Part de clics estimée selon la position (courbe CTR moyenne).
const CTR = [0, 31, 24, 18, 13, 9, 6, 5, 4, 3, 2.5];
const ctr = (pos) => (!pos ? 0 : pos <= 10 ? CTR[pos] : pos <= 20 ? 1 : 0.3);

function matchPos(results, domain) {
  const hit = results.find((r) => r.domain === domain || r.domain.endsWith('.' + domain));
  return hit ? { pos: hit.position, url: hit.url } : { pos: null, url: null };
}

export function visibility(ranks, keywords) {
  if (!keywords.length) return 0;
  const sum = keywords.reduce((a, k) => a + ctr(ranks[k]?.pos), 0);
  return Math.round((sum / (keywords.length * CTR[1])) * 1000) / 10;
}

export const listProjects = () => store.get('projects');
export const getProject = (pid) => store.find('projects', (p) => p.id === pid);

export function createProject({ domain, keywords = [], competitors = [] }) {
  const d = cleanDomain(domain);
  if (!d) throw new Error('Domaine invalide');
  return store.insert('projects', {
    id: id(),
    domain: d,
    createdAt: new Date().toISOString(),
    keywords: [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))].slice(0, 200),
    competitors: [...new Set(competitors.map(cleanDomain).filter((c) => c && c !== d))].slice(0, 5),
    history: [],
  });
}

export function updateProject(pid, { keywords, competitors }) {
  return store.update('projects', pid, (p) => ({
    keywords: keywords ? [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))].slice(0, 200) : p.keywords,
    competitors: competitors ? [...new Set(competitors.map(cleanDomain).filter((c) => c && c !== p.domain))].slice(0, 5) : p.competitors,
  }));
}

export const deleteProject = (pid) => store.remove('projects', pid);

const running = new Set();

export async function checkProject(pid) {
  const p = getProject(pid);
  if (!p) throw new Error('Projet introuvable');
  if (running.has(pid)) return p;
  running.add(pid);
  try {
    const pages = config.keys.serper ? 5 : 3;
    const ranks = {};
    const comp = Object.fromEntries(p.competitors.map((c) => [c, {}]));
    let engine = null;
    await pool(p.keywords, 3, async (kw) => {
      const s = await serp(kw, { pages });
      engine = s.engine;
      ranks[kw] = matchPos(s.results, p.domain);
      for (const c of p.competitors) comp[c][kw] = matchPos(s.results, c);
    });
    const snap = {
      date: new Date().toISOString(),
      engine,
      ranks,
      comp,
      visibility: visibility(ranks, p.keywords),
      compVisibility: Object.fromEntries(p.competitors.map((c) => [c, visibility(comp[c], p.keywords)])),
    };
    return store.update('projects', pid, (cur) => ({ history: [...cur.history, snap].slice(-180), lastCheck: snap.date }));
  } finally {
    running.delete(pid);
  }
}

// Vérification automatique : une fois par jour tant que l'app tourne.
export function startScheduler() {
  const tick = async () => {
    for (const p of listProjects()) {
      const last = p.lastCheck ? Date.parse(p.lastCheck) : 0;
      if (p.keywords.length && Date.now() - last > 23 * 3600 * 1000) {
        await checkProject(p.id).catch(() => {});
      }
    }
  };
  setTimeout(tick, 15000);
  setInterval(tick, 3600 * 1000);
}
