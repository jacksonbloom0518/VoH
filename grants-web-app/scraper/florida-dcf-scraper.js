import fetch from 'node-fetch';
import { load } from 'cheerio';
import crypto from 'crypto';

/**
 * Florida DCF (Department of Children and Families) Grant Scraper
 * Fetches domestic violence grant opportunities from DCF grants page
 */

const DCF_GRANTS_URL = 'https://www.myflfamilies.com/services/abuse/domestic-violence/programs';
const DCF_BASE_URL = 'https://www.myflfamilies.com';

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
 * Extract grant opportunities from DCF grants page
 */
function extractDCFGrants($, baseUrl) {
  const grants = [];

  // Look for links to grant documents and opportunities
  $('a').each((i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();

    if (!href || !text) return;

    const textLower = text.toLowerCase();
    const hrefLower = href.toLowerCase();

    // Look for grant-related keywords
    const grantKeywords = [
      'grant', 'funding', 'rfp', 'request for proposal', 'nofo',
      'notice of funding', 'application', 'solicitation'
    ];

    const hasGrantKeyword = grantKeywords.some(kw => textLower.includes(kw));

    // Skip navigation and generic links
    if (text.length < 15 || textLower.includes('home') || textLower.includes('contact')) {
      return;
    }

    // Only process links that look like grant opportunities
    if (!hasGrantKeyword && !hrefLower.includes('grant') && !hrefLower.includes('funding')) {
      return;
    }

    const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;

    // Try to extract deadline from nearby text
    const parentText = $(el).parent().text();
    const siblingText = $(el).next().text() + ' ' + $(el).nextAll().slice(0, 3).text();
    const searchText = parentText + ' ' + siblingText;

    const deadlineMatch = searchText.match(/(deadline|due date|closes?)[:\s]+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i);

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

    grants.push({
      url: fullUrl,
      title: text,
      deadline,
      source: 'dcf.state.fl.us',
      agency: 'Florida Department of Children and Families - Office of Domestic Violence',
    });
  });

  console.log(`   Found ${grants.length} DCF grant opportunities on page`);
  return grants;
}

/**
 * Main scraper function
 */
export async function scrapeFloridaDCFGrants(options = {}) {
  const { limit = 20, location = 'Jacksonville, FL' } = options;

  console.log('🏛️  Scraping Florida DCF grant opportunities...');
  console.log(`   Limit: ${limit}`);
  console.log(`   Location: ${location}`);

  const opportunities = [];

  try {
    // Fetch the DCF grants page
    console.log(`   Fetching ${DCF_GRANTS_URL}...`);
    const html = await fetchPage(DCF_GRANTS_URL);
    const $ = load(html);

    // Extract grant opportunities from the page
    const grants = extractDCFGrants($, DCF_BASE_URL);

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
        summary: `Florida DCF domestic violence grant opportunity: ${grant.title}`,
        agency: grant.agency,
        posted_date: '',
        response_deadline: grant.deadline,
        naics: '',
        psc: '',
        set_aside: '',
        pop_city: location.split(',')[0]?.trim() || '',
        pop_state: location.split(',')[1]?.trim() || 'FL',
        pop_zip: '',
        pop_country: 'US',
        poc_name: '',
        poc_email: 'domesticviolence@dcf.state.fl.us',
        poc_phone: '',
        award_number: '',
        award_amount: '',
        award_date: '',
        award_awardee: '',
        relevance_score: 0.82, // High relevance - state DV funding
        topic_hits: 'domestic violence;victim services;Florida;state grants',
        created_at: new Date().toISOString(),
        raw_data: JSON.stringify(grant),
        isGrant: true,
      };

      opportunities.push(opportunity);
      console.log(`   ✅ Added: ${opportunity.title}`);
    }

    console.log(`\n✅ Scraping complete: Found ${opportunities.length} Florida DCF grants`);
    return opportunities;

  } catch (error) {
    console.error('❌ Florida DCF scraping failed:', error);
    throw error;
  }
}

// Export for use in server
export default { scrapeFloridaDCFGrants };
