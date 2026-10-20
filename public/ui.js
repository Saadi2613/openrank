// Petits utilitaires d'interface partagés par toutes les pages.
export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function api(path, body, method) {
  const m = method || (body ? 'POST' : 'GET');
  const res = await fetch(path, {
    method: m,
    headers: m !== 'GET' ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({ error: 'Réponse illisible' }));
  if (!res.ok || j?.error) throw new Error(j?.error || `Erreur ${res.status}`);
  return j;
}

const nf = new Intl.NumberFormat('fr-FR');
export function num(n, digits = 0) {
  if (n == null || Number.isNaN(n)) return '—';
  return nf.format(Number(n.toFixed ? n.toFixed(digits) : n));
}
export function compact(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace('.', ',') + ' Md';
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' M';
  if (a >= 1e4) return Math.round(n / 1e3) + ' k';
  if (a >= 1e3) return (n / 1e3).toFixed(1).replace('.', ',') + ' k';
  return nf.format(Math.round(n));
}
export const pct = (v, d = 1) => (v == null ? '—' : `${(v * 100).toFixed(d).replace('.', ',')} %`);
export const date = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const month = (iso) => new Date(iso).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
export const dayLabel = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
export const duration = (s) => (s == null ? '—' : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s`);

export function flag(code) {
  if (!code || code.length !== 2) return '';
  // Image plutôt qu'emoji : les drapeaux emoji ne s'affichent pas sous Windows.
  return `<img src="https://flagcdn.com/20x15/${code.toLowerCase()}.png" width="20" height="15" alt="${code}" style="vertical-align:-1px;border-radius:2px">`;
}
const COUNTRY = new Intl.DisplayNames(['fr'], { type: 'region' });
export const countryName = (code) => {
  try {
    return COUNTRY.of(code.toUpperCase());
  } catch {
    return code;
  }
};

export const favicon = (domain) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;

export const loader = (msg = 'Chargement…') => `<div class="loader"><div class="spin"></div>${esc(msg)}</div>`;
export const errorBox = (e) => `<div class="error-box">${esc(e.message || e)}</div>`;

export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 2600);
}

export function scoreBadge(s) {
  if (s == null) return '<span class="badge">—</span>';
  const c = s >= 80 ? 'good' : s >= 50 ? 'warn' : 'bad';
  return `<span class="badge ${c}">${s}/100</span>`;
}

export function intentBadge(i) {
  return `<span class="badge intent intent-${i.id}" title="${esc(i.label)}">${i.id}</span>`;
}

export function downloadCsv(name, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const csv = [cols.join(';'), ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Tableau triable : cols = [{ key, label, num?, render?(row) }]
export function sortableTable(el, rows, cols, { sort, desc = true, limit = 500 } = {}) {
  let key = sort || cols[0].key;
  let d = desc;
  const draw = () => {
    const sorted = [...rows].sort((a, b) => {
      const va = a[key], vb = b[key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const r = typeof va === 'string' ? va.localeCompare(vb, 'fr') : va - vb;
      return d ? -r : r;
    });
    el.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols
      .map((c) => `<th class="sortable ${c.num ? 'num' : ''}" data-k="${c.key}">${esc(c.label)}${c.key === key ? (d ? ' ↓' : ' ↑') : ''}</th>`)
      .join('')}</tr></thead><tbody>${sorted
      .slice(0, limit)
      .map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.render ? c.render(r) : esc(r[c.key] ?? '—')}</td>`).join('')}</tr>`)
      .join('')}</tbody></table></div>${sorted.length > limit ? `<p class="small muted">${limit} lignes affichées sur ${sorted.length}. Exporte en CSV pour tout voir.</p>` : ''}`;
    $$('th.sortable', el).forEach((th) =>
      th.addEventListener('click', () => {
        if (key === th.dataset.k) d = !d;
        else (key = th.dataset.k), (d = true);
        draw();
      }),
    );
  };
  draw();
}

export const icons = {
  globe: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  key: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6M11 8v6"/></svg>',
  chart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/></svg>',
  wrench: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg>',
  page: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
  bolt: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  ai: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3"/></svg>',
  vs: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
  target: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
};
