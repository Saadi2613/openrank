import { api, esc, icons, date, scoreBadge, favicon } from '../ui.js';
import { go, state } from '../app.js';

const TOOLS = [
  { href: '#/domaine', ic: icons.globe, t: "Vue d'ensemble domaine", p: 'Trafic, autorité, mots-clés et pays de n’importe quel site.' },
  { href: '#/mots-cles', ic: icons.key, t: 'Recherche de mots-clés', p: 'Des centaines d’idées en 1 seconde, triées par intention.' },
  { href: '#/positions', ic: icons.chart, t: 'Suivi de positions', p: 'Tes positions chaque jour, face à tes concurrents.' },
  { href: '#/audit', ic: icons.wrench, t: 'Audit de site', p: 'Toutes les erreurs SEO de ton site, avec la solution.' },
  { href: '#/ia', ic: icons.ai, t: 'Visibilité dans les IA', p: 'ChatGPT, Claude, Groq citent-ils ta marque ?' },
  { href: '#/on-page', ic: icons.page, t: 'Optimiser une page', p: 'Une URL + un mot-clé = ta liste d’actions.' },
  { href: '#/comparer', ic: icons.vs, t: 'Analyse concurrentielle', p: 'Jusqu’à 5 sites comparés côte à côte.' },
  { href: '#/vitesse', ic: icons.bolt, t: 'Vitesse du site', p: 'Ce qui ralentit ton site et comment le corriger.' },
];

export async function render(view) {
  const activeKeys = state.status?.keys.filter((k) => k.active).length || 0;
  view.innerHTML = `
    <section class="hero">
      <div class="crumb">Plateforme SEO & AEO · 100 % gratuite et open source</div>
      <h1>Sois trouvé sur Google <em>et</em> cité par les IA.</h1>
      <p>Tout ce que fait Semrush pour le référencement, sans l'abonnement à 140 €/mois. Tape un site ou un mot-clé.</p>
      <form class="hero-search" id="heroForm">
        <input class="input" name="q" placeholder="ex. decathlon.fr ou chaussure running" autofocus>
        <button class="btn btn-primary">Analyser</button>
      </form>
      <div class="chips" style="margin-top:12px">
        <span class="small muted" style="align-self:center">Essaie :</span>
        <a class="chip" href="#/domaine?d=leboncoin.fr">leboncoin.fr</a>
        <a class="chip" href="#/domaine?d=doctolib.fr">doctolib.fr</a>
        <a class="chip" href="#/mots-cles?q=assurance auto">assurance auto</a>
        <a class="chip" href="#/mots-cles?q=chaussure running">chaussure running</a>
      </div>
    </section>
    ${activeKeys === 0 ? `<div class="info-box" style="margin-bottom:20px">Tout marche déjà gratuitement. Pour aller plus loin (positions Google exactes, test dans les IA), ajoute une clé gratuite dans <a href="#/reglages">Réglages</a>. 2 minutes.</div>` : ''}
    <div class="grid g4">${TOOLS.map((t) => `<a class="card tool-card" href="${t.href}"><span class="ic">${t.ic}</span><h3>${t.t}</h3><p>${t.p}</p></a>`).join('')}</div>
    <div class="grid g2 mt">
      <div class="card"><div class="card-head"><h2>Tes projets suivis</h2><a class="btn btn-sm" href="#/positions">Tout voir</a></div><div id="dashProjects"></div></div>
      <div class="card"><div class="card-head"><h2>Derniers audits</h2><a class="btn btn-sm" href="#/audit">Nouvel audit</a></div><div id="dashAudits"></div></div>
    </div>`;

  view.querySelector('#heroForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (!q) return;
    if (/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/.*)?$/i.test(q) && !/\s/.test(q)) go(`domaine?d=${encodeURIComponent(q)}`);
    else go(`mots-cles?q=${encodeURIComponent(q)}`);
  });

  const [projects, audits] = await Promise.all([api('/api/projects').catch(() => []), api('/api/audits').catch(() => [])]);
  view.querySelector('#dashProjects').innerHTML = projects.length
    ? `<table class="tbl"><thead><tr><th>Site</th><th class="num">Mots-clés</th><th class="num">Visibilité</th></tr></thead><tbody>${projects
        .slice(0, 6)
        .map((p) => `<tr><td><a href="#/positions/${p.id}"><img src="${favicon(p.domain)}" width="16" height="16" style="vertical-align:-3px;margin-right:8px" alt="">${esc(p.domain)}</a></td><td class="num">${p.keywords.length}</td><td class="num">${p.history.length ? `${String(p.history[p.history.length - 1].visibility).replace('.', ',')} %` : '—'}</td></tr>`)
        .join('')}</tbody></table>`
    : `<div class="empty small">Aucun projet. <a href="#/positions">Crée ton premier suivi</a> : ton site + tes mots-clés.</div>`;
  view.querySelector('#dashAudits').innerHTML = audits.length
    ? `<table class="tbl"><thead><tr><th>Site</th><th>Date</th><th class="num">Santé</th></tr></thead><tbody>${audits
        .slice(0, 6)
        .map((a) => `<tr><td><a href="#/audit/${a.id}">${esc(a.domain)}</a></td><td>${date(a.date)}</td><td class="num">${scoreBadge(a.health)}</td></tr>`)
        .join('')}</tbody></table>`
    : `<div class="empty small">Aucun audit. <a href="#/audit">Lance un audit</a> : tu verras toutes les erreurs de ton site.</div>`;
}
