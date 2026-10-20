// Routeur et coquille de l'application.
import { $, $$, api } from './ui.js';
import * as dashboard from './pages/dashboard.js';
import * as domain from './pages/domain.js';
import * as keywords from './pages/keywords.js';
import * as tracking from './pages/tracking.js';
import * as audit from './pages/audit.js';
import * as onpage from './pages/onpage.js';
import * as ai from './pages/ai.js';
import * as settings from './pages/settings.js';

const ROUTES = {
  '': dashboard.render,
  domaine: domain.renderOverview,
  comparer: domain.renderCompare,
  'mots-cles': keywords.renderIdeas,
  'mot-cle': keywords.renderOverview,
  positions: tracking.render,
  audit: audit.render,
  'on-page': onpage.renderOnPage,
  vitesse: onpage.renderSpeed,
  ia: ai.renderVisibility,
  'ia-pret': ai.renderReadiness,
  reglages: settings.render,
};

export const state = { status: null };

export function go(path) {
  location.hash = '#/' + path;
}

async function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, query = ''] = raw.split('?');
  const [name, ...rest] = pathPart.split('/');
  const params = Object.fromEntries(new URLSearchParams(query));
  const view = $('#view');
  $$('#sidebar a[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  $('#sidebar').classList.remove('open');
  const fn = ROUTES[name];
  view.innerHTML = '';
  window.scrollTo(0, 0);
  if (!fn) {
    view.innerHTML = `<div class="empty"><h2>Page introuvable</h2><p><a class="btn btn-primary" href="#/">Retour au tableau de bord</a></p></div>`;
    return;
  }
  const token = (route.token = (route.token || 0) + 1);
  try {
    await fn(view, params, rest, () => token === route.token);
  } catch (e) {
    if (token === route.token) view.innerHTML = `<div class="error-box">${e.message}</div>`;
  }
}

export async function refreshStatus() {
  state.status = await api('/api/status').catch(() => null);
  if (state.status) $('#engineChip').textContent = `Positions : ${state.status.serpEngine}`;
  return state.status;
}

// Recherche globale : domaine -> vue d'ensemble, sinon -> mots-clés.
$('#globalSearch').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = e.target.q.value.trim();
  if (!q) return;
  if (/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/.*)?$/i.test(q) && !/\s/.test(q)) go(`domaine?d=${encodeURIComponent(q)}`);
  else go(`mots-cles?q=${encodeURIComponent(q)}`);
  e.target.q.value = '';
  e.target.q.blur();
});

$('#themeBtn').addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try {
    localStorage.setItem('or-theme', root.dataset.theme);
  } catch {}
  route();
});
$('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
document.addEventListener('click', (e) => {
  const sb = $('#sidebar');
  if (sb.classList.contains('open') && !sb.contains(e.target) && !$('#menuBtn').contains(e.target)) sb.classList.remove('open');
});

window.addEventListener('hashchange', route);
refreshStatus().then(route);
