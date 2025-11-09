import fetch from 'node-fetch';
import { load } from 'cheerio';
import crypto from 'crypto';

/**
 * Community Foundation for Northeast Florida Grant Scraper
 * Fetches grant opportunities from Jacksonville-area community foundation
 */

const JAXCF_BASE_URL = 'https://www.jaxcf.org';
const JAXCF_GRANTS_SEARCH = 'https://www.jaxcf.org/?s=grant+opportunities';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
];

/**
 * Fetch HTML from a URL with proper headers
 */
async function fetchPage(url) {
  const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 30000,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    console.error(`❌ Error fetching ${url}:`, error.message);
    throw error;
  }
}

/**
 * Extract grant opportunities from Community Foundation search results
 */
function extractFoundationGrants($, baseUrl) {
  const grants = [];

  // Look for article titles and links (typical WordPress structure)
  $('article, .post, .entry').each((i, el) => {
    const $article = $(el);
    const $title = $article.find('h2 a, h3 a, .entry-title a, .post-title a').first();

    if (!$title.length) return;

    const href = $title.attr('href');
    const title = $title.text().trim();

    if (!href || !title) return;

    const titleLower = title.toLowerCase();

    // Look for grant-related keywords
    const grantKeywords = [
      'grant', 'funding', 'opportunity', 'application', 'women\'s giving alliance',
      'nonprofit', 'award', 'rfp', 'request for proposal'
    ];

    const hasGrantKeyword = grantKeywords.some(kw => titleLower.includes(kw));

    if (!hasGrantKeyword) return;

    const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;

    // Extract deadline from article content
    const articleText = $article.text();
    const deadlineMatch = articleText.match(/(deadline|due date|closes?)[:\s]+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i);

    let deadline = '';
    if (deadlineMatch) {
      const month = deadlineMatch[2];
      const day = deadlineMatch[3];
      const year = deadlineMatch[4];
      const dateStr = `${month} ${day}, ${year}`;
      const parsed = Date.parse(dateStr);
      if (!isNaN(parsed)) {
        deadline = new Date(parsed).toISOString().split('T')[0];
      }
    }

    // Extract summary
    const $summary = $article.find('.entry-summary, .excerpt, p').first();
    const summary = $summary.text().trim().slice(0, 200);

    grants.push({
      url: fullUrl,
      title,
      summary,
      deadline,
      source: 'jaxcf.org',
      agency: 'Community Foundation for Northeast Florida',
    });
  });

  console.log(`   Found ${grants.length} foundation grant opportunities`);
  return grants;
}

/**
 * Main scraper function
 */
export async function scrapeJaxFoundationGrants(options = {}) {
  const { limit = 10, location = 'Jacksonville, FL' } = options;

  console.log('🏦 Scraping Community Foundation for Northeast Florida grants...');
  console.log(`   Limit: ${limit}`);
  console.log(`   Location: ${location}`);

  const opportunities = [];

  try {
    // Fetch the foundation grants search page
    console.log(`   Fetching ${JAXCF_GRANTS_SEARCH}...`);
    const html = await fetchPage(JAXCF_GRANTS_SEARCH);
    const $ = load(html);

    // Extract grant opportunities from the page
    const grants = extractFoundationGrants($, JAXCF_BASE_URL);

    const toProcess = grants.slice(0, limit);
    console.log(`   Processing ${toProcess.length} grant opportunities...`);

    // Create grant records from extracted data
    for (let i = 0; i < toProcess.length; i++) {
      const grant = toProcess[i];
      console.log(`\n   [${i + 1}/${toProcess.length}] ${grant.title}`);
      console.log(`   Deadline: ${grant.deadline || 'not found'}`);

      // Create a grant record
      const opportunity = {
        id: crypto.createHash('sha1').update(grant.url).digest('hex').slice(0, 12),
        source: grant.source,
        source_record_url: grant.url,
        title: grant.title,
        summary: grant.summary || `Community Foundation for Northeast Florida grant: ${grant.title}`,
        agency: grant.agency,
        posted_date: '',
        response_deadline: grant.deadline,
        naics: '',
        psc: '',
        set_aside: '',
        pop_city: 'Jacksonville',
        pop_state: 'FL',
        pop_zip: '',
        pop_country: 'US',
        poc_name: '',
        poc_email: '',
        poc_phone: '',
        award_number: '',
        award_amount: '',
        award_date: '',
        award_awardee: '',
        relevance_score: 0.78, // Good relevance - local foundation funding
        topic_hits: 'domestic violence;victim services;Jacksonville;community foundation;local grants',
        created_at: new Date().toISOString(),
        raw_data: JSON.stringify(grant),
        isGrant: true,
      };

      opportunities.push(opportunity);
      console.log(`   ✅ Added: ${opportunity.title}`);
    }

    console.log(`\n✅ Scraping complete: Found ${opportunities.length} foundation grants`);
    return opportunities;

  } catch (error) {
    console.error('❌ Foundation scraping failed:', error);
    throw error;
  }
}

// Export for use in server
export default { scrapeJaxFoundationGrants };
