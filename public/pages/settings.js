import { api, esc, toast } from '../ui.js';
import { refreshStatus, state } from '../app.js';

export async function render(view) {
  const s = await refreshStatus();
  const keys = s?.keys || [];
  view.innerHTML = `
    <div class="page-head"><div><div class="crumb">Réglages</div><h1>Clés optionnelles</h1><p>OpenRank marche sans aucune clé. Chaque clé débloque un bonus. Elles restent sur ton ordinateur, dans le fichier <code>.env</code>.</p></div></div>
    <div class="card">
      ${keys.map((k) => `
        <div class="key-row">
          <div><b>${esc(k.name)}</b> ${k.active ? '<span class="badge good">✓ Active</span>' : '<span class="badge">Inactive</span>'} <span class="badge">${esc(k.free)}</span>
            <div class="small" style="color:var(--text-2);margin-top:4px">Débloque : ${esc(k.unlocks)}</div></div>
          <a class="btn btn-sm" href="${esc(k.url)}" target="_blank" rel="noopener">Obtenir la clé ↗</a>
          <form data-id="${k.id}">
            ${k.id === 'dataforseo' ? '<input class="input" name="login" placeholder="Login (e-mail)" autocomplete="off">' : ''}
            <input class="input" name="value" type="password" placeholder="${k.active ? 'Coller une nouvelle clé pour remplacer' : 'Colle ta clé ici'}" autocomplete="off">
            <button class="btn btn-primary btn-sm">Enregistrer</button>
          </form>
        </div>`).join('')}
    </div>
    <div class="info-box mt">Pour retirer une clé : enregistre un champ vide. Ton fichier <code>.env</code> n'est jamais envoyé sur GitHub (il est dans <code>.gitignore</code>).</div>`;
  view.querySelectorAll('form[data-id]').forEach((f) =>
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/settings', { id: f.dataset.id, value: f.elements.namedItem('value').value, login: f.elements.namedItem('login')?.value });
        toast(f.elements.namedItem('value').value ? 'Clé enregistrée' : 'Clé retirée');
        render(view);
      } catch (err) {
        toast(err.message);
      }
    }),
  );
}
