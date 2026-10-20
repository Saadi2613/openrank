import { api, esc, loader, errorBox, compact, num, pct, month, dayLabel, duration, flag, countryName, favicon, date, sortableTable, downloadCsv } from '../ui.js';
import { lineChart, donut, barList, gauge, seriesColor } from '../charts.js';
import { go } from '../app.js';

const SOURCES = [
  ['SearchOrganic', 'Recherche organique', 'var(--s3)'],
  ['Direct', 'Direct', 'var(--s1)'],
  ['Referrals', 'Sites référents', 'var(--s4)'],
  ['SocialOrganic', 'Réseaux sociaux', 'var(--s5)'],
  ['Mail', 'E-mail', '#8a8f98'],
  ['SearchPaid', 'Recherche payante', 'var(--s2)'],
  ['GenAi', 'IA (ChatGPT…)', 'var(--text)'],
];

function searchForm(view, value = '', placeholder = 'ex. decathlon.fr', route = 'domaine', param = 'd') {
  const f = view.querySelector('#dForm');
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = f.q.value.trim();
    if (v) go(`${route}?${param}=${encodeURIComponent(v)}`);
  });
  f.q.value = value;
  f.q.placeholder = placeholder;
}

export async function renderOverview(view, params, _rest, alive) {
  view.innerHTML = `
    <div class="page-head"><div><div class="crumb">Analyse</div><h1>Vue d'ensemble domaine</h1><p>Le trafic, l'autorité et les mots-clés de n'importe quel site.</p></div></div>
    <form class="toolbar" id="dForm"><input class="input" name="q"><button class="btn btn-primary">Analyser</button></form>
    <div id="out"></div>`;
  searchForm(view, params.d || '');
  const out = view.querySelector('#out');
  if (!params.d) {
    out.innerHTML = `<div class="card empty"><h2>Quel site veux-tu analyser ?</h2><p>Ton site, ou celui d'un concurrent. Exemples : <a href="#/domaine?d=decathlon.fr">decathlon.fr</a> · <a href="#/domaine?d=backmarket.fr">backmarket.fr</a></p></div>`;
    return;
  }
  out.innerHTML = loader('Récupération du trafic, du rang et des mots-clés…');
  let d;
  try {
    d = await api(`/api/domain?d=${encodeURIComponent(params.d)}`);
  } catch (e) {
    out.innerHTML = errorBox(e);
    return;
  }
  if (!alive()) return;
  const age = d.firstSeen ? Math.max(0, new Date().getFullYear() - Number(d.firstSeen.slice(0, 4))) : null;
  out.innerHTML = `
    <div class="card">
      <div class="site-head">
        <img class="fav" src="${favicon(d.domain)}" alt="">
        <div style="flex:1;min-width:0">
          <h2 style="font-size:22px">${esc(d.domain)} <a href="https://${esc(d.domain)}" target="_blank" rel="noopener" class="small muted" style="text-decoration:none">↗</a></h2>
          <div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.title || d.description || '')}</div>
          <div class="chips" style="margin-top:8px">
            ${d.category ? `<span class="badge accent">${esc([...new Set(d.category.replace(/_/g, ' ').split('/').map((x) => x.trim()).filter(Boolean).map((x) => x[0].toUpperCase() + x.slice(1)))].join(' › '))}</span>` : ''}
            ${d.categoryRank ? `<span class="badge">#${num(d.categoryRank)} de sa catégorie</span>` : ''}
            ${d.firstSeen ? `<span class="badge">En ligne depuis ${d.firstSeen.slice(0, 4)}${age ? ` (${age} ans)` : ''}</span>` : ''}
          </div>
        </div>
        <div class="chips">
          <a class="btn btn-sm" href="#/audit?url=${encodeURIComponent(d.domain)}">Auditer</a>
          <a class="btn btn-sm" href="#/ia-pret?url=${encodeURIComponent(d.domain)}">Prêt pour l'IA ?</a>
          <a class="btn btn-sm" href="#/comparer?d=${encodeURIComponent(d.domain)}">Comparer</a>
        </div>
      </div>
    </div>
    ${!d.found ? `<div class="info-box mt">Ce site est trop petit pour apparaître dans les classements publics : pas de chiffres de trafic. L'<a href="#/audit?url=${encodeURIComponent(d.domain)}">audit</a> et le <a href="#/positions">suivi de positions</a> marchent quand même.</div>` : ''}
    <div class="grid g4 mt">
      <div class="card kpi"><span class="label">Score d'autorité</span><div style="display:flex;align-items:center;gap:10px"><span class="value">${d.authority ?? '—'}</span>${gauge(d.authority, 70)}</div><span class="hint">0 à 100, basé sur le rang mondial</span></div>
      <div class="card kpi"><span class="label">Trafic organique / mois</span><span class="value">${compact(d.organicVisits)}</span><span class="hint">${d.sources ? `${pct(d.sources.SearchOrganic)} des visites` : 'Visites depuis Google, Bing…'}</span></div>
      <div class="card kpi"><span class="label">Visites totales / mois</span><span class="value">${compact(d.visits)}</span><span class="hint">Source : ${esc(d.visitsSource || '—')}</span></div>
      <div class="card kpi"><span class="label">Classement</span><span class="value">${d.countryRank ? `${flag(d.countryRank.code)} #${num(d.countryRank.rank)}` : d.globalRank ? `#${num(d.globalRank)}` : '—'}</span><span class="hint">${d.globalRank ? `#${num(d.globalRank)} dans le monde` : 'Non classé'}</span></div>
    </div>
    <div class="grid g2 mt">
      <div class="card"><div class="card-head"><h2>Visites par mois</h2><span class="sub">3 derniers mois</span></div><div id="cVisits"></div></div>
      <div class="card"><div class="card-head"><h2>Rang mondial (Tranco)</h2><span class="sub">30 jours · plus bas = mieux</span></div><div id="cRank"></div></div>
    </div>
    <div class="grid g3 mt">
      <div class="card"><div class="card-head"><h2>Sources de trafic</h2></div><div id="cSources"></div></div>
      <div class="card"><div class="card-head"><h2>Pays</h2></div><div id="cCountries"></div></div>
      <div class="card"><div class="card-head"><h2>Engagement</h2></div>
        <div class="grid" style="gap:14px">
          <div class="kpi"><span class="label">Pages par visite</span><span class="value" style="font-size:22px">${d.engagement?.pagesPerVisit ? d.engagement.pagesPerVisit.toFixed(1).replace('.', ',') : '—'}</span></div>
          <div class="kpi"><span class="label">Durée moyenne</span><span class="value" style="font-size:22px">${duration(d.engagement?.duration)}</span></div>
          <div class="kpi"><span class="label">Taux de rebond</span><span class="value" style="font-size:22px">${d.engagement?.bounce ? pct(d.engagement.bounce, 0) : '—'}</span></div>
        </div>
      </div>
    </div>
    <div class="grid g3 mt">
      <div class="card span2"><div class="card-head"><h2>Meilleurs mots-clés organiques</h2><button class="btn btn-sm" id="kwCsv">Exporter CSV</button></div><div id="tKeywords"></div></div>
      <div class="card"><div class="card-head"><h2>Trafic venant des IA</h2><a class="btn btn-sm" href="#/ia?d=${encodeURIComponent(d.domain)}">Tester</a></div><div id="cAi"></div></div>
    </div>`;

  lineChart(out.querySelector('#cVisits'), [{ name: 'Visites', points: d.months.map((m) => ({ label: month(m.date), value: m.value })) }], { format: compact, area: true });
  lineChart(out.querySelector('#cRank'), [{ name: 'Rang', points: d.trancoSeries.map((m) => ({ label: dayLabel(m.date), value: m.value })) }], { format: (v) => '#' + num(v), invert: true });
  if (d.sources) donut(out.querySelector('#cSources'), SOURCES.map(([k, label, color]) => ({ label, value: d.sources[k] || 0, color })).filter((s) => s.value > 0.001));
  else out.querySelector('#cSources').innerHTML = '<div class="empty small">Pas de données.</div>';
  out.querySelector('#cCountries').innerHTML = d.countries.length
    ? barList(d.countries.map((c) => ({ label: `${flag(c.code)} ${countryName(c.code)}`, value: c.share, display: pct(c.share) })), { color: 'var(--s1)', max: 1 })
    : '<div class="empty small">Pas de données.</div>';

  const kw = d.keywords;
  if (kw.length) {
    sortableTable(out.querySelector('#tKeywords'), kw, [
      { key: 'keyword', label: 'Mot-clé', render: (r) => `<a href="#/mot-cle?q=${encodeURIComponent(r.keyword)}">${esc(r.keyword)}</a>` },
      { key: 'volume', label: 'Volume', num: true, render: (r) => num(r.volume) },
      { key: 'cpc', label: 'CPC', num: true, render: (r) => (r.cpc != null ? `${r.cpc.toFixed(2).replace('.', ',')} $` : '—') },
      { key: 'value', label: 'Visites estimées', num: true, render: (r) => compact(r.value) },
    ], { sort: 'value' });
  } else out.querySelector('#tKeywords').innerHTML = `<div class="empty small">Pas de mots-clés publics pour ce site. Utilise la <a href="#/mots-cles">recherche de mots-clés</a>.</div>`;
  out.querySelector('#kwCsv').addEventListener('click', () => downloadCsv(`${d.domain}-mots-cles.csv`, kw));

  const ai = d.ai;
  out.querySelector('#cAi').innerHTML = ai?.visits
    ? `<div class="kpi" style="margin-bottom:14px"><span class="value">${compact(ai.visits)}</span><span class="hint">visites / mois venant des assistants IA</span></div>${barList(ai.bots.filter((b) => b.value != null).map((b) => ({ label: b.name, value: b.value, display: `${b.value.toFixed(1).replace('.', ',')} %` })), { color: 'var(--s3)', max: 100 })}`
    : `<div class="empty small">Pas encore de trafic IA mesuré. Lance un <a href="#/ia?d=${encodeURIComponent(d.domain)}">test de visibilité IA</a>.</div>`;
}

export async function renderCompare(view, params, _rest, alive) {
  view.innerHTML = `
    <div class="page-head"><div><div class="crumb">Analyse</div><h1>Analyse concurrentielle</h1><p>Jusqu'à 5 sites côte à côte. Sépare-les par des virgules.</p></div></div>
    <form class="toolbar" id="dForm"><input class="input" name="q" style="max-width:640px"><button class="btn btn-primary">Comparer</button></form>
    <div id="out"></div>`;
  searchForm(view, params.d || '', 'ex. decathlon.fr, intersport.fr, go-sport.com', 'comparer');
  const out = view.querySelector('#out');
  const list = (params.d || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length < 2) {
    out.innerHTML = `<div class="card empty"><h2>Ajoute au moins 2 sites</h2><p>Exemple : <a href="#/comparer?d=decathlon.fr,intersport.fr,go-sport.com">decathlon.fr, intersport.fr, go-sport.com</a></p></div>`;
    return;
  }
  out.innerHTML = loader('Analyse des concurrents…');
  const data = (await api(`/api/compare?d=${encodeURIComponent(list.join(','))}`)).filter((d) => !d.error);
  if (!alive()) return;
  const rows = [
    ['Score d\'autorité', (d) => d.authority ?? '—'],
    ['Visites / mois', (d) => compact(d.visits)],
    ['Trafic organique / mois', (d) => compact(d.organicVisits)],
    ['Part organique', (d) => pct(d.sources?.SearchOrganic)],
    ['Part venant des IA', (d) => pct(d.sources?.GenAi, 2)],
    ['Rang mondial', (d) => (d.globalRank ? '#' + num(d.globalRank) : '—')],
    ['Pages / visite', (d) => d.engagement?.pagesPerVisit?.toFixed(1).replace('.', ',') ?? '—'],
    ['Taux de rebond', (d) => (d.engagement?.bounce ? pct(d.engagement.bounce, 0) : '—')],
    ['En ligne depuis', (d) => d.firstSeen?.slice(0, 4) || '—'],
  ];
  out.innerHTML = `
    <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th></th>${data.map((d, i) => `<th><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${seriesColor(i)};margin-right:6px"></span><a href="#/domaine?d=${encodeURIComponent(d.domain)}">${esc(d.domain)}</a></th>`).join('')}</tr></thead>
    <tbody>${rows.map(([label, f]) => `<tr><td><b>${label}</b></td>${data.map((d) => `<td>${f(d)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>
    <div class="grid g2 mt">
      <div class="card"><div class="card-head"><h2>Visites par mois</h2></div><div class="legend" style="margin-bottom:8px">${data.map((d, i) => `<span><i style="background:${seriesColor(i)}"></i>${esc(d.domain)}</span>`).join('')}</div><div id="cVis"></div></div>
      <div class="card"><div class="card-head"><h2>Trafic organique / mois</h2></div><div id="cOrg"></div></div>
    </div>
    <div class="card mt"><div class="card-head"><h2>Mots-clés en commun</h2><span class="sub">Parmi les meilleurs mots-clés publics de chaque site</span></div><div id="kwGap"></div></div>`;
  const labels = data[0]?.months.map((m) => month(m.date)) || [];
  lineChart(out.querySelector('#cVis'), data.map((d) => ({ name: d.domain, points: labels.map((l, i) => ({ label: l, value: d.months[i]?.value ?? null })) })), { format: compact });
  out.querySelector('#cOrg').innerHTML = barList(data.map((d, i) => ({ label: d.domain, value: d.organicVisits || 0, display: compact(d.organicVisits), color: seriesColor(i) })));
  const all = new Map();
  data.forEach((d) => d.keywords.forEach((k) => {
    const cur = all.get(k.keyword) || { keyword: k.keyword, volume: k.volume, sites: [] };
    cur.sites.push(d.domain);
    all.set(k.keyword, cur);
  }));
  const kws = [...all.values()].sort((a, b) => b.sites.length - a.sites.length || (b.volume || 0) - (a.volume || 0));
  out.querySelector('#kwGap').innerHTML = kws.length
    ? `<table class="tbl"><thead><tr><th>Mot-clé</th><th class="num">Volume</th>${data.map((d) => `<th>${esc(d.domain)}</th>`).join('')}</tr></thead><tbody>${kws
        .slice(0, 40)
        .map((k) => `<tr><td><a href="#/mot-cle?q=${encodeURIComponent(k.keyword)}">${esc(k.keyword)}</a></td><td class="num">${num(k.volume)}</td>${data.map((d) => `<td>${k.sites.includes(d.domain) ? '<span class="badge good">✓ présent</span>' : '<span class="muted">—</span>'}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`
    : '<div class="empty small">Pas de mots-clés publics pour ces sites.</div>';
}
