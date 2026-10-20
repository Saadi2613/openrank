// Vue d'ensemble d'un domaine : trafic, rang, sources, pays, mots-clés, autorité, âge.
import { config } from './config.js';
import { fetchJson, cleanDomain } from './http.js';

const cache = new Map();
const TTL = 6 * 3600 * 1000;

async function similarWeb(domain) {
  const j = await fetchJson(`https://data.similarweb.com/api/v1/data?domain=${encodeURIComponent(domain)}`, {
    timeout: 10000,
    headers: { 'Content-Type': 'application/json', 'X-Extension-Version': '6.12.24' },
  });
  if (!j) return null;
  const months = Object.entries(j.EstimatedMonthlyVisits || {}).sort(([a], [b]) => a.localeCompare(b));
  const visits = months.length ? months[months.length - 1][1] : 0;
  const e = j.Engagments || {};
  const aiRoot = j.AiTrafficDetails;
  const ai = aiRoot?.Traffic;
  // SimilarWeb renvoie parfois « � » à la place des accents : en français c'est presque toujours « é ».
  const fix = (t) => (t ? t.replace(/\uFFFD/g, 'é') : null);
  return {
    title: fix(j.Title),
    description: fix(j.Description),
    category: j.CategoryRank?.Category || j.Category || null,
    categoryRank: Number(j.CategoryRank?.Rank) || null,
    months: months.map(([date, value]) => ({ date, value })),
    visits,
    globalRank: j.GlobalRank?.Rank || null,
    countryRank: j.CountryRank?.Rank ? { rank: j.CountryRank.Rank, code: j.CountryRank.CountryCode } : null,
    sources: j.TrafficSources || null,
    countries: (j.TopCountryShares || []).slice(0, 6).map((c) => ({ code: c.CountryCode, share: c.Value })),
    engagement: {
      bounce: Number(e.BounceRate) || null,
      pagesPerVisit: Number(e.PagePerVisit) || null,
      duration: Number(e.TimeOnSite) || null,
    },
    keywords: (j.TopKeywords || []).map((k) => ({ keyword: k.Name, volume: k.Volume, cpc: k.Cpc, value: k.EstimatedValue })),
    competitors: (j.Competitors?.TopSimilarityCompetitors || []).map((c) => c.Domain || c).filter(Boolean),
    screenshot: j.LargeScreenshot || null,
    ai: ai
      ? {
          visits: aiRoot.TotalVisits || 0,
          share: aiRoot.ReferralTraffic || 0,
          bots: (ai.Distribution?.Chatbots || ai.Split || []).map((b) => ({ name: b.Name, value: b.Value ?? null })),
          history: (ai.Distribution?.Chart || []).map((b) => ({
            name: b.Name,
            points: (b.History || []).map((h) => ({ date: h.Date, value: h.Value })).sort((a, b2) => a.date.localeCompare(b2.date)),
          })),
        }
      : null,
  };
}

async function tranco(domain) {
  const j = await fetchJson(`https://tranco-list.eu/api/ranks/domain/${encodeURIComponent(domain)}`, { timeout: 8000 });
  const ranks = (j?.ranks || []).filter((r) => r.rank).sort((a, b) => a.date.localeCompare(b.date));
  return ranks.length ? ranks : null;
}

async function firstSeen(domain) {
  const j = await fetchJson(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}&limit=1&output=json&fl=timestamp`, { timeout: 8000 });
  const ts = j?.[1]?.[0];
  return ts ? `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}` : null;
}

async function openPageRank(domain) {
  if (!config.keys.openpagerank) return null;
  const j = await fetchJson(`https://openpagerank.com/api/v1.0/getPageRank?domains[]=${encodeURIComponent(domain)}`, {
    headers: { 'API-OPR': config.keys.openpagerank },
  });
  const r = j?.response?.[0];
  return r?.page_rank_decimal != null ? Number(r.page_rank_decimal) : null;
}

// Score d'autorité 0-100. Basé sur le rang mondial (plus il est petit, plus le site est fort).
// Si Open PageRank est configuré, on fait la moyenne des deux.
export function authorityScore(rank, opr) {
  let score = null;
  if (rank) score = Math.max(1, Math.min(100, Math.round(100 - 12.5 * Math.log10(rank))));
  if (opr != null) {
    const s2 = Math.round(opr * 10);
    score = score == null ? s2 : Math.round((score + s2) / 2);
  }
  return score;
}

// Visites estimées depuis le rang Tranco, quand SimilarWeb n'a rien (petits sites).
function visitsFromRank(rank) {
  return Math.round(4.2e10 * Math.pow(rank, -1.12));
}

export async function domainOverview(input) {
  const domain = cleanDomain(input);
  if (!domain) throw new Error('Domaine invalide');
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const [sw, tr, seen, opr] = await Promise.all([similarWeb(domain), tranco(domain), firstSeen(domain), openPageRank(domain)]);
  const trancoRank = tr ? tr[tr.length - 1].rank : null;
  const rank = sw?.globalRank || trancoRank;
  let visits = sw?.visits || 0;
  let visitsSource = visits ? 'SimilarWeb' : null;
  if (!visits && trancoRank) {
    visits = visitsFromRank(trancoRank);
    visitsSource = 'Estimation Tranco';
  }
  const organicShare = sw?.sources?.SearchOrganic ?? null;
  const data = {
    domain,
    fetchedAt: new Date().toISOString(),
    title: sw?.title || null,
    description: sw?.description || null,
    category: sw?.category || null,
    categoryRank: sw?.categoryRank || null,
    authority: authorityScore(rank, opr),
    globalRank: rank || null,
    countryRank: sw?.countryRank || null,
    trancoRank,
    trancoSeries: tr ? tr.slice(-30).map((r) => ({ date: r.date, value: r.rank })) : [],
    visits,
    visitsSource,
    organicVisits: organicShare != null ? Math.round(visits * organicShare) : null,
    paidVisits: sw?.sources?.SearchPaid != null ? Math.round(visits * sw.sources.SearchPaid) : null,
    months: sw?.months || [],
    sources: sw?.sources || null,
    countries: sw?.countries || [],
    engagement: sw?.engagement || null,
    keywords: sw?.keywords || [],
    competitors: sw?.competitors || [],
    screenshot: sw?.screenshot || null,
    ai: sw?.ai || null,
    firstSeen: seen,
    found: !!(visits || rank),
  };
  cache.set(domain, { at: Date.now(), data });
  return data;
}
