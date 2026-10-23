// OpenRank — serveur. En local : `npm start` puis http://localhost:4321. En ligne : PUBLIC_MODE=1.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config, keyStatus, ROOT } from './lib/config.js';
import { domainOverview } from './lib/domain.js';
import { keywordIdeas, keywordOverview } from './lib/keywords.js';
import { serp } from './lib/serp.js';
import { startAudit, getJob, listAudits, getAudit } from './lib/audit.js';
import { onPage } from './lib/onpage.js';
import { speed } from './lib/speed.js';
import { aeoReadiness, aeoVisibility, aeoHistory, aeoGet, suggestPrompts, engines } from './lib/aeo.js';
import { listProjects, getProject, createProject, updateProject, deleteProject, checkProject, computeSnapshot, startScheduler } from './lib/tracking.js';
import { cleanDomain, normalizeUrl } from './lib/http.js';
import { rateLimit, assertPublicUrl } from './lib/guard.js';

const PUBLIC = path.join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

const ENV_KEYS = { serper: ['SERPER_API_KEY'], groq: ['GROQ_API_KEY'], openai: ['OPENAI_API_KEY'], anthropic: ['ANTHROPIC_API_KEY'], google: ['GOOGLE_API_KEY'], openpagerank: ['OPENPAGERANK_API_KEY'], dataforseo: ['DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD'] };
const CONFIG_KEY = { SERPER_API_KEY: 'serper', GROQ_API_KEY: 'groq', OPENAI_API_KEY: 'openai', ANTHROPIC_API_KEY: 'anthropic', GOOGLE_API_KEY: 'google', OPENPAGERANK_API_KEY: 'openpagerank', DATAFORSEO_LOGIN: 'dataforseoLogin', DATAFORSEO_PASSWORD: 'dataforseoPassword' };

// Enregistre une clé dans .env (le fichier reste sur ton ordi, jamais envoyé ailleurs).
function saveKey(name, value) {
  const file = path.join(ROOT, '.env');
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n') : [];
  const clean = String(value || '').trim().replace(/[\r\n]/g, '');
  const i = lines.findIndex((l) => l.startsWith(name + '='));
  if (i >= 0) lines[i] = `${name}=${clean}`;
  else lines.push(`${name}=${clean}`);
  fs.writeFileSync(file, lines.filter((l, idx) => l || idx < lines.length - 1).join('\n') + '\n', { mode: 0o600 });
  process.env[name] = clean;
  config.keys[CONFIG_KEY[name]] = clean || null;
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1e6) throw new Error('Requête trop grosse');
  }
  return raw ? JSON.parse(raw) : {};
}

const routes = [];
// opts.group = famille de limite anti-abus ; opts.localOnly = indisponible en ligne ; opts.checkUrl = vérifie body.url.
const on = (method, pattern, fn, opts = {}) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, opts });
const LOCAL = { localOnly: true };
const HEAVY = { group: 'heavy', checkUrl: true };
const cap = (n, local) => (config.publicMode ? n : local);

on('GET', '/api/status', () => ({ name: 'OpenRank', publicMode: config.publicMode, country: config.country, keys: keyStatus(), engines: engines().map((e) => e.name), serpEngine: config.keys.serper ? 'Google' : 'Bing' }), { group: 'none' });
on('POST', '/api/settings', async ({ body }) => {
  const names = ENV_KEYS[body.id];
  if (!names) throw new Error('Clé inconnue');
  if (body.id === 'dataforseo') {
    saveKey('DATAFORSEO_LOGIN', body.login);
    saveKey('DATAFORSEO_PASSWORD', body.value);
  } else saveKey(names[0], body.value);
  return { keys: keyStatus() };
}, LOCAL);

on('GET', '/api/domain', ({ q }) => domainOverview(q.get('d')));
on('GET', '/api/compare', async ({ q }) => {
  const list = (q.get('d') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5);
  return Promise.all(list.map((d) => domainOverview(d).catch((e) => ({ domain: d, error: e.message }))));
});
on('GET', '/api/keywords/ideas', ({ q }) => keywordIdeas(q.get('q')));
on('GET', '/api/keywords/overview', ({ q }) => keywordOverview(q.get('q')), { group: 'heavy' });
on('GET', '/api/serp', ({ q }) => serp(q.get('q'), { pages: Number(q.get('pages')) || 1 }));

on('POST', '/api/audit', ({ body }) => startAudit(body.url, { maxPages: Math.min(cap(100, 500), Math.max(5, Number(body.maxPages) || 100)) }), { group: 'audit', checkUrl: true });
on('GET', '/api/audit/job/:id', ({ p }) => getJob(p.id) || { status: 'unknown' }, { group: 'none' });
on('GET', '/api/audits', () => listAudits(), LOCAL);
on('GET', '/api/audit/:id', ({ p }) => getAudit(p.id), { group: 'none' });

on('POST', '/api/onpage', ({ body }) => onPage(body.url, body.keyword), HEAVY);
on('POST', '/api/speed', ({ body }) => speed(body.url, body.strategy), HEAVY);

on('POST', '/api/aeo/readiness', ({ body }) => aeoReadiness(body.url), HEAVY);
on('POST', '/api/aeo/visibility', ({ body }) => aeoVisibility({ ...body, prompts: (body.prompts || []).slice(0, cap(5, 10)) }), { group: 'aeo' });
on('GET', '/api/aeo/prompts', ({ q }) => suggestPrompts(q.get('topic')), { group: 'none' });
on('GET', '/api/aeo/history', ({ q }) => aeoHistory(q.get('d')), LOCAL);
on('GET', '/api/aeo/run/:id', ({ p }) => aeoGet(p.id), { group: 'none' });

on('GET', '/api/projects', () => listProjects(), LOCAL);
on('POST', '/api/projects', ({ body }) => createProject(body), LOCAL);
on('GET', '/api/projects/:id', ({ p }) => getProject(p.id), LOCAL);
on('PATCH', '/api/projects/:id', ({ p, body }) => updateProject(p.id, body), LOCAL);
on('DELETE', '/api/projects/:id', ({ p }) => (deleteProject(p.id), { ok: true }), LOCAL);
on('POST', '/api/projects/:id/check', ({ p }) => checkProject(p.id), LOCAL);
// Version sans stockage : utilisée en ligne, le projet vit dans le navigateur du visiteur.
on('POST', '/api/rank-check', ({ body }) => {
  const domain = cleanDomain(body.domain);
  if (!domain) throw new Error('Domaine invalide');
  const keywords = [...new Set((body.keywords || []).map((k) => String(k).trim().toLowerCase()).filter(Boolean))].slice(0, cap(20, 200));
  const competitors = [...new Set((body.competitors || []).map(cleanDomain).filter((c) => c && c !== domain))].slice(0, cap(3, 5));
  if (!keywords.length) throw new Error('Ajoute au moins un mot-clé');
  return computeSnapshot({ domain, keywords, competitors });
}, { group: 'heavy' });

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC, pathname));
  if (!file.startsWith(PUBLIC)) return res.writeHead(403).end();
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
  const route = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
  if (!route) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Route inconnue' }));
  }
  // Bloque les requêtes envoyées par d'autres sites web ouverts dans ton navigateur.
  const origin = req.headers.origin;
  const sameSite = !origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin.replace(/^https?:\/\//, '') === req.headers.host;
  if (req.method !== 'GET' && (!sameSite || !(req.headers['content-type'] || '').includes('application/json'))) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Requête refusée' }));
  }
  const send = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  };
  if (route.opts.localOnly && config.publicMode) return send(403, { error: 'Disponible seulement dans la version installée chez toi.' });
  const limited = rateLimit(req, route.opts.group);
  if (limited) return send(429, { error: limited });
  try {
    const body = ['POST', 'PATCH'].includes(req.method) ? await readBody(req) : {};
    if (route.opts.checkUrl) await assertPublicUrl(normalizeUrl(body.url));
    const data = await route.fn({ q: url.searchParams, p: url.pathname.match(route.re).groups || {}, body });
    res.writeHead(data == null ? 404 : 200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data ?? { error: 'Introuvable' }));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: e.message || 'Erreur' }));
  }
});

// En local : écoute seulement sur ta machine (127.0.0.1), personne d'autre sur le réseau n'y accède.
server.listen(config.port, config.host, () => {
  console.log(`\n  OpenRank tourne sur  http://localhost:${config.port}${config.publicMode ? '  (mode public)' : ''}\n`);
  if (!config.publicMode) startScheduler();
});
