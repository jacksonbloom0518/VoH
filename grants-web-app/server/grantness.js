import { load } from 'cheerio';
import crypto from 'crypto';

const FEATURE_PATTERNS = {
  apply: /\bapply\b|\bapplication\b|\bsubmit\b|\bsubmission\b/i,
  eligibility: /\beligibility\b|\beligible\b|\bwho can apply\b|\bqualif(?:y|ied|ications)\b/i,
  deadline: /\bdeadline\b|\bclosing date\b|\bdue date\b|\bsubmission date\b|\bapplication period\b/i,
  award: /\baward\b|\bceiling\b|\bfloor\b|\bfunding (?:amount|level|range)\b|\bgrant (?:amount|size)\b|\bup to \$\d/i,
  cfda: /\bCFDA\b|\bALN\b|\bCF(?:D)?A\s*#?\s*\d+/i,
  opportunityNumber: /\b(opportunity|solicitation|announcement|funding|grant)\s+(number|no\.?|#|id)/i,
  forms: /\bapplication (?:package|forms|materials)\b|\bdownload (?:the )?forms?\b|\bapply online\b|\bapplication portal\b/i,
  contact: /\b(contact|questions|inquiries).*?(?:@|email|phone|call)\b|\bpoint of contact\b/i,
  guidelines: /\bguidelines\b|\brequirements\b|\binstructions\b|\bprogram guide\b/i,
  program: /\bprogram\b|\binitiative\b|\bproject\b/i,
};

const TOPIC_KEYWORDS = [
  'human trafficking',
  'sex trafficking',
  'labor trafficking',
  'victim services',
  'survivor services',
  'victim assistance',
  'domestic violence',
  'sexual assault',
  'sexual violence',
  'intimate partner violence',
  'family violence',
  'gender-based violence',
  'dating violence',
  'women',
  'shelter',
  'housing',
  'rehousing',
  'transitional housing',
  'safe housing',
  'emergency shelter',
  'legal aid',
  'legal services',
  'case management',
  'mental health',
  'behavioral health',
  'trauma',
  'trauma-informed',
  'crisis services',
  'crisis intervention',
  'emergency services',
  'hotline',
  'advocacy',
  'counseling',
  'workforce',
  'nonprofit capacity',
  'community services',
  'social services',
  'vawa', // Violence Against Women Act
  'fvpsa', // Family Violence Prevention Services Act
  'voca', // Victims of Crime Act
  'crime victim',
  'violent crime',
];

const BLOCKLIST_SEGMENTS = ['news', 'press', 'blog', 'story', 'media', 'opinion', 'insights'];

const TRIBAL_BLOCKLIST = [
  'tribal',
  'native american',
  'alaska native',
  'indigenous',
  'indian tribe',
  'federally recognized tribe',
  'tribal government',
  'tribal nation',
];

const GENERIC_TITLE_EXACT_MATCHES = [
  'how to apply',
  'apply for funding',
  'grant programs',
  'funding opportunities',
  'funding opportunity',
  'apply for grants',
  'grant funding',
];

const GENERIC_URL_PATTERNS = [
  '/how-to-apply',
  '/how-to',
  '/funding-opportunities',
  '/grant-programs',
  '/apply',
  '/grants/apply',
  '/opportunities',
];

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

const MIN_FEATURE_MATCHES = 2; // Reduced from 3 to better handle local/state grant sites

export function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function normalizeKey(title = '', agency = '', deadline = '') {
  return `${normalizeText(title).toLowerCase()}|${normalizeText(agency).toLowerCase()}|${(deadline || '').toLowerCase()}`;
}

export function hasBlocklistedSignal(url = '', title = '', summary = '') {
  // Whitelist OVW media URLs (official NOFO PDFs, not news/press)
  if (url && url.includes('justice.gov/ovw/media/')) {
    return false;
  }

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

export function isExpiredDeadline(deadline) {
  if (!deadline) return false;
  try {
    const deadlineDate = new Date(deadline);
    const now = new Date();
    // Set time to start of day for fair comparison
    now.setHours(0, 0, 0, 0);
    deadlineDate.setHours(0, 0, 0, 0);
    return deadlineDate < now;
  } catch {
    return false;
  }
}

export function hasTribalSpecificContent(title = '', summary = '', text = '', url = '') {
  // Whitelist OVW NOFO list pages that contain mixed tribal/non-tribal content
  if (url && url.includes('justice.gov/ovw/open-notices-of-funding-opportunity')) {
    return false; // Don't reject OVW NOFO list page
  }

  // Only check title and summary for tribal-specific indicators (not full body text)
  const haystack = `${title} ${summary}`.toLowerCase();

  // Check if it's explicitly tribal-only
  const tribalOnlyIndicators = [
    'tribal government only',
    'tribal only',
    'only tribal',
    'exclusively tribal',
    'tribal nations only',
    'federally recognized tribes only',
    'for tribal governments',
    'eligible: tribal',
    'eligibility: tribal'
  ];

  if (tribalOnlyIndicators.some((term) => haystack.includes(term))) {
    return true;
  }

  // Check if "tribal" appears but also mentions other eligible entities
  const hasTribalMention = TRIBAL_BLOCKLIST.some((term) => haystack.includes(term));
  if (hasTribalMention) {
    // Check if other entities are also mentioned as eligible
    const hasOtherEntities = /\b(state|local|county|city|municipal|nonprofit|ngo|community|organization|faith-based)\b/i.test(haystack);
    if (hasOtherEntities) {
      return false; // Not tribal-specific if other entities are eligible
    }
    return true; // Tribal-only if only tribal terms are mentioned
  }

  return false;
}

export function isGenericLandingPage(title = '', url = '', text = '') {
  const titleLower = title.toLowerCase().trim();

  // Check for exact generic title matches
  if (GENERIC_TITLE_EXACT_MATCHES.includes(titleLower)) {
    return true;
  }

  // Check for short generic titles (< 40 chars with only generic words)
  if (title.length < 40) {
    const genericWords = ['grant', 'grants', 'funding', 'apply', 'application', 'opportunity', 'opportunities', 'program', 'programs'];
    const words = title.toLowerCase().split(/\s+/);
    const isAllGeneric = words.every(word => genericWords.includes(word) || word.length <= 3);
    if (isAllGeneric && words.length <= 4) {
      return true;
    }
  }

  // Check for generic URL patterns WITHOUT specific identifiers
  const urlLower = url.toLowerCase();
  const hasGenericPattern = GENERIC_URL_PATTERNS.some(pattern => urlLower.includes(pattern));
  const hasSpecificId = /[/-](20\d{2}|FY|RFA|FOA|NOFO|PA|RFP)-/i.test(url) || /\d{6,}/.test(url);

  if (hasGenericPattern && !hasSpecificId) {
    return true;
  }

  // Check if page content is too short - be more lenient for .gov/.fl.us domains
  const hostname = url ? new URL(url).hostname.toLowerCase() : '';
  const isGovSite = hostname.endsWith('.gov') || hostname.endsWith('.fl.us') || hostname.endsWith('.mil');

  if (isGovSite) {
    // Government sites: only reject if very short (< 300 chars)
    if (text.length < 300) {
      return true;
    }
  } else {
    // Non-government sites: reject if < 500 chars (reduced from 1000)
    if (text.length < 500) {
      return true;
    }
  }

  return false;
}

export function hasMinimumSpecificity(response_deadline, award_amount, text = '', url = '') {
  // Must have at least ONE of:
  // 1. Specific deadline date
  if (response_deadline && response_deadline.trim() !== '') {
    return true;
  }

  // 2. Specific award amount
  if (award_amount && award_amount.trim() !== '' && !isNaN(parseFloat(award_amount))) {
    return true;
  }

  // 3. Opportunity/solicitation number in text
  const hasOppNumber = /\b(opportunity|solicitation|announcement|funding|notice)\s+(number|no\.?|#)\s*:?\s*[A-Z0-9-]{5,}/i.test(text);
  const hasFOA = /\b(FOA|RFA|NOFO|PA-|RFP|BAA)-[A-Z0-9-]{3,}/i.test(text);
  const hasFiscalYear = /\bFY\s*20\d{2}\b/i.test(text);

  if (hasOppNumber || hasFOA || hasFiscalYear) {
    return true;
  }

  // 4. Be more lenient for Florida state/local sites and .gov domains
  const hostname = url ? new URL(url).hostname.toLowerCase() : '';
  const isFloridaSite = hostname.includes('florida') || hostname.includes('.fl.') ||
                        hostname.includes('jacksonville') || hostname.includes('coj.net');
  const isGovSite = hostname.endsWith('.gov');

  if (isFloridaSite || isGovSite) {
    // Accept if has ANY of these indicators
    const hasContactInfo = /\b(contact|email|phone).*?[@]|[@].*?\b(gov|edu|org|com)/i.test(text) ||
                           /\d{3}[-.]?\d{3}[-.]?\d{4}/.test(text);
    const hasDownloadLink = /\bdownload\b.*?\b(application|form|pdf|guidelines)/i.test(text);
    const hasApplyLink = /\bapply\b.*?\b(online|here|now|portal)/i.test(text);
    const hasRollingDeadline = /\b(rolling|ongoing|continuous|year-round|until funds)\b/i.test(text);

    if (hasContactInfo || hasDownloadLink || hasApplyLink || hasRollingDeadline) {
      return true;
    }
  }

  return false;
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
    console.log(`❌ Rejected (blocklisted): ${title || url}`);
    return { isGrant: false };
  }

  // Filter 1: Block tribal-specific grants
  if (hasTribalSpecificContent(title, description, text, url)) {
    console.log(`❌ Rejected (tribal-specific): ${title}`);
    return { isGrant: false };
  }

  // Filter 2: Block generic landing pages
  if (isGenericLandingPage(title, url, text)) {
    console.log(`❌ Rejected (generic landing page): ${title}`);
    return { isGrant: false };
  }

  const topic_hits = detectTopicHits(text);
  if (topic_hits.length === 0) {
    console.log(`❌ Rejected (no topic matches): ${title}`);
    return { isGrant: false };
  }

  const featureHits = getGrantFeatureHits(text);
  if (featureHits.length < MIN_FEATURE_MATCHES) {
    console.log(`❌ Rejected (only ${featureHits.length} features, need ${MIN_FEATURE_MATCHES}): ${title}`);
    return { isGrant: false };
  }

  const response_deadline = parseDeadline(text);
  const award_amount = extractAwardAmount(text);
  const agency = extractAgency($, hostname, text);

  // Filter 3: Block expired deadlines
  if (response_deadline && isExpiredDeadline(response_deadline)) {
    console.log(`❌ Rejected (expired deadline ${response_deadline}): ${title}`);
    return { isGrant: false };
  }

  // Filter 4: Require minimum specificity
  if (!hasMinimumSpecificity(response_deadline, award_amount, text, url)) {
    console.log(`❌ Rejected (lacks specificity - no deadline, amount, or opp number): ${title}`);
    return { isGrant: false };
  }
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

  console.log(`✅ Accepted: ${title} (deadline: ${response_deadline || 'none'}, amount: ${award_amount || 'none'})`);

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
