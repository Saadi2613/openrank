import { api, esc, loader, errorBox, dateTime, compact, toast, favicon } from '../ui.js';
import { gauge, barList, seriesColor } from '../charts.js';
import { go, state } from '../app.js';
import { checkList } from './onpage.js';

export async function renderVisibility(view, params, rest, alive) {
  if (rest[0]) return renderRun(view, rest[0], alive);
  const engines = state.status?.engines || [];
  view.innerHTML = `
    <div class="page-head"><div><div class="crumb">IA & AEO</div><h1>Visibilité dans les IA</h1><p>On pose aux IA les questions de tes clients. On regarde si elles citent ta marque, ou tes concurrents.</p></div></div>
    ${engines.length ? `<div class="info-box" style="margin-bottom:16px">IA branchées : <b>${engines.map(esc).join(', ')}</b>. <a href="#/reglages">Ajouter ChatGPT ou Claude</a></div>`
      : `<div class="error-box" style="margin-bottom:16px;color:var(--text)">Aucune IA branchée. Prends une clé <b>gratuite</b> sur <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a> (connexion Google, bouton « Create API Key »), puis colle-la dans <a href="#/reglages">Réglages</a>. 1 minute.</div>`}
    <form class="card" id="vForm">
      <div class="grid g3">
        <label class="field">Ton site<input class="input" name="domain" placeholder="monsite.fr" required></label>
        <label class="field">Nom de ta marque<input class="input" name="brand" placeholder="Ma Marque"></label>
        <label class="field">Ton activité <small>pour générer les questions</small><div style="display:flex;gap:8px"><input class="input" name="topic" placeholder="ex. lavage auto à domicile"><button type="button" class="btn" id="gen">Générer</button></div></label>
      </div>
      <div class="grid g2 mt">
        <label class="field">Questions posées aux IA <small>une par ligne, 10 max</small><textarea class="input" name="prompts" style="min-height:150px"></textarea></label>
        <label class="field">Concurrents <small>un par ligne (nom ou site)</small><textarea class="input" name="competitors" style="min-height:150px"></textarea></label>
      </div>
      <button class="btn btn-primary mt" ${engines.length ? '' : 'disabled'}>Lancer le test</button>
      <div id="vOut"></div>
    </form>
    <div class="grid g2 mt">
      <div class="card"><div class="card-head"><h2>Trafic réel venant des IA</h2><span class="sub">estimé par SimilarWeb</span></div><div id="aiTraffic"><div class="empty small">Entre ton site pour voir ce chiffre.</div></div></div>
      <div class="card"><div class="card-head"><h2>Tests précédents</h2></div><div id="hist">${loader()}</div></div>
    </div>`;
  const f = view.querySelector('#vForm');
  if (params.d) f.domain.value = params.d;

  const loadTraffic = async () => {
    const d = f.domain.value.trim();
    if (!d) return;
    const box = view.querySelector('#aiTraffic');
    box.innerHTML = loader();
    const o = await api(`/api/domain?d=${encodeURIComponent(d)}`).catch(() => null);
    if (!alive()) return;
    box.innerHTML = o?.ai?.visits
      ? `<div class="kpi" style="margin-bottom:14px"><span class="value">${compact(o.ai.visits)}</span><span class="hint">visites / mois depuis ChatGPT, Gemini, Claude, Perplexity…</span></div>${barList(o.ai.bots.filter((b) => b.value != null).map((b) => ({ label: b.name, value: b.value, display: `${b.value.toFixed(1).replace('.', ',')} %` })), { color: 'var(--s3)', max: 100 })}`
      : `<div class="empty small">Pas encore de trafic IA mesurable pour ${esc(d)}. C'est justement l'objectif : te faire citer.</div>`;
    if (!f.competitors.value && o?.competitors?.length) f.competitors.value = o.competitors.slice(0, 5).join('\n');
  };
  f.domain.addEventListener('change', loadTraffic);
  if (params.d) loadTraffic();

  view.querySelector('#gen').addEventListener('click', async () => {
    const t = f.topic.value.trim();
    if (!t) return toast('Décris ton activité en quelques mots');
    f.prompts.value = (await api(`/api/aeo/prompts?topic=${encodeURIComponent(t)}`)).join('\n');
  });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = view.querySelector('#vOut');
    if (!f.prompts.value.trim()) {
      if (!f.topic.value.trim()) return toast('Ajoute des questions ou décris ton activité');
      f.prompts.value = (await api(`/api/aeo/prompts?topic=${encodeURIComponent(f.topic.value.trim())}`)).join('\n');
    }
    const btn = f.querySelector('button.btn-primary');
    btn.disabled = true;
    out.innerHTML = loader('Les IA répondent… (30 s à 1 min)');
    try {
      const r = await api('/api/aeo/visibility', {
        domain: f.domain.value,
        brand: f.brand.value,
        prompts: f.prompts.value.split('\n'),
        competitors: f.competitors.value.split('\n'),
      });
      go(`ia/${r.id}`);
    } catch (err) {
      out.innerHTML = `<div class="mt">${errorBox(err)}</div>`;
      btn.disabled = false;
    }
  });

  const hist = await api('/api/aeo/history');
  if (!alive()) return;
  view.querySelector('#hist').innerHTML = hist.length
    ? `<table class="tbl"><thead><tr><th>Site</th><th>Date</th><th class="num">Cité</th></tr></thead><tbody>${hist.slice(0, 10).map((h) => `<tr><td><a href="#/ia/${h.id}">${esc(h.domain)}</a></td><td>${dateTime(h.date)}</td><td class="num"><span class="badge ${h.visibility >= 50 ? 'good' : h.visibility > 0 ? 'warn' : 'bad'}">${h.visibility} %</span></td></tr>`).join('')}</tbody></table>`
    : '<div class="empty small">Aucun test pour l’instant.</div>';
}

async function renderRun(view, id, alive) {
  view.innerHTML = loader();
  const r = await api(`/api/aeo/run/${id}`).catch(() => null);
  if (!alive()) return;
  if (!r) {
    view.innerHTML = errorBox('Test introuvable');
    return;
  }
  const ok = r.answers.filter((a) => !a.error);
  const errors = r.answers.filter((a) => a.error);
  const ranks = ok.filter((a) => a.rank).map((a) => a.rank);
  const avgRank = ranks.length ? (ranks.reduce((x, y) => x + y, 0) / ranks.length).toFixed(1).replace('.', ',') : '—';
  const cited = new Map();
  ok.forEach((a) => a.domainsCited.forEach((d) => cited.set(d, (cited.get(d) || 0) + 1)));
  const topCited = [...cited.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  view.innerHTML = `
    <div class="page-head">
      <div><div class="crumb"><a href="#/ia" style="text-decoration:none">← Visibilité dans les IA</a></div><h1><img src="${favicon(r.domain)}" width="24" height="24" style="vertical-align:-3px;margin-right:10px" alt="">${esc(r.brand || r.domain)}</h1><p>${r.prompts.length} questions · ${r.engines.map(esc).join(', ')} · ${dateTime(r.date)}</p></div>
      <a class="btn btn-primary" href="#/ia?d=${encodeURIComponent(r.domain)}">Nouveau test</a>
    </div>
    ${errors.length ? `<div class="error-box" style="margin-bottom:16px">${errors.length} réponse(s) en erreur : ${esc(errors[0].error)}</div>` : ''}
    <div class="grid g4">
      <div class="card kpi"><span class="label">Visibilité IA</span><div class="gauge-wrap"><span class="value">${r.visibility}%</span>${gauge(r.visibility, 80)}</div><span class="hint">des réponses citent ta marque</span></div>
      <div class="card kpi"><span class="label">Rang moyen quand cité</span><span class="value">${avgRank}</span><span class="hint">1 = cité en premier</span></div>
      <div class="card kpi"><span class="label">Réponses analysées</span><span class="value">${ok.length}</span><span class="hint">${r.prompts.length} questions × ${r.engines.length} IA</span></div>
      <div class="card kpi"><span class="label">Prochaine étape</span><a class="btn btn-sm" style="align-self:flex-start;margin-top:6px" href="#/ia-pret?url=${encodeURIComponent(r.domain)}">Rendre mon site lisible par les IA</a></div>
    </div>
    <div class="grid g2 mt">
      <div class="card"><div class="card-head"><h2>Part de voix</h2><span class="sub">% des réponses qui citent chaque marque</span></div>${barList(r.shareOfVoice.map((s, i) => ({ label: s.name, value: s.pct, display: `${s.pct} %`, color: s.name === r.domain ? 'var(--neon-on)' : seriesColor(i) })), { max: 100 })}</div>
      <div class="card"><div class="card-head"><h2>Sites cités par les IA</h2><span class="sub">tes vrais concurrents dans les IA</span></div>${topCited.length ? barList(topCited.map(([d, n]) => ({ label: d, value: n, display: `${n}×`, color: d === r.domain ? 'var(--neon-on)' : 'var(--s1)' }))) : '<div class="empty small">Les IA n’ont cité aucun site précis.</div>'}</div>
    </div>
    <div class="card mt"><div class="card-head"><h2>Les réponses</h2></div>
      ${r.answers.map((a, i) => `<div class="check" style="display:block">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;cursor:pointer" data-t="${i}">
          <span class="badge">${esc(a.engine)}</span>
          ${a.error ? '<span class="badge bad">Erreur</span>' : a.mentioned ? `<span class="badge good">✓ Cité${a.rank ? ` · rang ${a.rank}` : ''}</span>` : '<span class="badge bad">✕ Pas cité</span>'}
          <b style="flex:1;min-width:200px">${esc(a.prompt)}</b>
          ${(a.competitors || []).map((c) => `<span class="badge warn">${esc(c)}</span>`).join('')}
        </div>
        <div class="answer" id="ans${i}" hidden>${esc(a.error || a.text)}</div>
      </div>`).join('')}
    </div>`;
  view.querySelectorAll('[data-t]').forEach((el) => el.addEventListener('click', () => {
    const d = view.querySelector('#ans' + el.dataset.t);
    d.hidden = !d.hidden;
  }));
}

export async function renderReadiness(view, params, _rest, alive) {
  view.innerHTML = `
    <div class="page-head"><div><div class="crumb">IA & AEO</div><h1>Site prêt pour les IA ?</h1><p>ChatGPT, Claude et Perplexity lisent ton site avec des robots. On vérifie qu'ils peuvent entrer et comprendre.</p></div></div>
    <form class="card toolbar" id="rForm" style="margin-bottom:20px"><input class="input" name="url" placeholder="monsite.fr" required><button class="btn btn-primary">Vérifier</button></form>
    <div id="out"></div>`;
  const f = view.querySelector('#rForm');
  f.url.value = params.url || '';
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    go(`ia-pret?url=${encodeURIComponent(f.url.value.trim())}`);
  });
  const out = view.querySelector('#out');
  if (!params.url) {
    out.innerHTML = `<div class="card empty"><h2>Quel site vérifier ?</h2><p>On teste robots.txt, llms.txt, les données structurées, les FAQ et le rendu sans JavaScript.</p></div>`;
    return;
  }
  out.innerHTML = loader('Lecture du site comme un robot IA…');
  let d;
  try {
    d = await api('/api/aeo/readiness', { url: params.url });
  } catch (e) {
    out.innerHTML = errorBox(e);
    return;
  }
  if (!alive()) return;
  const blocked = d.bots.filter((b) => !b.allowed);
  const robotsFix = blocked.length ? blocked.map((b) => `User-agent: ${b.ua}\nAllow: /`).join('\n\n') : null;
  out.innerHTML = `
    <div class="grid g3">
      <div class="card kpi"><span class="label">Score AEO</span><div class="gauge-wrap"><span class="value">${d.score}</span>${gauge(d.score, 90)}</div><span class="hint">${d.score >= 80 ? 'Les IA peuvent te lire et te citer' : d.score >= 50 ? 'Quelques blocages' : 'Les IA te voient mal'}</span></div>
      <div class="card kpi"><span class="label">Robots IA autorisés</span><span class="value">${d.bots.length - blocked.length}/${d.bots.length}</span><span class="hint">${blocked.length ? `${blocked.length} bloqué(s) dans robots.txt` : 'aucun blocage'}</span></div>
      <div class="card kpi"><span class="label">Questions dans tes titres</span><span class="value">${d.questionHeadings.length}</span><span class="hint">les IA adorent le format question → réponse</span></div>
    </div>
    <div class="grid g2 mt">
      <div class="card"><div class="card-head"><h2>À faire</h2></div>${checkList(d.checks)}</div>
      <div class="card"><div class="card-head"><h2>Robots des IA</h2></div><table class="tbl"><thead><tr><th>Robot</th><th>Pour</th><th class="num">Accès</th></tr></thead><tbody>${d.bots.map((b) => `<tr><td><code>${esc(b.ua)}</code></td><td>${esc(b.owner)}</td><td class="num">${b.allowed ? '<span class="badge good">✓ Autorisé</span>' : '<span class="badge bad">✕ Bloqué</span>'}</td></tr>`).join('')}</tbody></table>
        ${robotsFix ? `<p class="small" style="margin:14px 0 6px"><b>À ajouter dans ton robots.txt :</b></p><pre class="code">${esc(robotsFix)}</pre>` : ''}
      </div>
    </div>
    <div class="card mt"><div class="card-head"><h2>${d.llmsTxt ? 'Ton llms.txt' : 'Ton llms.txt, prêt à copier'}</h2>${d.llmsTxt ? '' : '<button class="btn btn-sm btn-primary" id="copyLlms">Copier</button>'}</div>
      <p class="small muted" style="margin-top:0">${d.llmsTxt ? 'Ce fichier aide les IA à comprendre ton site.' : 'Crée un fichier <b>llms.txt</b> à la racine de ton site (comme robots.txt) avec ce contenu, puis complète-le.'}</p>
      <pre class="code">${esc(d.llmsTxt || d.suggestedLlms)}</pre>
    </div>`;
  out.querySelector('#copyLlms')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(d.suggestedLlms);
    toast('llms.txt copié');
  });
}
