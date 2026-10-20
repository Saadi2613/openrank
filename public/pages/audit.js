import { api, esc, loader, errorBox, date, dateTime, scoreBadge, num, downloadCsv, $$ } from '../ui.js';
import { gauge, donut } from '../charts.js';
import { go } from '../app.js';

const SEV = { error: 'Erreurs', warning: 'Avertissements', notice: 'Remarques' };

export async function render(view, params, rest, alive) {
  if (rest[0]) return renderResult(view, rest[0], alive);
  view.innerHTML = `
    <div class="page-head"><div><div class="crumb">SEO technique</div><h1>Audit de site</h1><p>OpenRank visite ton site page par page, comme Google, et liste tout ce qui bloque.</p></div></div>
    <form class="card" id="aForm">
      <div class="toolbar" style="margin:0">
        <input class="input" name="url" placeholder="monsite.fr" required style="max-width:420px">
        <select class="input" name="maxPages" style="width:auto"><option value="25">25 pages (rapide)</option><option value="100" selected>100 pages</option><option value="250">250 pages</option><option value="500">500 pages</option></select>
        <button class="btn btn-primary">Lancer l'audit</button>
      </div>
      <div id="progress"></div>
    </form>
    <div class="card mt"><div class="card-head"><h2>Audits précédents</h2></div><div id="list">${loader()}</div></div>`;
  const f = view.querySelector('#aForm');
  if (params.url) f.url.value = params.url;
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button');
    btn.disabled = true;
    const prog = view.querySelector('#progress');
    try {
      const job = await api('/api/audit', { url: f.url.value, maxPages: Number(f.maxPages.value) });
      const poll = async () => {
        if (!alive()) return;
        const j = await api(`/api/audit/job/${job.id}`);
        const done = j.crawled || 0;
        prog.innerHTML = `<div style="margin-top:16px"><div style="display:flex;justify-content:space-between;margin-bottom:6px" class="small"><b>${j.status === 'running' ? 'Exploration en cours…' : 'Terminé'}</b><span>${done} / ${j.maxPages} pages max</span></div><div class="progress"><span style="width:${Math.min(100, (done / j.maxPages) * 100)}%"></span></div></div>`;
        if (j.status === 'done') return go(`audit/${j.resultId}`);
        if (j.status === 'error') {
          prog.innerHTML = errorBox(j.error);
          btn.disabled = false;
          return;
        }
        setTimeout(poll, 1200);
      };
      poll();
    } catch (err) {
      prog.innerHTML = `<div class="mt">${errorBox(err)}</div>`;
      btn.disabled = false;
    }
  });
  const audits = await api('/api/audits');
  if (!alive()) return;
  view.querySelector('#list').innerHTML = audits.length
    ? `<table class="tbl"><thead><tr><th>Site</th><th>Date</th><th class="num">Pages</th><th class="num">Erreurs</th><th class="num">Avertissements</th><th class="num">Santé</th></tr></thead><tbody>${audits
        .map((a) => `<tr><td><a href="#/audit/${a.id}">${esc(a.domain)}</a></td><td>${dateTime(a.date)}</td><td class="num">${a.crawled}</td><td class="num">${a.errors}</td><td class="num">${a.warnings}</td><td class="num">${scoreBadge(a.health)}</td></tr>`)
        .join('')}</tbody></table>`
    : '<div class="empty small">Aucun audit pour l’instant.</div>';
}

async function renderResult(view, id, alive) {
  view.innerHTML = loader();
  const a = await api(`/api/audit/${id}`).catch(() => null);
  if (!alive()) return;
  if (!a) {
    view.innerHTML = errorBox('Audit introuvable');
    return;
  }
  const yes = (v) => (v ? '<span class="badge good">✓ Oui</span>' : v === false ? '<span class="badge bad">✕ Non</span>' : '<span class="badge">?</span>');
  view.innerHTML = `
    <div class="page-head">
      <div><div class="crumb"><a href="#/audit" style="text-decoration:none">← Audit de site</a></div><h1>${esc(a.domain)}</h1><p>${a.crawled} pages explorées le ${date(a.date)} · temps de réponse moyen ${num(a.avgMs)} ms</p></div>
      <div class="chips"><a class="btn btn-primary" href="#/audit?url=${encodeURIComponent(a.url)}">Relancer</a><button class="btn" id="csv">Exporter CSV</button></div>
    </div>
    <div class="grid g4">
      <div class="card kpi"><span class="label">Santé du site</span><div class="gauge-wrap"><span class="value">${a.health}%</span>${gauge(a.health, 90)}</div><span class="hint">${a.health >= 80 ? 'Bon état' : a.health >= 50 ? 'À améliorer' : 'Urgent'}</span></div>
      <div class="card kpi"><span class="label"><span class="sev error"></span> Erreurs</span><span class="value" style="color:var(--bad)">${a.errors}</span><span class="hint">à corriger en premier</span></div>
      <div class="card kpi"><span class="label"><span class="sev warning"></span> Avertissements</span><span class="value" style="color:var(--warn)">${a.warnings}</span><span class="hint">impact moyen</span></div>
      <div class="card kpi"><span class="label"><span class="sev notice"></span> Remarques</span><span class="value">${a.notices}</span><span class="hint">bonus</span></div>
    </div>
    <div class="grid g3 mt">
      <div class="card span2"><div class="card-head"><h2>Problèmes trouvés</h2><span class="sub">Clique pour voir les pages et la solution</span></div><div id="issues"></div></div>
      <div>
        <div class="card"><div class="card-head"><h2>Vérifications du site</h2></div>
          <table class="tbl"><tbody>
            <tr><td>robots.txt</td><td class="num">${yes(a.site.robots)}</td></tr>
            <tr><td>Sitemap XML</td><td class="num">${yes(a.site.sitemap)}</td></tr>
            <tr><td>Redirection http → https</td><td class="num">${yes(a.site.httpsRedirect)}</td></tr>
            <tr><td>llms.txt (pour les IA)</td><td class="num">${yes(a.site.llms)}</td></tr>
          </tbody></table>
        </div>
        <div class="card mt"><div class="card-head"><h2>Codes HTTP</h2></div><div id="cStatus"></div></div>
      </div>
    </div>
    <div class="card mt"><div class="card-head"><h2>Pages explorées</h2><input class="input" id="pf" placeholder="Filtrer les URL…" style="max-width:260px"></div><div id="pages"></div></div>`;

  const issuesEl = view.querySelector('#issues');
  issuesEl.innerHTML = a.issues.length
    ? a.issues.map((i, idx) => `<div class="issue" data-i="${idx}"><span class="sev ${i.sev}" title="${SEV[i.sev]}"></span><div><b>${esc(i.label)}</b></div><span class="badge">${i.count} page${i.count > 1 ? 's' : ''}</span></div><div class="issue-detail" id="d${idx}" hidden><div><b>Solution :</b> ${esc(i.fix)}</div><ul>${i.urls.map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a></li>`).join('')}</ul></div>`).join('')
    : '<div class="empty"><h2>Aucun problème 🎉</h2></div>';
  $$('.issue', issuesEl).forEach((el) => el.addEventListener('click', () => {
    const d = view.querySelector('#d' + el.dataset.i);
    d.hidden = !d.hidden;
  }));
  donut(view.querySelector('#cStatus'), [
    { label: '2xx OK', value: a.statuses['2xx'] || 0, color: 'var(--good)' },
    { label: '3xx Redirigé', value: a.statuses['3xx'] || 0, color: 'var(--s1)' },
    { label: '4xx Introuvable', value: a.statuses['4xx'] || 0, color: 'var(--warn)' },
    { label: '5xx Erreur serveur', value: a.statuses['5xx'] || 0, color: 'var(--bad)' },
    { label: 'Injoignable', value: a.statuses.erreur || 0, color: 'var(--muted)' },
  ].filter((x) => x.value), { format: (v) => `${v}` });

  const drawPages = (filter = '') => {
    const rows = a.pages.filter((p) => p.url.includes(filter));
    view.querySelector('#pages').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>URL</th><th class="num">Code</th><th class="num">Temps</th><th class="num">Mots</th><th class="num">Problèmes</th></tr></thead><tbody>${rows
      .slice(0, 500)
      .map((p) => `<tr><td class="url-cell"><a href="${esc(p.url)}" target="_blank" rel="noopener" title="${esc(p.title || '')}">${esc(p.url.replace(/^https?:\/\/[^/]+/, '') || '/')}</a></td><td class="num"><span class="badge ${p.status >= 400 || !p.status ? 'bad' : 'good'}">${p.status || '✕'}</span></td><td class="num">${num(p.ms)} ms</td><td class="num">${num(p.words)}</td><td class="num">${p.issues.length}</td></tr>`)
      .join('')}</tbody></table></div>`;
  };
  drawPages();
  view.querySelector('#pf').addEventListener('input', (e) => drawPages(e.target.value.trim()));
  view.querySelector('#csv').addEventListener('click', () =>
    downloadCsv(`audit-${a.domain}.csv`, a.pages.map((p) => ({ url: p.url, code: p.status, temps_ms: p.ms, mots: p.words, title: p.title || '', problemes: p.issues.join(', ') }))),
  );
}
