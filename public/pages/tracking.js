import { api, esc, loader, errorBox, dateTime, dayLabel, favicon, toast, downloadCsv, $$ } from '../ui.js';
import { lineChart, seriesColor, barList } from '../charts.js';
import { go, state } from '../app.js';

const fmtPct = (v) => (v == null ? '—' : `${String(v).replace('.', ',')} %`);

export async function render(view, params, rest, alive) {
  if (rest[0]) return renderProject(view, rest[0], alive);
  view.innerHTML = `
    <div class="page-head"><div><div class="crumb">Mots-clés</div><h1>Suivi de positions</h1><p>Ta place sur ${esc(state.status?.serpEngine || 'les moteurs')} pour chaque mot-clé, vérifiée chaque jour tant que l'app est ouverte.</p></div></div>
    <div class="grid g3">
      <div class="card span2"><div class="card-head"><h2>Tes projets</h2></div><div id="list">${loader()}</div></div>
      <form class="card" id="newForm">
        <h2 style="margin-bottom:14px">Nouveau projet</h2>
        <div class="grid" style="gap:12px">
          <label class="field">Ton site<input class="input" name="domain" placeholder="monsite.fr" required></label>
          <label class="field">Mots-clés <small>un par ligne</small><textarea class="input" name="keywords" placeholder="coiffeur paris 11&#10;coupe homme paris" required></textarea></label>
          <label class="field">Concurrents <small>optionnel, un par ligne (max 5)</small><textarea class="input" name="competitors" style="min-height:70px" placeholder="concurrent.fr"></textarea></label>
          <button class="btn btn-primary">Créer et vérifier</button>
        </div>
      </form>
    </div>`;
  const pending = sessionStorage.getItem('or-pending-kw');
  if (pending) {
    view.querySelector('[name=keywords]').value = JSON.parse(pending).join('\n');
    sessionStorage.removeItem('or-pending-kw');
  }
  if (params.new) view.querySelector('[name=domain]').focus();

  view.querySelector('#newForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Création…';
    try {
      const p = await api('/api/projects', {
        domain: f.domain.value,
        keywords: f.keywords.value.split('\n'),
        competitors: f.competitors.value.split('\n'),
      });
      api(`/api/projects/${p.id}/check`, {}).catch(() => {});
      go(`positions/${p.id}?checking=1`);
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
      btn.textContent = 'Créer et vérifier';
    }
  });

  const projects = await api('/api/projects');
  if (!alive()) return;
  view.querySelector('#list').innerHTML = projects.length
    ? `<table class="tbl"><thead><tr><th>Site</th><th class="num">Mots-clés</th><th class="num">Visibilité</th><th class="num">Top 10</th><th>Dernière vérif.</th></tr></thead><tbody>${projects
        .map((p) => {
          const last = p.history[p.history.length - 1];
          const top10 = last ? Object.values(last.ranks).filter((r) => r.pos && r.pos <= 10).length : null;
          return `<tr><td><a href="#/positions/${p.id}"><img src="${favicon(p.domain)}" width="16" height="16" style="vertical-align:-3px;margin-right:8px" alt="">${esc(p.domain)}</a></td><td class="num">${p.keywords.length}</td><td class="num">${fmtPct(last?.visibility)}</td><td class="num">${top10 ?? '—'}</td><td>${dateTime(p.lastCheck)}</td></tr>`;
        })
        .join('')}</tbody></table>`
    : '<div class="empty small">Aucun projet pour l’instant. Remplis le formulaire à droite.</div>';
}

async function renderProject(view, id, alive) {
  view.innerHTML = loader();
  let p = await api(`/api/projects/${id}`).catch(() => null);
  if (!alive()) return;
  if (!p) {
    view.innerHTML = errorBox('Projet introuvable');
    return;
  }
  const draw = () => {
    const h = p.history;
    const last = h[h.length - 1];
    const prev = h[h.length - 2];
    const positions = last ? p.keywords.map((k) => last.ranks[k]?.pos).filter(Boolean) : [];
    const avg = positions.length ? (positions.reduce((a, b) => a + b, 0) / positions.length).toFixed(1).replace('.', ',') : '—';
    const bucket = (lo, hi) => (last ? p.keywords.filter((k) => { const x = last.ranks[k]?.pos; return x && x >= lo && x <= hi; }).length : 0);
    const delta = last && prev ? Math.round((last.visibility - prev.visibility) * 10) / 10 : null;

    view.innerHTML = `
      <div class="page-head">
        <div><div class="crumb"><a href="#/positions" style="text-decoration:none">← Suivi de positions</a></div>
          <h1><img src="${favicon(p.domain)}" width="24" height="24" style="vertical-align:-3px;margin-right:10px" alt="">${esc(p.domain)}</h1>
          <p>${p.keywords.length} mots-clés · ${last ? `moteur ${esc(last.engine)} · vérifié ${dateTime(last.date)}` : 'pas encore vérifié'}</p></div>
        <div class="chips"><button class="btn btn-primary" id="check">Vérifier maintenant</button><button class="btn" id="edit">Modifier</button><button class="btn" id="csv">CSV</button><button class="btn" id="del">Supprimer</button></div>
      </div>
      ${!last ? `<div class="info-box" style="margin-bottom:16px" id="checkingBox">Vérification en cours… ça prend ~5 secondes par mot-clé. La page se met à jour toute seule.</div>` : ''}
      <div class="grid g4">
        <div class="card kpi"><span class="label">Visibilité</span><span class="value">${fmtPct(last?.visibility)}</span><span class="hint">${delta != null ? `<span class="${delta >= 0 ? 'delta-up' : 'delta-down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toString().replace('.', ',')} pt</span> vs vérif. précédente` : 'part des clics possibles que tu captes'}</span></div>
        <div class="card kpi"><span class="label">Position moyenne</span><span class="value">${avg}</span><span class="hint">sur les mots-clés classés</span></div>
        <div class="card kpi"><span class="label">Dans le top 3</span><span class="value">${bucket(1, 3)}</span><span class="hint">top 10 : ${bucket(1, 10)}</span></div>
        <div class="card kpi"><span class="label">Non classés</span><span class="value">${last ? p.keywords.length - positions.length : '—'}</span><span class="hint">hors du top ${last?.engine === 'Google' ? 50 : 30}</span></div>
      </div>
      <div class="grid g3 mt">
        <div class="card span2"><div class="card-head"><h2>Visibilité dans le temps</h2>${h.length < 2 ? '<span class="sub">la courbe se dessine dès la 2e vérification (demain)</span>' : ''}</div><div class="legend" style="margin-bottom:8px"><span><i style="background:${seriesColor(0)}"></i>${esc(p.domain)}</span>${p.competitors.map((c, i) => `<span><i style="background:${seriesColor(i + 1)}"></i>${esc(c)}</span>`).join('')}</div><div id="cVis"></div></div>
        <div class="card"><div class="card-head"><h2>Répartition</h2></div><div id="cDist"></div></div>
      </div>
      <div class="card mt"><div class="card-head"><h2>Positions par mot-clé</h2></div><div id="tbl"></div></div>
      <form class="card mt" id="editForm" hidden>
        <h2 style="margin-bottom:12px">Modifier le projet</h2>
        <div class="grid g2"><label class="field">Mots-clés <small>un par ligne</small><textarea class="input" name="keywords" style="min-height:180px">${esc(p.keywords.join('\n'))}</textarea></label>
        <label class="field">Concurrents <small>un par ligne</small><textarea class="input" name="competitors" style="min-height:180px">${esc(p.competitors.join('\n'))}</textarea></label></div>
        <button class="btn btn-primary mt">Enregistrer</button>
      </form>`;

    lineChart(view.querySelector('#cVis'), [
      { name: p.domain, points: h.map((s) => ({ label: dayLabel(s.date), value: s.visibility })) },
      ...p.competitors.map((c) => ({ name: c, points: h.map((s) => ({ label: dayLabel(s.date), value: s.compVisibility?.[c] ?? null })) })),
    ], { format: (v) => `${v} %` });
    view.querySelector('#cDist').innerHTML = barList([
      { label: 'Top 3', value: bucket(1, 3), color: 'var(--good)' },
      { label: 'Positions 4-10', value: bucket(4, 10), color: 'var(--s1)' },
      { label: 'Positions 11-20', value: bucket(11, 20), color: 'var(--s4)' },
      { label: 'Positions 21-50', value: bucket(21, 50), color: 'var(--s2)' },
      { label: 'Non classé', value: last ? p.keywords.length - positions.length : 0, color: 'var(--muted)' },
    ], { max: p.keywords.length || 1 });

    const rows = p.keywords.map((k) => {
      const cur = last?.ranks[k]?.pos ?? null;
      const old = prev?.ranks[k]?.pos ?? null;
      return { k, cur, old, url: last?.ranks[k]?.url, comps: p.competitors.map((c) => last?.comp?.[c]?.[k]?.pos ?? null) };
    }).sort((a, b) => (a.cur ?? 999) - (b.cur ?? 999));
    const change = (r) => {
      if (r.cur == null && r.old == null) return '<span class="muted">—</span>';
      if (r.old == null) return '<span class="badge accent">Nouveau</span>';
      if (r.cur == null) return '<span class="delta-down">Perdu</span>';
      const d = r.old - r.cur;
      return d === 0 ? '<span class="muted">=</span>' : `<span class="${d > 0 ? 'delta-up' : 'delta-down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}</span>`;
    };
    view.querySelector('#tbl').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mot-clé</th><th class="num">Position</th><th>Évolution</th><th>URL classée</th>${p.competitors.map((c) => `<th class="num">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows
      .map((r) => `<tr><td><a href="#/mot-cle?q=${encodeURIComponent(r.k)}">${esc(r.k)}</a></td><td class="num"><b>${r.cur ?? '—'}</b></td><td>${change(r)}</td><td class="url-cell">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url.replace(/^https?:\/\/(www\.)?/, ''))}</a>` : '<span class="muted">—</span>'}</td>${r.comps.map((c) => `<td class="num">${c ?? '—'}</td>`).join('')}</tr>`)
      .join('')}</tbody></table></div>`;

    view.querySelector('#check').addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = `Vérification de ${p.keywords.length} mots-clés…`;
      try {
        p = await api(`/api/projects/${p.id}/check`, {});
        toast('Positions à jour');
      } catch (err) {
        toast(err.message);
      }
      if (alive()) draw();
    });
    view.querySelector('#edit').addEventListener('click', () => {
      const f = view.querySelector('#editForm');
      f.hidden = !f.hidden;
      f.scrollIntoView({ behavior: 'smooth' });
    });
    view.querySelector('#editForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      p = await api(`/api/projects/${p.id}`, { keywords: e.target.keywords.value.split('\n'), competitors: e.target.competitors.value.split('\n') }, 'PATCH');
      toast('Projet mis à jour. Clique « Vérifier maintenant ».');
      draw();
    });
    view.querySelector('#csv').addEventListener('click', () => downloadCsv(`positions-${p.domain}.csv`, rows.map((r) => ({ mot_cle: r.k, position: r.cur ?? '', precedente: r.old ?? '', url: r.url ?? '', ...Object.fromEntries(p.competitors.map((c, i) => [c, r.comps[i] ?? ''])) }))));
    view.querySelector('#del').addEventListener('click', async () => {
      if (!confirm(`Supprimer le projet ${p.domain} et tout son historique ?`)) return;
      await api(`/api/projects/${p.id}`, null, 'DELETE');
      go('positions');
    });
  };
  draw();

  // Premier passage : on attend la fin de la vérification lancée à la création.
  if (!p.history.length) {
    const poll = setInterval(async () => {
      if (!alive()) return clearInterval(poll);
      const fresh = await api(`/api/projects/${id}`).catch(() => null);
      if (fresh?.history.length) {
        clearInterval(poll);
        p = fresh;
        draw();
      }
    }, 4000);
  }
}
