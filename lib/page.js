// Analyse SEO d'une seule page HTML (utilisée par l'audit de site et le vérificateur on-page).
import * as cheerio from 'cheerio';

export const CHECKS = {
  http_error: { sev: 'error', label: 'Page en erreur (4xx/5xx)', fix: "Corrige l'URL ou redirige-la (301) vers une page qui existe." },
  broken_link: { sev: 'error', label: 'Lien interne cassé', fix: 'Remplace le lien par une URL qui fonctionne.' },
  title_missing: { sev: 'error', label: 'Balise title manquante', fix: 'Ajoute un titre unique de 30 à 60 caractères avec le mot-clé principal.' },
  title_duplicate: { sev: 'error', label: 'Title en double', fix: 'Chaque page doit avoir son propre titre.' },
  desc_duplicate: { sev: 'warning', label: 'Meta description en double', fix: 'Écris une description différente pour chaque page.' },
  h1_missing: { sev: 'error', label: 'H1 manquant', fix: 'Ajoute un titre principal H1 qui décrit la page.' },
  mixed_content: { sev: 'error', label: 'Contenu mixte (http sur https)', fix: 'Charge toutes les ressources en https.' },
  noindex: { sev: 'warning', label: 'Page bloquée (noindex)', fix: 'Retire le noindex si la page doit apparaître sur Google.' },
  desc_missing: { sev: 'warning', label: 'Meta description manquante', fix: 'Ajoute un résumé de 120 à 160 caractères qui donne envie de cliquer.' },
  title_long: { sev: 'warning', label: 'Title trop long (> 60 car.)', fix: 'Raccourcis le titre, Google le coupe après ~60 caractères.' },
  title_short: { sev: 'warning', label: 'Title trop court (< 20 car.)', fix: 'Allonge le titre avec le mot-clé et un bénéfice.' },
  desc_long: { sev: 'notice', label: 'Meta description trop longue (> 160 car.)', fix: 'Raccourcis à 160 caractères maximum.' },
  h1_multiple: { sev: 'warning', label: 'Plusieurs H1', fix: 'Garde un seul H1, passe les autres en H2.' },
  thin_content: { sev: 'warning', label: 'Contenu trop court (< 200 mots)', fix: 'Ajoute du texte utile : réponses, détails, exemples.' },
  img_alt: { sev: 'warning', label: 'Images sans texte alternatif', fix: "Décris chaque image dans l'attribut alt." },
  slow: { sev: 'warning', label: 'Réponse lente (> 1,5 s)', fix: 'Active le cache, compresse les images, prends un meilleur hébergeur.' },
  redirect: { sev: 'notice', label: 'URL redirigée', fix: 'Fais pointer tes liens directement vers la destination finale.' },
  canonical_missing: { sev: 'notice', label: 'Balise canonical absente', fix: 'Ajoute <link rel="canonical"> vers l\'URL officielle de la page.' },
  lang_missing: { sev: 'notice', label: 'Langue non déclarée', fix: 'Ajoute lang="fr" sur la balise <html>.' },
  viewport_missing: { sev: 'warning', label: 'Pas de balise viewport (mobile)', fix: 'Ajoute <meta name="viewport" content="width=device-width, initial-scale=1">.' },
  og_missing: { sev: 'notice', label: 'Pas de balises Open Graph', fix: 'Ajoute og:title, og:description et og:image pour les partages.' },
  schema_missing: { sev: 'notice', label: 'Pas de données structurées', fix: 'Ajoute du JSON-LD schema.org (Organization, Product, FAQ…). Les IA s\'en servent.' },
  heavy: { sev: 'notice', label: 'Page HTML lourde (> 1 Mo)', fix: 'Allège le HTML (scripts inline, SVG énormes…).' },
};

export function parsePage(html, pageUrl) {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl);
  const text = $('body').clone().find('script,style,noscript,svg').remove().end().text().replace(/\s+/g, ' ').trim();
  const words = text ? text.split(' ').length : 0;
  const links = [];
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href');
    if (!href || /^(mailto|tel|javascript|#)/i.test(href)) return;
    try {
      const u = new URL(href, base);
      u.hash = '';
      links.push({ url: u.toString(), internal: u.hostname.replace(/^www\./, '') === base.hostname.replace(/^www\./, ''), nofollow: /nofollow/i.test($(a).attr('rel') || '') });
    } catch {}
  });
  const imgs = $('img');
  const schemaTypes = [];
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const j = JSON.parse($(s).contents().text());
      const walk = (o) => {
        if (Array.isArray(o)) return o.forEach(walk);
        if (o && typeof o === 'object') {
          if (o['@type']) [].concat(o['@type']).forEach((t) => schemaTypes.push(t));
          if (o['@graph']) walk(o['@graph']);
        }
      };
      walk(j);
    } catch {}
  });
  const headings = [];
  $('h1,h2,h3').each((_, h) => headings.push({ tag: h.tagName.toLowerCase(), text: $(h).text().replace(/\s+/g, ' ').trim().slice(0, 140) }));
  const mixed = base.protocol === 'https:' && $('img[src^="http:"],script[src^="http:"],link[href^="http:"][rel="stylesheet"],iframe[src^="http:"]').length > 0;

  return {
    title: $('title').first().text().trim(),
    description: ($('meta[name="description"]').attr('content') || '').trim(),
    h1: $('h1').map((_, h) => $(h).text().replace(/\s+/g, ' ').trim()).get(),
    headings,
    canonical: $('link[rel="canonical"]').attr('href') || null,
    robots: ($('meta[name="robots"]').attr('content') || '').toLowerCase(),
    lang: $('html').attr('lang') || null,
    viewport: $('meta[name="viewport"]').length > 0,
    og: $('meta[property^="og:"]').length > 0,
    schemaTypes: [...new Set(schemaTypes)],
    imgCount: imgs.length,
    imgNoAlt: imgs.filter((_, i) => !($(i).attr('alt') || '').trim()).length,
    words,
    text: text.slice(0, 20000),
    links,
    mixed,
  };
}

// Problèmes propres à la page (les doublons et liens cassés sont calculés au niveau du site).
export function pageIssues(p) {
  const out = [];
  if (p.status >= 400 || p.status === 0) return ['http_error'];
  if (p.redirected) out.push('redirect');
  if (!p.title) out.push('title_missing');
  else if (p.title.length > 60) out.push('title_long');
  else if (p.title.length < 20) out.push('title_short');
  if (!p.description) out.push('desc_missing');
  else if (p.description.length > 160) out.push('desc_long');
  if (!p.h1.length) out.push('h1_missing');
  else if (p.h1.length > 1) out.push('h1_multiple');
  if (p.words < 200) out.push('thin_content');
  if (p.imgNoAlt > 0) out.push('img_alt');
  if (p.ms > 1500) out.push('slow');
  if (/noindex/.test(p.robots)) out.push('noindex');
  if (!p.canonical) out.push('canonical_missing');
  if (!p.lang) out.push('lang_missing');
  if (!p.viewport) out.push('viewport_missing');
  if (!p.og) out.push('og_missing');
  if (!p.schemaTypes.length) out.push('schema_missing');
  if (p.mixed) out.push('mixed_content');
  if (p.bytes > 1_000_000) out.push('heavy');
  return out;
}
