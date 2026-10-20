# Contribuer à OpenRank

Merci ! Quelques règles simples :

1. **Pas de build, pas de framework.** Le front est en HTML/CSS/JS natif, le back en Node.js avec une seule dépendance (`cheerio`). Garde ça comme ça.
2. **Gratuit d'abord.** Toute fonctionnalité doit marcher sans clé. Une clé payante peut améliorer la précision, jamais être obligatoire.
3. **Honnêteté sur les données.** Si un chiffre est estimé, l'interface le dit.
4. **Français simple.** L'interface s'adresse à des débutants : pas de jargon sans explication.

## Lancer en développement

```bash
npm install
npm run dev
```

## Idées de contributions

- Nouvelles sources gratuites (backlinks via Common Crawl, volumes via Google Trends…)
- Nouveaux contrôles d'audit (hreflang, chaînes de redirection, pages orphelines)
- Export PDF des rapports
- Traduction de l'interface
