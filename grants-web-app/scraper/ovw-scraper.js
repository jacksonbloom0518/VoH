import fetch from 'node-fetch';
import { load } from 'cheerio';
import crypto from 'crypto';

/**
 * DOJ Office on Violence Against Women (OVW) Grant Scraper
 * Fetches current funding opportunities from justice.gov/ovw/open-notices-of-funding-opportunity
 */

const OVW_NOFOS_URL = 'https://www.justice.gov/ovw/open-notices-of-funding-opportunity';

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
 * Extract NOFO data directly from OVW list page
 * Parses the structured list to get title, deadline, and PDF URL
 */
function extractNOFOsFromListPage($, baseUrl) {
  const nofos = [];

  // Look for links to NOFO PDFs in /ovw/media/ path
  $('a').each((i, el) => {
    const href = $(el).attr('href');
    const title = $(el).text().trim();

    if (!href || !title) return;

    // Only process NOFO PDF links
    const urlLower = href.toLowerCase();
    if (!urlLower.includes('/ovw/media/') || (!urlLower.includes('dl?inline') && !urlLower.endsWith('.pdf'))) {
      return;
    }

    // Skip generic link text
    if (title.length < 10 || title.toLowerCase() === 'this link') {
      return;
    }

    let fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;

    // Clean up URL: remove dl?inline to get the file page URL instead of direct download
    fullUrl = fullUrl.replace(/\/dl\?inline$/, '');

    // Try to find the deadline in nearby text
    const parentText = $(el).parent().text();
    const siblingText = $(el).next().text() + ' ' + $(el).nextAll().slice(0, 3).text();
    const searchText = parentText + ' ' + siblingText;

    // Look for "Closing date: Month DD, YYYY" or "Deadline: Month DD, YYYY"
    const deadlineMatch = searchText.match(/(closing date|deadline|due date)[:\s]+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),\s+(\d{4})/i);

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

    nofos.push({
      url: fullUrl,
      title,
      deadline,
      source: 'justice.gov',
      agency: 'DOJ Office on Violence Against Women',
    });
  });

  console.log(`   Found ${nofos.length} NOFOs on list page`);
  return nofos;
}

/**
 * Main scraper function
 */
export async function scrapeOVWGrants(options = {}) {
  const { limit = 20, location = 'Jacksonville, FL' } = options;

  console.log('🔍 Scraping OVW grant opportunities...');
  console.log(`   Limit: ${limit}`);
  console.log(`   Location: ${location}`);

  const opportunities = [];

  try {
    // Step 1: Fetch the open NOFOs page (active funding opportunities)
    console.log(`   Fetching ${OVW_NOFOS_URL}...`);
    const html = await fetchPage(OVW_NOFOS_URL);
    const $ = load(html);

    // Step 2: Extract NOFOs directly from the list page
    const nofos = extractNOFOsFromListPage($, OVW_NOFOS_URL);

    const toProcess = nofos.slice(0, limit);
    console.log(`   Processing ${toProcess.length} NOFOs...`);

    // Step 3: Create grant records from extracted data
    for (let i = 0; i < toProcess.length; i++) {
      const nofo = toProcess[i];
      console.log(`\n   [${i + 1}/${toProcess.length}] ${nofo.title}`);
      console.log(`   Deadline: ${nofo.deadline || 'not found'}`);

      // Create a grant record directly from NOFO data
      const opportunity = {
        id: crypto.createHash('sha1').update(nofo.url).digest('hex').slice(0, 12),
        source: nofo.source,
        source_record_url: nofo.url,
        title: nofo.title,
        summary: `DOJ Office on Violence Against Women funding opportunity for ${nofo.title.toLowerCase()}`,
        agency: nofo.agency,
        posted_date: '',
        response_deadline: nofo.deadline,
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
        relevance_score: 0.85, // High relevance - OVW is primary funder for trafficking/DV
        topic_hits: 'domestic violence;sexual assault;victim services;women',
        created_at: new Date().toISOString(),
        raw_data: JSON.stringify(nofo),
        isGrant: true,
      };

      opportunities.push(opportunity);
      console.log(`   ✅ Added: ${opportunity.title}`);
    }

    console.log(`\n✅ Scraping complete: Found ${opportunities.length} OVW grants`);
    return opportunities;

  } catch (error) {
    console.error('❌ OVW scraping failed:', error);
    throw error;
  }
}

// Export for use in server
export default { scrapeOVWGrants };
