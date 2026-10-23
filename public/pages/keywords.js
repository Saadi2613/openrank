import { api, esc, $$, loader, errorBox, num, intentBadge, downloadCsv, toast, favicon, compact } from '../ui.js';
import { listProjects, updateProject } from '../data.js';
import { gauge } from '../charts.js';
import { go } from '../app.js';

function form(view, value, route) {
  const f = view.querySelector('#kForm');
  f.q.value = value || '';
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = f.q.value.trim();
    if (v) go(`${route}?q=${encodeURIComponent(v)}`);
  });
}

const INTENT_HELP = 'I = Informationnel (apprendre) · C = Commercial (comparer) · T = Transactionnel (acheter) · N = Navigationnel (aller sur un site)';

export async function renderIdeas(view, params, _rest, alive) {
  view.innerHTML = `
    <div class="page-head"><div><div class="crumb">Mots-clés</div><h1>Recherche de mots-clés</h1><p>Ce que les gens tapent vraiment sur Google autour de ton sujet.</p></div></div>
    <form class="toolbar" id="kForm"><input class="input" name="q" placeholder="ex. assurance auto"><button class="btn btn-primary">Trouver des idées</button></form>
    <div id="out"></div>`;
  form(view, params.q, 'mots-cles');
  const out = view.querySelector('#out');
  if (!params.q) {
    out.innerHTML = `<div class="card empty"><h2>Un mot-clé de départ</h2><p>On en trouve des centaines d'autres. Exemples : <a href="#/mots-cles?q=assurance auto">assurance auto</a> · <a href="#/mots-cles?q=coiffeur">coiffeur</a> · <a href="#/mots-cles?q=recette ramadan">recette ramadan</a></p></div>`;
    return;
  }
  out.innerHTML = loader('Recherche des idées de mots-clés…');
  let d;
  try {
    d = await api(`/api/keywords/ideas?q=${encodeURIComponent(params.q)}`);
  } catch (e) {
    out.innerHTML = errorBox(e);
    return;
  }
  if (!alive()) return;

  const f = { group: 'Tous', word: null, intent: null, text: '' };
  const counts = { Tous: d.rows.length, Questions: d.rows.filter((r) => r.group === 'Questions').length, Variantes: d.rows.filter((r) => r.group === 'Variantes').length };
  out.innerHTML = `
    <div class="grid g4">
      <div class="card kpi"><span class="label">Idées trouvées</span><span class="value">${num(d.total)}</span><span class="hint">pour « ${esc(d.seed)} »</span></div>
      <div class="card kpi"><span class="label">Questions</span><span class="value">${num(counts.Questions)}</span><span class="hint">idéales pour une FAQ et pour les IA</span></div>
      <div class="card kpi"><span class="label">Volumes</span><span class="value" style="font-size:20px">${d.hasVolumes ? 'Exacts' : 'Popularité'}</span><span class="hint">${d.hasVolumes ? 'via DataForSEO' : 'score 1-100 estimé · <a href="#/reglages">volumes exacts</a>'}</span></div>
      <div class="card kpi"><span class="label">Prochaine étape</span><a class="btn btn-primary" style="align-self:flex-start;margin-top:6px" href="#/mot-cle?q=${encodeURIComponent(d.seed)}">Analyse détaillée</a><span class="hint">difficulté + top 10 Google</span></div>
    </div>
    <div class="card mt">
      <div class="toolbar" style="margin-bottom:12px">
        <div class="chips" id="groups">${Object.entries(counts).map(([g, n]) => `<button class="chip ${g === 'Tous' ? 'active' : ''}" data-g="${g}">${g}<b>${n}</b></button>`).join('')}</div>
        <select class="input" id="intentSel" style="width:auto"><option value="">Toutes intentions</option><option value="I">Informationnel</option><option value="C">Commercial</option><option value="T">Transactionnel</option><option value="N">Navigationnel</option></select>
        <input class="input" id="textFilter" placeholder="Contient…" style="max-width:200px">
        <span style="flex:1"></span>
        <button class="btn btn-sm" id="addTrack">+ Ajouter au suivi</button>
        <button class="btn btn-sm" id="csv">Exporter CSV</button>
      </div>
      <div class="chips" id="clusters" style="margin-bottom:14px">${d.clusters.map((c) => `<button class="chip" data-w="${esc(c.word)}">${esc(c.word)}<b>${c.count}</b></button>`).join('')}</div>
      <p class="small muted" style="margin:0 0 10px">${INTENT_HELP}</p>
      <div id="table"></div>
    </div>`;

  const filtered = () =>
    d.rows.filter(
      (r) =>
        (f.group === 'Tous' || r.group === f.group) &&
        (!f.word || r.keyword.split(/\s+/).includes(f.word)) &&
        (!f.intent || r.intent.id === f.intent) &&
        (!f.text || r.keyword.includes(f.text)),
    );
  const selected = new Set();
  let sortKey = d.hasVolumes ? 'volume' : 'popularity';
  let desc = true;
  const draw = () => {
    const rows = filtered().sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      const r = typeof va === 'string' ? va.localeCompare(vb, 'fr') : (va ?? -1) - (vb ?? -1);
      return desc ? -r : r;
    });
    const th = (k, label, cls = '') => `<th class="sortable ${cls}" data-k="${k}">${label}${sortKey === k ? (desc ? ' ↓' : ' ↑') : ''}</th>`;
    out.querySelector('#table').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:30px"><input type="checkbox" id="all"></th>${th('keyword', 'Mot-clé')}<th>Intention</th>${th('popularity', 'Popularité')}${d.hasVolumes ? th('volume', 'Volume', 'num') + th('cpc', 'CPC', 'num') : ''}${th('words', 'Mots', 'num')}</tr></thead><tbody>${rows
      .slice(0, 400)
      .map(
        (r) => `<tr><td><input type="checkbox" data-kw="${esc(r.keyword)}" ${selected.has(r.keyword) ? 'checked' : ''}></td><td><a href="#/mot-cle?q=${encodeURIComponent(r.keyword)}">${esc(r.keyword)}</a></td><td>${intentBadge(r.intent)}</td><td><div style="display:flex;align-items:center;gap:8px"><div class="bar-mini" style="width:80px"><span style="width:${r.popularity}%"></span></div><span class="small">${r.popularity}</span></div></td>${d.hasVolumes ? `<td class="num">${num(r.volume)}</td><td class="num">${r.cpc != null ? r.cpc.toFixed(2).replace('.', ',') + ' €' : '—'}</td>` : ''}<td class="num">${r.words}</td></tr>`,
      )
      .join('')}</tbody></table></div><p class="small muted">${rows.length} mots-clés${rows.length > 400 ? ' (400 affichés, exporte pour tout voir)' : ''}.</p>`;
    $$('th.sortable', out).forEach((t) => t.addEventListener('click', () => {
      if (sortKey === t.dataset.k) desc = !desc;
      else (sortKey = t.dataset.k), (desc = t.dataset.k !== 'keyword');
      draw();
    }));
    $$('input[data-kw]', out).forEach((c) => c.addEventListener('change', () => (c.checked ? selected.add(c.dataset.kw) : selected.delete(c.dataset.kw))));
    out.querySelector('#all').addEventListener('change', (e) => {
      rows.slice(0, 400).forEach((r) => (e.target.checked ? selected.add(r.keyword) : selected.delete(r.keyword)));
      draw();
    });
  };
  draw();

  $$('#groups .chip', out).forEach((c) => c.addEventListener('click', () => {
    f.group = c.dataset.g;
    $$('#groups .chip', out).forEach((x) => x.classList.toggle('active', x === c));
    draw();
  }));
  $$('#clusters .chip', out).forEach((c) => c.addEventListener('click', () => {
    f.word = f.word === c.dataset.w ? null : c.dataset.w;
    $$('#clusters .chip', out).forEach((x) => x.classList.toggle('active', x.dataset.w === f.word));
    draw();
  }));
  out.querySelector('#intentSel').addEventListener('change', (e) => ((f.intent = e.target.value || null), draw()));
  out.querySelector('#textFilter').addEventListener('input', (e) => ((f.text = e.target.value.trim().toLowerCase()), draw()));
  out.querySelector('#csv').addEventListener('click', () =>
    downloadCsv(`mots-cles-${d.seed}.csv`, filtered().map((r) => ({ mot_cle: r.keyword, intention: r.intent.label, popularite: r.popularity, volume: r.volume ?? '', cpc: r.cpc ?? '', groupe: r.group }))),
  );
  out.querySelector('#addTrack').addEventListener('click', async () => {
    if (!selected.size) return toast('Coche d’abord des mots-clés');
    const projects = await listProjects();
    if (!projects.length) {
      sessionStorage.setItem('or-pending-kw', JSON.stringify([...selected]));
      return go('positions?new=1');
    }
    const p = projects[0];
    const pick = projects.length > 1 ? prompt(`Dans quel projet ? Tape le numéro :\n${projects.map((x, i) => `${i + 1}. ${x.domain}`).join('\n')}`, '1') : '1';
    const target = projects[Number(pick) - 1] || p;
    await updateProject(target.id, { keywords: [...target.keywords, ...selected] });
    toast(`${selected.size} mots-clés ajoutés au suivi de ${target.domain}`);
  });
}

export async function renderOverview(view, params, _rest, alive) {
  view.innerHTML = `
    <div class="page-head"><div><div class="crumb">Mots-clés</div><h1>Analyse d'un mot-clé</h1><p>Difficulté, intention et qui est dans le top 10.</p></div></div>
    <form class="toolbar" id="kForm"><input class="input" name="q" placeholder="ex. chaussure running"><button class="btn btn-primary">Analyser</button></form>
    <div id="out"></div>`;
  form(view, params.q, 'mot-cle');
  const out = view.querySelector('#out');
  if (!params.q) {
    out.innerHTML = `<div class="card empty"><h2>Quel mot-clé ?</h2><p>Exemple : <a href="#/mot-cle?q=chaussure running">chaussure running</a></p></div>`;
    return;
  }
  out.innerHTML = loader('Lecture des résultats de recherche et calcul de la difficulté…');
  let d;
  try {
    d = await api(`/api/keywords/overview?q=${encodeURIComponent(params.q)}`);
  } catch (e) {
    out.innerHTML = errorBox(e);
    return;
  }
  if (!alive()) return;
  const kdColor = d.difficulty >= 70 ? 'bad' : d.difficulty >= 50 ? 'warn' : d.difficulty >= 30 ? 'accent' : 'good';
  out.innerHTML = `
    <div class="grid g4">
      <div class="card kpi"><span class="label">${d.volume != null ? 'Volume mensuel' : 'Popularité'}</span><span class="value">${d.volume != null ? compact(d.volume) : d.popularity ?? '—'}</span><span class="hint">${d.volume != null ? 'recherches / mois' : 'sur 100, estimée'}</span></div>
      <div class="card kpi"><span class="label">Difficulté</span><div style="display:flex;align-items:center;gap:10px"><span class="value">${d.difficulty ?? '—'}</span>${gauge(100 - (d.difficulty ?? 0), 70)}</div><span class="badge ${kdColor}" style="align-self:flex-start">${d.difficultyLabel}</span></div>
      <div class="card kpi"><span class="label">Intention</span><span class="value" style="font-size:22px">${esc(d.intent.label)}</span><span class="hint">${esc(INTENT_HELP.split(' · ').find((x) => x.startsWith(d.intent.id)) || '')}</span></div>
      <div class="card kpi"><span class="label">Éléments dans les résultats</span><div class="chips" style="margin-top:6px">${d.features.length ? d.features.map((f) => `<span class="badge">${esc(f)}</span>`).join('') : '<span class="muted small">Résultats classiques</span>'}</div><span class="hint">Moteur : ${esc(d.engine)}</span></div>
    </div>
    <div class="grid g3 mt">
      <div class="card span2"><div class="card-head"><h2>Top 10 ${esc(d.engine)}</h2><span class="sub">Autorité = force du site (0-100)</span></div>
        ${d.serp.map((r) => `<div class="serp-item"><div class="pos">${r.position}</div><div style="min-width:0"><a class="t" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a><div class="u"><img src="${favicon(r.domain)}" width="14" height="14" style="vertical-align:-2px;margin-right:6px" alt="">${esc(r.url)}</div><p>${esc(r.snippet)}</p></div><div><a class="badge ${r.authority >= 60 ? 'bad' : r.authority >= 40 ? 'warn' : 'good'}" href="#/domaine?d=${encodeURIComponent(r.domain)}" title="Score d'autorité">${r.authority ?? '—'}</a></div></div>`).join('') || '<div class="empty small">Aucun résultat.</div>'}
      </div>
      <div>
        <div class="card"><div class="card-head"><h2>Questions posées</h2></div>${d.questions.length ? `<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px">${d.questions.map((q) => `<li><a href="#/mot-cle?q=${encodeURIComponent(q.keyword)}">${esc(q.keyword)}</a></li>`).join('')}</ul>` : '<div class="muted small">Aucune.</div>'}</div>
        <div class="card mt"><div class="card-head"><h2>Mots-clés proches</h2><a class="btn btn-sm" href="#/mots-cles?q=${encodeURIComponent(d.keyword)}">Tout voir</a></div><div class="chips">${d.related.map((q) => `<a class="chip" href="#/mot-cle?q=${encodeURIComponent(q.keyword)}">${esc(q.keyword)}</a>`).join('')}</div></div>
      </div>
    </div>`;
}
