import { api, esc, loader, errorBox, num } from '../ui.js';
import { gauge } from '../charts.js';
import { go } from '../app.js';

export const checkList = (checks) =>
  checks.map((c) => `<div class="check"><span class="dot ${c.ok ? 'ok' : 'ko'}">${c.ok ? '✓' : '!'}</span><div><div class="t">${esc(c.label)}</div>${c.ok ? '' : `<div class="f">${esc(c.fix)}</div>`}</div></div>`).join('');

export async function renderOnPage(view, params, _rest, alive) {
  view.innerHTML = `
    <div class="page-head"><div><div class="crumb">SEO technique</div><h1>Optimiser une page</h1><p>Donne une page et le mot-clé visé. Tu reçois la liste exacte des choses à changer.</p></div></div>
    <form class="card toolbar" id="oForm" style="margin-bottom:20px">
      <input class="input" name="url" placeholder="https://monsite.fr/ma-page" required style="max-width:420px">
      <input class="input" name="keyword" placeholder="mot-clé visé" style="max-width:260px">
      <button class="btn btn-primary">Analyser la page</button>
    </form>
    <div id="out"></div>`;
  const f = view.querySelector('#oForm');
  f.url.value = params.url || '';
  f.keyword.value = params.kw || '';
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    go(`on-page?url=${encodeURIComponent(f.url.value.trim())}&kw=${encodeURIComponent(f.keyword.value.trim())}`);
  });
  const out = view.querySelector('#out');
  if (!params.url) {
    out.innerHTML = `<div class="card empty"><h2>Quelle page veux-tu mieux classer ?</h2><p>Colle son adresse et le mot-clé sur lequel tu veux apparaître.</p></div>`;
    return;
  }
  out.innerHTML = loader('Analyse de la page et du top 5 concurrent…');
  let d;
  try {
    d = await api('/api/onpage', { url: params.url, keyword: params.kw });
  } catch (e) {
    out.innerHTML = errorBox(e);
    return;
  }
  if (!alive()) return;
  const todo = d.checks.filter((c) => !c.ok).length;
  out.innerHTML = `
    <div class="grid g4">
      <div class="card kpi"><span class="label">Score de la page</span><div class="gauge-wrap"><span class="value">${d.score}</span>${gauge(d.score, 90)}</div><span class="hint">${todo} action${todo > 1 ? 's' : ''} à faire</span></div>
      <div class="card kpi"><span class="label">Longueur</span><span class="value">${num(d.words)}</span><span class="hint">mots${d.avgWords ? ` · top 5 : ${num(d.avgWords)}` : ''}</span></div>
      <div class="card kpi"><span class="label">Mot-clé trouvé</span><span class="value">${d.keyword ? d.occurrences : '—'}</span><span class="hint">${d.keyword ? `fois · densité ${String(d.density).replace('.', ',')} %` : 'aucun mot-clé donné'}</span></div>
      <div class="card kpi"><span class="label">Lisibilité</span><span class="value">${d.readability ?? '—'}</span><span class="hint">sur 100 · plus haut = plus simple</span></div>
    </div>
    <div class="grid g3 mt">
      <div class="card span2"><div class="card-head"><h2>À faire, dans l'ordre</h2></div>${checkList(d.checks)}</div>
      <div>
        <div class="card"><div class="card-head"><h2>Aperçu Google</h2></div>
          <div class="u small" style="color:var(--good);word-break:break-all">${esc(d.url)}</div>
          <div style="color:var(--s1);font-size:18px;font-weight:500;margin:2px 0">${esc(d.title || '(pas de titre)')}</div>
          <div class="small" style="color:var(--text-2)">${esc(d.description || '(pas de description : Google en inventera une)')}</div>
        </div>
        <div class="card mt"><div class="card-head"><h2>Plan de la page</h2></div><div style="display:flex;flex-direction:column;gap:4px;max-height:320px;overflow:auto">${d.headings.map((h) => `<div class="small" style="padding-left:${(Number(h.tag[1]) - 1) * 14}px"><span class="badge">${h.tag.toUpperCase()}</span> ${esc(h.text)}</div>`).join('') || '<span class="muted small">Aucun titre H1/H2/H3.</span>'}</div></div>
      </div>
    </div>
    ${d.competitors.length ? `<div class="card mt"><div class="card-head"><h2>Les pages du top 5</h2><span class="sub">pour « ${esc(d.keyword)} »</span></div><table class="tbl"><thead><tr><th class="num">Pos.</th><th>Page</th><th class="num">Mots</th><th class="num">Sous-titres H2</th><th>Données structurées</th></tr></thead><tbody>${d.competitors.map((c) => `<tr><td class="num">${c.position}</td><td class="url-cell"><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title || c.url)}</a></td><td class="num">${num(c.words)}</td><td class="num">${c.h2}</td><td class="small">${esc(c.schema.join(', ') || '—')}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
}

export async function renderSpeed(view, params, _rest, alive) {
  view.innerHTML = `
    <div class="page-head"><div><div class="crumb">SEO technique</div><h1>Vitesse du site</h1><p>Un site lent perd des visiteurs et des positions.</p></div></div>
    <form class="card toolbar" id="sForm" style="margin-bottom:20px">
      <input class="input" name="url" placeholder="monsite.fr" required>
      <select class="input" name="strategy" style="width:auto"><option value="mobile">Mobile</option><option value="desktop">Ordinateur</option></select>
      <button class="btn btn-primary">Tester</button>
    </form>
    <div id="out"></div>`;
  const f = view.querySelector('#sForm');
  f.url.value = params.url || '';
  if (params.s) f.strategy.value = params.s;
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    go(`vitesse?url=${encodeURIComponent(f.url.value.trim())}&s=${f.strategy.value}`);
  });
  const out = view.querySelector('#out');
  if (!params.url) {
    out.innerHTML = `<div class="card empty"><h2>Quel site tester ?</h2></div>`;
    return;
  }
  out.innerHTML = loader('Test de vitesse (jusqu’à 1 minute avec Google)…');
  let d;
  try {
    d = await api('/api/speed', { url: params.url, strategy: params.s || 'mobile' });
  } catch (e) {
    out.innerHTML = errorBox(e);
    return;
  }
  if (!alive()) return;
  const sc = (label, v) => `<div class="card kpi"><span class="label">${label}</span><div class="gauge-wrap"><span class="value">${v ?? '—'}</span>${v != null ? gauge(v, 80) : ''}</div></div>`;
  out.innerHTML = `
    ${d.note ? `<div class="info-box" style="margin-bottom:16px">${esc(d.note)} <a href="#/reglages">Réglages</a></div>` : ''}
    <div class="grid g4">${sc('Performance', d.scores.performance)}${sc('SEO', d.scores.seo)}${sc('Accessibilité', d.scores.accessibility)}${sc('Bonnes pratiques', d.scores.bestPractices)}</div>
    <div class="grid g2 mt">
      <div class="card"><div class="card-head"><h2>Mesures</h2><span class="sub">${esc(d.source)}</span></div>${d.metrics.map((m) => `<div class="check"><span class="dot ${m.score >= 0.9 ? 'ok' : m.score >= 0.5 ? 'wa' : 'ko'}">${m.score >= 0.9 ? '✓' : '!'}</span><div style="flex:1;display:flex;justify-content:space-between;gap:10px"><div><div class="t">${esc(m.label)}</div><div class="f">${esc(m.id)}</div></div><b>${esc(m.value ?? '—')}</b></div></div>`).join('')}</div>
      <div class="card"><div class="card-head"><h2>Ce qu'il faut améliorer</h2></div>${d.opportunities.length ? d.opportunities.map((o) => `<div class="check"><span class="dot ko">!</span><div style="flex:1;display:flex;justify-content:space-between;gap:10px"><span class="t">${esc(o.title)}</span>${o.saving ? `<span class="badge warn">-${esc(o.saving)}</span>` : ''}</div></div>`).join('') : '<div class="empty small">Rien d’important. Bravo.</div>'}</div>
    </div>`;
}
