import fetch from 'node-fetch';
import { load } from 'cheerio';
import crypto from 'crypto';

/**
 * HHS ACF OFVPS (Office of Family Violence Prevention and Services) Grant Scraper
 * Fetches current funding opportunities from acf.gov/ofvps/grants
 */

const OFVPS_GRANTS_URL = 'https://acf.gov/ofvps/grants';

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
 * Extract funding opportunities from OFVPS grants page
 * Parses the page to get title, deadline, and PDF URL
 */
function extractOFVPSOpportunities($, baseUrl) {
  const opportunities = [];

  // Look for links to OFVPS funding opportunity PDFs
  $('a').each((i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();

    if (!href || !text) return;

    const urlLower = href.toLowerCase();

    // Only process PDF links from OFVPS documents folder
    if (!urlLower.includes('/ofvps/') || !urlLower.endsWith('.pdf')) {
      return;
    }

    // Skip if link text is too generic
    if (text.length < 15 || text.toLowerCase().includes('download')) {
      return;
    }

    // Look for funding opportunity keywords in the text
    const fundingKeywords = ['funding opportunity', 'nofo', 'notice of', 'standing funding', 'domestic violence', 'coalition', 'shelter', 'supportive services'];
    const hasFundingKeyword = fundingKeywords.some(kw => text.toLowerCase().includes(kw));

    if (!hasFundingKeyword) {
      return;
    }

    const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;

    // Try to find the deadline in nearby text
    const parentText = $(el).parent().text() + ' ' + $(el).parent().parent().text();
    const siblingText = $(el).next().text() + ' ' + $(el).nextAll().slice(0, 3).text();
    const searchText = parentText + ' ' + siblingText;

    // Look for deadline patterns
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

    opportunities.push({
      url: fullUrl,
      title: text,
      deadline,
      source: 'acf.gov',
      agency: 'HHS Administration for Children and Families - OFVPS',
    });
  });

  console.log(`   Found ${opportunities.length} OFVPS opportunities on list page`);
  return opportunities;
}

/**
 * Main scraper function
 */
export async function scrapeACFGrants(options = {}) {
  const { limit = 20, location = 'Jacksonville, FL' } = options;

  console.log('🔍 Scraping ACF/OFVPS grant opportunities...');
  console.log(`   Limit: ${limit}`);
  console.log(`   Location: ${location}`);

  const allOpportunities = [];

  try {
    // Fetch the OFVPS grants page
    console.log(`   Fetching ${OFVPS_GRANTS_URL}...`);
    const html = await fetchPage(OFVPS_GRANTS_URL);
    const $ = load(html);

    // Extract opportunities from the page
    const opportunities = extractOFVPSOpportunities($, OFVPS_GRANTS_URL);

    const toProcess = opportunities.slice(0, limit);
    console.log(`   Processing ${toProcess.length} opportunities...`);

    // Create grant records from extracted data
    for (let i = 0; i < toProcess.length; i++) {
      const opp = toProcess[i];
      console.log(`\n   [${i + 1}/${toProcess.length}] ${opp.title}`);
      console.log(`   Deadline: ${opp.deadline || 'not found'}`);

      // Create a grant record
      const opportunity = {
        id: crypto.createHash('sha1').update(opp.url).digest('hex').slice(0, 12),
        source: opp.source,
        source_record_url: opp.url,
        title: opp.title,
        summary: `HHS ACF OFVPS funding opportunity for domestic violence services and shelters`,
        agency: opp.agency,
        posted_date: '',
        response_deadline: opp.deadline,
        naics: '',
        psc: '',
        set_aside: '',
        pop_city: location.split(',')[0]?.trim() || '',
        pop_state: location.split(',')[1]?.trim() || '',
        pop_zip: '',
        pop_country: 'US',
        poc_name: '',
        poc_email: '',
        poc_phone: '',
        award_number: '',
        award_amount: '',
        award_date: '',
        award_awardee: '',
        relevance_score: 0.80, // High relevance - OFVPS funds domestic violence services
        topic_hits: 'domestic violence;victim services;shelter;women;family violence',
        created_at: new Date().toISOString(),
        raw_data: JSON.stringify(opp),
        isGrant: true,
      };

      allOpportunities.push(opportunity);
      console.log(`   ✅ Added: ${opportunity.title}`);
    }

    console.log(`\n✅ Scraping complete: Found ${allOpportunities.length} ACF grants`);
    return allOpportunities;

  } catch (error) {
    console.error('❌ ACF scraping failed:', error);
    throw error;
  }
}

// Export for use in server
export default { scrapeACFGrants };
