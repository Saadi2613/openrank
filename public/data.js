// Où vivent les projets, audits et tests IA.
// En local : sur le serveur (fichier data/db.json). En ligne : dans le navigateur du visiteur,
// pour que chacun ne voie que ses propres données.
import { api } from './ui.js';
import { state } from './app.js';

const online = () => !!state.status?.publicMode;
const KEY = 'openrank-data-v1';

function read() {
  try {
    return { projects: [], audits: [], aeo: [], ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { projects: [], audits: [], aeo: [] };
  }
}
function write(db) {
  // Le navigateur limite la place (~5 Mo) : on retire les plus vieux audits si besoin.
  for (;;) {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
      return;
    } catch {
      if (db.audits.length > 1) db.audits.pop();
      else if (db.aeo.length > 1) db.aeo.pop();
      else throw new Error('Plus de place dans ce navigateur. Supprime un projet.');
    }
  }
}
const newId = () => Math.random().toString(16).slice(2, 14);
const cleanList = (list, max) => [...new Set((list || []).map((k) => String(k).trim().toLowerCase()).filter(Boolean))].slice(0, max);
const cleanDomain = (s) => {
  try {
    return new URL(/^https?:\/\//.test(s.trim()) ? s.trim() : 'https://' + s.trim()).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

// ---------- Projets de suivi de positions ----------
export async function listProjects() {
  return online() ? read().projects : api('/api/projects');
}

export async function getProject(id) {
  return online() ? read().projects.find((p) => p.id === id) || null : api(`/api/projects/${id}`).catch(() => null);
}

export async function createProject({ domain, keywords, competitors }) {
  if (!online()) return api('/api/projects', { domain, keywords, competitors });
  const d = cleanDomain(domain);
  if (!d) throw new Error('Domaine invalide');
  const kws = cleanList(keywords, 20);
  if (!kws.length) throw new Error('Ajoute au moins un mot-clé');
  const p = { id: newId(), domain: d, createdAt: new Date().toISOString(), keywords: kws, competitors: cleanList(competitors, 3).map(cleanDomain).filter((c) => c && c !== d), history: [] };
  const db = read();
  db.projects.unshift(p);
  write(db);
  return p;
}

export async function updateProject(id, { keywords, competitors }) {
  if (!online()) return api(`/api/projects/${id}`, { keywords, competitors }, 'PATCH');
  const db = read();
  const p = db.projects.find((x) => x.id === id);
  if (!p) throw new Error('Projet introuvable');
  if (keywords) p.keywords = cleanList(keywords, 20);
  if (competitors) p.competitors = cleanList(competitors, 3).map(cleanDomain).filter((c) => c && c !== p.domain);
  write(db);
  return p;
}

export async function deleteProject(id) {
  if (!online()) return api(`/api/projects/${id}`, null, 'DELETE');
  const db = read();
  db.projects = db.projects.filter((p) => p.id !== id);
  write(db);
}

export async function checkProject(id) {
  if (!online()) return api(`/api/projects/${id}/check`, {});
  const p = await getProject(id);
  if (!p) throw new Error('Projet introuvable');
  const snap = await api('/api/rank-check', { domain: p.domain, keywords: p.keywords, competitors: p.competitors });
  const db = read();
  const cur = db.projects.find((x) => x.id === id);
  cur.history = [...cur.history, snap].slice(-90);
  cur.lastCheck = snap.date;
  write(db);
  return cur;
}

// ---------- Audits ----------
export async function listAudits() {
  return online() ? read().audits.map(({ pages, issues, ...rest }) => rest) : api('/api/audits');
}

export async function getAudit(id) {
  if (!online()) return api(`/api/audit/${id}`).catch(() => null);
  const saved = read().audits.find((a) => a.id === id);
  if (saved) return saved;
  const a = await api(`/api/audit/${id}`).catch(() => null);
  if (a) {
    const db = read();
    db.audits.unshift(a);
    db.audits = db.audits.slice(0, 10);
    write(db);
  }
  return a;
}

// ---------- Tests de visibilité IA ----------
export async function aeoHistory() {
  return online() ? read().aeo.map(({ answers, ...rest }) => rest) : api('/api/aeo/history');
}

export async function getAeoRun(id) {
  if (!online()) return api(`/api/aeo/run/${id}`).catch(() => null);
  const saved = read().aeo.find((r) => r.id === id);
  if (saved) return saved;
  const r = await api(`/api/aeo/run/${id}`).catch(() => null);
  if (r) {
    const db = read();
    db.aeo.unshift(r);
    db.aeo = db.aeo.slice(0, 20);
    write(db);
  }
  return r;
}
