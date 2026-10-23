// Protections du mode public : limites par visiteur et blocage des adresses internes.
import dns from 'node:dns/promises';
import net from 'node:net';
import { config } from './config.js';

// Nombre d'appels autorisés par visiteur (adresse IP) et par heure.
const LIMITS = {
  default: 300,
  heavy: 40, // analyse de mot-clé, page, vitesse, préparation IA, positions
  audit: 6,
  aeo: 6,
};
const hits = new Map();

export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

// Renvoie un message d'erreur si la limite est dépassée, sinon null.
export function rateLimit(req, group = 'default') {
  if (!config.publicMode || group === 'none') return null;
  const key = `${clientIp(req)}|${group}`;
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < 3600_000);
  if (list.length >= LIMITS[group]) {
    const wait = Math.ceil((3600_000 - (now - list[0])) / 60_000);
    return `Limite atteinte pour cette version de démo. Réessaie dans ${wait} min, ou installe OpenRank gratuitement chez toi (sans limite).`;
  }
  list.push(now);
  hits.set(key, list);
  return null;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, list] of hits) if (!list.some((t) => now - t < 3600_000)) hits.delete(k);
}, 600_000).unref();

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const low = ip.toLowerCase();
  return low === '::1' || low === '::' || low.startsWith('fc') || low.startsWith('fd') || low.startsWith('fe80') || low.startsWith('::ffff:') && isPrivateIp(low.slice(7));
}

// En mode public, interdit d'analyser des adresses internes (protection du serveur).
export async function assertPublicUrl(url) {
  if (!config.publicMode || !url) return;
  const { hostname, protocol } = new URL(url);
  if (!/^https?:$/.test(protocol)) throw new Error('Adresse non autorisée');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(hostname)) throw new Error('Adresse non autorisée');
  const addrs = await dns.lookup(hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error('Ce site est introuvable');
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error('Adresse non autorisée');
}
