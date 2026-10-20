// Graphiques SVG faits maison (aucune librairie) avec infobulle au survol.
const tip = () => document.getElementById('tooltip');
const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)'];
export const seriesColor = (i) => SERIES[i % SERIES.length];

export function showTip(e, html) {
  const t = tip();
  t.innerHTML = html;
  t.hidden = false;
  const x = Math.min(e.clientX + 14, window.innerWidth - t.offsetWidth - 10);
  const y = Math.min(e.clientY + 14, window.innerHeight - t.offsetHeight - 10);
  t.style.left = x + 'px';
  t.style.top = y + 'px';
}
export const hideTip = () => (tip().hidden = true);

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/**
 * Courbe(s). series = [{ name, color?, points: [{ label, value }] }]
 * opts: { height, format, invert (rang : plus petit = mieux), area }
 */
export function lineChart(el, series, opts = {}) {
  const W = 640, H = opts.height || 220, P = { l: 52, r: 16, t: 12, b: 26 };
  const fmt = opts.format || ((v) => v);
  const labels = series[0]?.points.map((p) => p.label) || [];
  const vals = series.flatMap((s) => s.points.map((p) => p.value)).filter((v) => v != null);
  if (!labels.length || !vals.length) {
    el.innerHTML = '<div class="empty small">Pas encore de données.</div>';
    return;
  }
  let min = opts.invert ? Math.max(1, Math.min(...vals)) : 0;
  let max = opts.invert ? Math.max(...vals) : niceMax(Math.max(...vals));
  if (opts.invert) {
    const pad = Math.max(1, (max - min) * 0.15);
    min = Math.max(1, Math.floor(min - pad));
    max = Math.ceil(max + pad);
  }
  if (max === min) max = min + 1;
  const x = (i) => P.l + (labels.length === 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (labels.length - 1));
  const y = (v) => (opts.invert ? P.t + ((v - min) / (max - min)) * (H - P.t - P.b) : H - P.b - ((v - min) / (max - min)) * (H - P.t - P.b));
  const ticks = 4;
  let g = '';
  for (let i = 0; i <= ticks; i++) {
    const v = min + ((max - min) * i) / ticks;
    const yy = y(v);
    g += `<line x1="${P.l}" x2="${W - P.r}" y1="${yy}" y2="${yy}" stroke="var(--grid)" stroke-width="1"/>`;
    g += `<text x="${P.l - 8}" y="${yy + 4}" text-anchor="end">${fmt(Math.round(v))}</text>`;
  }
  const step = Math.ceil(labels.length / 7);
  labels.forEach((l, i) => {
    if (i % step === 0 || i === labels.length - 1) g += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${l}</text>`;
  });
  let paths = '';
  series.forEach((s, si) => {
    const c = s.color || seriesColor(si);
    const pts = s.points.map((p, i) => (p.value == null ? null : [x(i), y(p.value)]));
    let d = '';
    let started = false;
    pts.forEach((p) => {
      if (!p) return (started = false);
      d += `${started ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
      started = true;
    });
    if (opts.area && series.length === 1 && !opts.invert) {
      const valid = pts.filter(Boolean);
      if (valid.length > 1) paths += `<path d="${d}L${valid[valid.length - 1][0]},${H - P.b}L${valid[0][0]},${H - P.b}Z" fill="${c}" opacity=".10"/>`;
    }
    paths += `<path d="${d}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (pts.filter(Boolean).length <= 12) pts.forEach((p) => p && (paths += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${c}" stroke="var(--surface)" stroke-width="2"/>`));
  });
  el.innerHTML = `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img">${g}${paths}<line class="xh" x1="0" x2="0" y1="${P.t}" y2="${H - P.b}" stroke="var(--muted)" stroke-dasharray="3 3" opacity="0"/><rect class="hit" x="${P.l}" y="0" width="${W - P.l - P.r}" height="${H}" fill="transparent"/></svg></div>`;
  const svg = el.querySelector('svg');
  const xh = svg.querySelector('.xh');
  svg.querySelector('.hit').addEventListener('mousemove', (e) => {
    const r = svg.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width) * W;
    let idx = 0, best = Infinity;
    labels.forEach((_, i) => {
      const d = Math.abs(x(i) - mx);
      if (d < best) (best = d), (idx = i);
    });
    xh.setAttribute('x1', x(idx));
    xh.setAttribute('x2', x(idx));
    xh.setAttribute('opacity', '.6');
    const rows = series.map((s, si) => `<div><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${s.color || seriesColor(si)};margin-right:6px"></i>${s.name} : <b style="display:inline">${s.points[idx]?.value == null ? '—' : fmt(s.points[idx].value)}</b></div>`).join('');
    showTip(e, `<b>${labels[idx]}</b>${rows}`);
  });
  svg.querySelector('.hit').addEventListener('mouseleave', () => {
    xh.setAttribute('opacity', '0');
    hideTip();
  });
}

/** Anneau. items = [{ label, value, color? }] */
export function donut(el, items, opts = {}) {
  const total = items.reduce((a, b) => a + (b.value || 0), 0);
  if (!total) {
    el.innerHTML = '<div class="empty small">Pas de données.</div>';
    return;
  }
  const R = 70, r = 46, C = 90;
  let a0 = -Math.PI / 2;
  const arcs = items.map((it, i) => {
    const frac = it.value / total;
    const a1 = a0 + frac * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a, rad) => `${C + rad * Math.cos(a)},${C + rad * Math.sin(a)}`;
    const d = frac >= 0.9999
      ? `M${C},${C - R}A${R},${R} 0 1 1 ${C - 0.01},${C - R}L${C - 0.01},${C - r}A${r},${r} 0 1 0 ${C},${C - r}Z`
      : `M${p(a0, R)}A${R},${R} 0 ${large} 1 ${p(a1, R)}L${p(a1, r)}A${r},${r} 0 ${large} 0 ${p(a0, r)}Z`;
    a0 = a1;
    return `<path d="${d}" fill="${it.color || seriesColor(i)}" stroke="var(--surface)" stroke-width="2" data-i="${i}"/>`;
  });
  const fmt = opts.format || ((v) => `${((v / total) * 100).toFixed(1).replace(".", ",")} %`);
  el.innerHTML = `<div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap"><svg viewBox="0 0 180 180" width="150" height="150">${arcs.join('')}${opts.center ? `<text x="90" y="96" text-anchor="middle" style="font-size:20px;font-weight:800;fill:var(--text)">${opts.center}</text>` : ''}</svg><div class="legend" style="flex-direction:column;gap:6px;flex:1;min-width:150px">${items.map((it, i) => `<div style="display:flex;justify-content:space-between;gap:10px"><span><i style="background:${it.color || seriesColor(i)}"></i>${it.label}</span><b style="color:var(--text);white-space:nowrap">${fmt(it.value)}</b></div>`).join('')}</div></div>`;
  el.querySelectorAll('path').forEach((p) => {
    p.addEventListener('mousemove', (e) => {
      const it = items[p.dataset.i];
      showTip(e, `<b>${it.label}</b>${fmt(it.value)}`);
    });
    p.addEventListener('mouseleave', hideTip);
  });
}

/** Jauge demi-cercle 0-100. */
export function gauge(score, size = 120) {
  const s = Math.max(0, Math.min(100, score ?? 0));
  const color = s >= 80 ? 'var(--good)' : s >= 50 ? 'var(--warn)' : 'var(--bad)';
  const len = Math.PI * 50;
  return `<svg viewBox="0 0 120 70" width="${size}" height="${size * 0.58}" aria-label="Score ${s}/100">
    <path d="M10,60 A50,50 0 0 1 110,60" fill="none" stroke="var(--surface-2)" stroke-width="12" stroke-linecap="round"/>
    <path d="M10,60 A50,50 0 0 1 110,60" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(len * s) / 100} ${len}"/>
  </svg>`;
}

/** Barres horizontales HTML. items = [{ label, value, display? }] */
export function barList(items, { color = 'var(--neon-on)', max } = {}) {
  const m = max || Math.max(...items.map((i) => i.value || 0), 1);
  return `<div style="display:flex;flex-direction:column;gap:10px">${items
    .map(
      (i) => `<div><div style="display:flex;justify-content:space-between;gap:8px;font-size:13px;margin-bottom:4px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i.label}</span><b>${i.display ?? i.value}</b></div><div class="bar-mini"><span style="width:${Math.max(2, ((i.value || 0) / m) * 100)}%;background:${i.color || color}"></span></div></div>`,
    )
    .join('')}</div>`;
}
