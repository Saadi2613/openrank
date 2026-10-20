// Charge le fichier .env (sans dépendance) et expose les clés optionnelles.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnv();

const env = (k) => (process.env[k] || '').trim() || null;

export const config = {
  port: Number(env('PORT') || 4321),
  country: env('DEFAULT_COUNTRY') || 'fr',
  lang: env('DEFAULT_LANG') || 'fr',
  keys: {
    serper: env('SERPER_API_KEY'),
    groq: env('GROQ_API_KEY'),
    openai: env('OPENAI_API_KEY'),
    anthropic: env('ANTHROPIC_API_KEY'),
    google: env('GOOGLE_API_KEY'),
    openpagerank: env('OPENPAGERANK_API_KEY'),
    dataforseoLogin: env('DATAFORSEO_LOGIN'),
    dataforseoPassword: env('DATAFORSEO_PASSWORD'),
  },
};

// Ce que l'interface affiche dans « Réglages » : jamais la valeur, seulement si elle est présente.
export function keyStatus() {
  const k = config.keys;
  return [
    { id: 'serper', name: 'Serper.dev', active: !!k.serper, unlocks: 'Positions Google réelles (sinon : Bing)', url: 'https://serper.dev', free: '2 500 recherches offertes' },
    { id: 'groq', name: 'Groq', active: !!k.groq, unlocks: 'Test de visibilité IA (modèles open source)', url: 'https://console.groq.com/keys', free: 'Gratuit' },
    { id: 'openai', name: 'OpenAI', active: !!k.openai, unlocks: 'Test de visibilité dans ChatGPT', url: 'https://platform.openai.com/api-keys', free: 'Payant (quelques centimes)' },
    { id: 'anthropic', name: 'Anthropic', active: !!k.anthropic, unlocks: 'Test de visibilité dans Claude', url: 'https://console.anthropic.com/settings/keys', free: 'Payant (quelques centimes)' },
    { id: 'google', name: 'Google PageSpeed', active: !!k.google, unlocks: 'Scores Core Web Vitals officiels', url: 'https://developers.google.com/speed/docs/insights/v5/get-started', free: 'Gratuit' },
    { id: 'openpagerank', name: 'Open PageRank', active: !!k.openpagerank, unlocks: "Score d'autorité plus précis", url: 'https://www.domcop.com/openpagerank/', free: 'Gratuit' },
    { id: 'dataforseo', name: 'DataForSEO', active: !!(k.dataforseoLogin && k.dataforseoPassword), unlocks: 'Volumes de recherche exacts + backlinks', url: 'https://dataforseo.com', free: '~0,05 € / 100 mots-clés' },
  ];
}
