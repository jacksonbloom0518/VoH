import { load } from 'cheerio';
import crypto from 'crypto';

const FEATURE_PATTERNS = {
  apply: /\bapply\b|\bapplication\b/i,
  eligibility: /\beligibility\b|\bwho can apply\b/i,
  deadline: /\bdeadline\b|\bclosing date\b|\bdue date\b/i,
  award: /\baward\b|\bceiling\b|\bfunding (?:amount|level)\b/i,
  cfda: /\bCFDA\b|\bALN\b/i,
  opportunityNumber: /\b(opportunity|solicitation|announcement)\s+(number|no\.?)/i,
  forms: /\bapplication (?:package|forms)\b|\bdownload (?:the )?forms\b/i,
};

const TOPIC_KEYWORDS = [
  'human trafficking',
  'sex trafficking',
  'victim services',
  'survivor services',
  'domestic violence',
  'sexual assault',
  'women',
  'shelter',
  'housing',
  'rehousing',
  'legal aid',
  'case management',
  'mental health',
  'behavioral health',
  'workforce',
  'nonprofit capacity',
  'community services',
];

const BLOCKLIST_SEGMENTS = ['news', 'press', 'blog', 'story', 'media', 'opinion', 'insights'];

const ALLOWED_DOMAIN_SUFFIXES = ['.gov', '.mil', '.us'];
const TRUSTED_HOSTS = new Set([
  'coj.net',
  'jacksonville.gov',
  'floridahealth.gov',
  'myflfamilies.com',
  'dcf.fl.gov',
  'ojp.gov',
  'hud.gov',
  'hhs.gov',
]);

const MIN_FEATURE_MATCHES = 2;

export function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function normalizeKey(title = '', agency = '', deadline = '') {
  return `${normalizeText(title).toLowerCase()}|${normalizeText(agency).toLowerCase()}|${(deadline || '').toLowerCase()}`;
}

export function hasBlocklistedSignal(url = '', title = '', summary = '') {
  const haystack = `${url} ${title} ${summary}`.toLowerCase();
  return BLOCKLIST_SEGMENTS.some((segment) => haystack.includes(segment));
}

export function isAllowedDomain(hostname = '') {
  if (!hostname) return false;
  const lower = hostname.toLowerCase();
  if (TRUSTED_HOSTS.has(lower)) return true;
  return ALLOWED_DOMAIN_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

export function detectTopicHits(text = '') {
  const haystack = text.toLowerCase();
  const hits = [];
  for (const keyword of TOPIC_KEYWORDS) {
    if (haystack.includes(keyword) && !hits.includes(keyword)) {
      hits.push(keyword);
    }
  }
  return hits;
}

export function getGrantFeatureHits(text = '') {
  const hits = [];
  for (const [name, pattern] of Object.entries(FEATURE_PATTERNS)) {
    if (pattern.test(text)) {
      hits.push(name);
    }
  }
  return hits;
}

export function parseDeadline(text = '') {
  const deadlineRegex = /(deadline|due|closing date)[:\s]+([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/i;
  const match = text.match(deadlineRegex);
  if (!match) return '';
  const raw = match[2];
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return '';
  return new Date(parsed).toISOString().split('T')[0];
}

export function extractAwardAmount(text = '') {
  const amountRegex = /\$\s?([\d,.]+)/;
  const segment = text.match(amountRegex);
  if (!segment) return '';
  const numeric = Number(segment[1].replace(/,/g, ''));
  if (Number.isNaN(numeric)) return '';
  return numeric.toString();
}

export function computeDomainTrust(hostname = '') {
  if (!hostname) return 0;
  const lower = hostname.toLowerCase();
  if (lower.endsWith('.gov')) return 1;
  if (lower.endsWith('.us') || lower.endsWith('.mil')) return 0.9;
  if (TRUSTED_HOSTS.has(lower)) return 0.8;
  return 0.5;
}

export function computeDeadlineScore(deadline) {
  if (!deadline) return 0.3;
  const now = new Date();
  const due = new Date(deadline);
  const diffDays = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (Number.isNaN(diffDays)) return 0.3;
  if (diffDays <= 0) return 0.2;
  if (diffDays >= 180) return 0.4;
  return Math.max(0.2, 1 - diffDays / 180);
}

export function scoreOpportunity({ topicHits = [], domainTrust = 0, deadline }) {
  const topicScore = Math.min(1, topicHits.length / 3);
  const deadlineScore = computeDeadlineScore(deadline);
  const relevance = topicScore * 0.6 + domainTrust * 0.2 + deadlineScore * 0.2;
  return Number(relevance.toFixed(2));
}

export function extractAgency($, hostname, text) {
  const ogSite = $('meta[property="og:site_name"]').attr('content');
  if (ogSite) return normalizeText(ogSite);
  const agencyMeta = $('meta[name="agency"], meta[name="Organization"]').attr('content');
  if (agencyMeta) return normalizeText(agencyMeta);
  const heading = $('h2:contains("Agency"), h3:contains("Agency")').next().text();
  if (heading) return normalizeText(heading);
  const match = text.match(/Agency:\s*([A-Za-z0-9 ,&.'-]+)/i);
  if (match) return normalizeText(match[1]);
  return hostname;
}

export function splitLocation(locationHint = '') {
  if (!locationHint) return { city: '', state: '' };
  const parts = locationHint.split(',');
  if (parts.length >= 2) {
    return {
      city: normalizeText(parts[0]),
      state: normalizeText(parts[1]),
    };
  }
  return { city: normalizeText(locationHint), state: '' };
}

export function createStableId(url) {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);
}

export function analyzeGrantPage({ url, html, snippet = '', locationHint = '' }) {
  if (!url || !html) return { isGrant: false };
  const hostname = new URL(url).hostname.toLowerCase();
  if (!isAllowedDomain(hostname)) return { isGrant: false };

  const $ = load(html);
  const title = normalizeText($('meta[property="og:title"]').attr('content') || $('title').text() || snippet);
  const description = normalizeText(snippet || $('meta[name="description"]').attr('content') || $('p').first().text());
  const text = normalizeText($('body').text());

  if (!title || hasBlocklistedSignal(url, title, description)) {
    return { isGrant: false };
  }

  const topic_hits = detectTopicHits(text);
  if (topic_hits.length === 0) {
    return { isGrant: false };
  }

  const featureHits = getGrantFeatureHits(text);
  if (featureHits.length < MIN_FEATURE_MATCHES) {
    return { isGrant: false };
  }

  const response_deadline = parseDeadline(text);
  const award_amount = extractAwardAmount(text);
  const agency = extractAgency($, hostname, text);
  const { city, state } = splitLocation(locationHint);
  const domainTrust = computeDomainTrust(hostname);
  const relevance_score = scoreOpportunity({ topicHits: topic_hits, domainTrust, deadline: response_deadline });

  // CRITICAL: Ensure source is NEVER empty (NOT NULL constraint in DB)
  const source = hostname && hostname.trim() !== '' ? hostname : 'web-scraped';

  const record = {
    id: createStableId(url),
    source: source, // Use validated source
    source_record_url: url,
    title: title || description || 'Untitled Opportunity',
    summary: description,
    agency,
    posted_date: '',
    response_deadline,
    naics: '',
    psc: '',
    set_aside: '',
    pop_city: city,
    pop_state: state,
    pop_zip: '',
    pop_country: city || state ? 'US' : '',
    poc_name: '',
    poc_email: '',
    poc_phone: '',
    award_number: '',
    award_amount,
    award_date: '',
    award_awardee: '',
    relevance_score,
    topic_hits: topic_hits.join(';'),
    created_at: new Date().toISOString(),
    raw_data: JSON.stringify({
      url,
      title,
      description,
      featureHits,
      topic_hits,
      response_deadline,
      award_amount,
      agency,
    }),
  };

  // Final validation: ensure required NOT NULL fields are present
  if (!record.source || record.source === '') {
    console.error('⚠️  CRITICAL: analyzeGrantPage created record with empty source!', { url, hostname, record });
    record.source = 'web-scraped'; // Emergency fallback
  }
  if (!record.title || record.title === '') {
    console.error('⚠️  CRITICAL: analyzeGrantPage created record with empty title!', { url, record });
    record.title = 'Untitled Opportunity'; // Emergency fallback
  }

  return {
    ...record,
    isGrant: true,
  };
}

export function selectTopOpportunities(opportunities = [], limit = 2) {
  const sorted = [...opportunities].sort((a, b) => {
    if (a.response_deadline && b.response_deadline) {
      const diff = new Date(a.response_deadline) - new Date(b.response_deadline);
      if (diff !== 0) return diff;
    } else if (a.response_deadline) {
      return -1;
    } else if (b.response_deadline) {
      return 1;
    }
    return b.relevance_score - a.relevance_score;
  });
  return sorted.slice(0, limit);
}

export function shouldSkipOpportunity(opportunity, { urlSet, keySet }) {
  if (!opportunity) return true;
  if (opportunity.source_record_url && urlSet.has(opportunity.source_record_url)) return true;
  const key = normalizeKey(opportunity.title, opportunity.agency, opportunity.response_deadline);
  if (keySet.has(key)) return true;
  return false;
}

export function isPdfContent(url = '', contentType = '') {
  const lowered = (contentType || '').toLowerCase();
  if (lowered.includes('application/pdf')) return true;
  return /\.pdf(?:$|\?)/i.test(url);
}
