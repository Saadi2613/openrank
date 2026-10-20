// Audit de site : explore le site comme Google et liste les problèmes SEO.
import { fetchRaw, fetchText, readText, normalizeUrl, BOT_UA } from './http.js';
import { parsePage, pageIssues, CHECKS } from './page.js';
import { store, id } from './store.js';

const jobs = new Map();

function robotsRules(txt) {
  // On ne garde que les règles « User-agent: * » (simple mais suffisant).
  const disallow = [];
  let applies = false;
  const sitemaps = [];
  for (const raw of txt.split('\n')) {
    const line = raw.split('#')[0].trim();
    const [k, ...rest] = line.split(':');
    const v = rest.join(':').trim();
    const key = (k || '').toLowerCase();
    if (key === 'user-agent') applies = v === '*';
    else if (key === 'disallow' && applies && v) disallow.push(v);
    else if (key === 'sitemap' && v) sitemaps.push(v);
  }
  return { disallow, sitemaps };
}

async function fetchPage(url) {
  try {
    const { res, ms } = await fetchRaw(url, { timeout: 15000, headers: { 'User-Agent': BOT_UA } });
    const type = res.headers.get('content-type') || '';
    const body = type.includes('html') ? await readText(res) : '';
    return { status: res.status, finalUrl: res.url, redirected: res.redirected, ms, type, body };
  } catch (e) {
    return { status: 0, finalUrl: url, redirected: false, ms: 0, type: '', body: '', error: e.message };
  }
}

async function siteChecks(origin, host) {
  const [robots, sitemap, llms, httpVersion] = await Promise.all([
    fetchText(`${origin}/robots.txt`, { timeout: 8000 }),
    fetchText(`${origin}/sitemap.xml`, { timeout: 8000 }),
    fetchText(`${origin}/llms.txt`, { timeout: 8000 }),
    fetchRaw(`http://${host}/`, { timeout: 8000, redirect: 'manual' }).then(({ res }) => res).catch(() => null),
  ]);
  const rules = robots.ok ? robotsRules(robots.text) : { disallow: [], sitemaps: [] };
  const hasSitemap = (sitemap.ok && /<(urlset|sitemapindex)/i.test(sitemap.text)) || rules.sitemaps.length > 0;
  const loc = httpVersion?.headers?.get('location') || '';
  return {
    robots: robots.ok,
    robotsRules: rules,
    sitemap: hasSitemap,
    llms: llms.ok && llms.text.length > 20 && !/<html/i.test(llms.text),
    httpsRedirect: httpVersion ? httpVersion.status >= 300 && httpVersion.status < 400 && loc.startsWith('https') : null,
  };
}

export function startAudit(input, { maxPages = 100 } = {}) {
  const start = normalizeUrl(input);
  if (!start) throw new Error('URL invalide');
  const jobId = id();
  const job = { id: jobId, url: start, status: 'running', crawled: 0, queued: 1, maxPages, startedAt: new Date().toISOString() };
  jobs.set(jobId, job);
  runAudit(job).catch((e) => {
    job.status = 'error';
    job.error = e.message;
  });
  return job;
}

export const getJob = (jobId) => jobs.get(jobId) || null;

async function runAudit(job) {
  // Suit la redirection d'accueil (ex. exemple.fr -> www.exemple.fr).
  const home = await fetchPage(job.url);
  const origin = new URL(home.finalUrl || job.url).origin;
  const host = new URL(origin).hostname;
  const site = await siteChecks(origin, host);

  const seen = new Set();
  const queue = [{ url: new URL(home.finalUrl || job.url).toString(), depth: 0, from: null }];
  const pages = [];
  const inlinks = new Map(); // url -> pages qui pointent dessus
  const blocked = (u) => site.robotsRules.disallow.some((d) => new URL(u).pathname.startsWith(d));

  seen.add(queue[0].url);
  const workers = 5;
  let active = 0;

  await new Promise((resolve) => {
    const next = () => {
      if (pages.length + active >= job.maxPages || (!queue.length && !active)) {
        if (!active) resolve();
        return;
      }
      while (active < workers && queue.length && pages.length + active < job.maxPages) {
        const item = queue.shift();
        active++;
        fetchPage(item.url).then((r) => {
          const p = { url: item.url, depth: item.depth, status: r.status, ms: r.ms, redirected: r.redirected, finalUrl: r.finalUrl, bytes: r.body.length };
          if (r.body && r.status < 400) {
            const parsed = parsePage(r.body, r.finalUrl);
            Object.assign(p, parsed);
            for (const l of parsed.links) {
              if (!l.internal) continue;
              const u = new URL(l.url);
              if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|mp3|css|js|xml|ico)$/i.test(u.pathname)) continue;
              const key = u.toString();
              if (!inlinks.has(key)) inlinks.set(key, new Set());
              inlinks.get(key).add(item.url);
              if (!seen.has(key) && !blocked(key) && seen.size < job.maxPages * 3) {
                seen.add(key);
                queue.push({ url: key, depth: item.depth + 1 });
              }
            }
          } else {
            Object.assign(p, { title: '', description: '', h1: [], headings: [], links: [], words: 0, imgCount: 0, imgNoAlt: 0, schemaTypes: [], robots: '', og: false, viewport: true, lang: 'x', canonical: 'x' });
          }
          delete p.text;
          pages.push(p);
          job.crawled = pages.length;
          job.queued = queue.length;
          active--;
          next();
        });
      }
    };
    next();
  });

  // Problèmes par page + doublons + liens cassés.
  const titles = new Map();
  const descs = new Map();
  for (const p of pages) {
    p.issues = pageIssues(p);
    if (p.status < 400 && p.title) titles.set(p.title, (titles.get(p.title) || 0) + 1);
    if (p.status < 400 && p.description) descs.set(p.description, (descs.get(p.description) || 0) + 1);
  }
  const brokenTargets = new Set(pages.filter((p) => p.status >= 400 || p.status === 0).map((p) => p.url));
  for (const p of pages) {
    if (p.status >= 400) continue;
    if (p.title && titles.get(p.title) > 1) p.issues.push('title_duplicate');
    if (p.description && descs.get(p.description) > 1) p.issues.push('desc_duplicate');
    const broken = p.links.filter((l) => l.internal && brokenTargets.has(l.url)).map((l) => l.url);
    if (broken.length) {
      p.issues.push('broken_link');
      p.brokenLinks = [...new Set(broken)].slice(0, 20);
    }
  }

  const summary = {};
  for (const p of pages) for (const k of p.issues) (summary[k] ||= { ...CHECKS[k], id: k, count: 0, urls: [] }).count++;
  for (const p of pages) for (const k of p.issues) if (summary[k].urls.length < 50) summary[k].urls.push(p.url);

  let errors = 0, warnings = 0, notices = 0;
  for (const s of Object.values(summary)) {
    if (s.sev === 'error') errors += s.count;
    else if (s.sev === 'warning') warnings += s.count;
    else notices += s.count;
  }
  // Santé : chaque page perd des points selon ses erreurs (lourd) et avertissements (léger).
  const penalty = pages.reduce((acc, p) => {
    const e = p.issues.filter((k) => CHECKS[k].sev === 'error').length;
    const w = p.issues.filter((k) => CHECKS[k].sev === 'warning').length;
    return acc + Math.min(1, e * 0.5 + w * 0.08);
  }, 0);
  let health = pages.length ? Math.round(100 * (1 - penalty / pages.length)) : 0;
  if (!site.sitemap) health -= 3;
  if (!site.robots) health -= 2;
  if (site.httpsRedirect === false) health -= 5;
  health = Math.max(0, Math.min(100, health));

  const statuses = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, erreur: 0 };
  for (const p of pages) {
    if (!p.status) statuses.erreur++;
    else if (p.redirected) statuses['3xx']++;
    else statuses[`${String(p.status)[0]}xx`] = (statuses[`${String(p.status)[0]}xx`] || 0) + 1;
  }

  const result = {
    id: job.id,
    domain: host.replace(/^www\./, ''),
    url: job.url,
    date: new Date().toISOString(),
    health,
    crawled: pages.length,
    errors,
    warnings,
    notices,
    site,
    statuses,
    avgMs: pages.length ? Math.round(pages.reduce((a, p) => a + p.ms, 0) / pages.length) : 0,
    issues: Object.values(summary).sort((a, b) => ['error', 'warning', 'notice'].indexOf(a.sev) - ['error', 'warning', 'notice'].indexOf(b.sev) || b.count - a.count),
    pages: pages.map((p) => ({ url: p.url, status: p.status, ms: p.ms, depth: p.depth, title: p.title, words: p.words, issues: p.issues, brokenLinks: p.brokenLinks })),
  };
  store.insert('audits', result);
  store.trim('audits', 40);
  job.status = 'done';
  job.resultId = result.id;
}

export function listAudits() {
  return store.get('audits').map(({ pages, issues, ...rest }) => rest);
}

export function getAudit(auditId) {
  return store.find('audits', (a) => a.id === auditId) || null;
}
