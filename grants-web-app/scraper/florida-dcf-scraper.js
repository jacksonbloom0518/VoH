import fetch from 'node-fetch';
import { load } from 'cheerio';
import crypto from 'crypto';

/**
 * Florida Grant Portal Scraper
 * Fetches domestic violence grant opportunities from Florida Grant Portal
 * florida.thegrantportal.com lists 55+ DV grants totaling $26M+ in funding
 */

const FLORIDA_GRANTS_URL = 'https://florida.thegrantportal.com/domestic-violence';
const PORTAL_BASE_URL = 'https://florida.thegrantportal.com';

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
 * Extract grant opportunities from Florida Grant Portal
 */
function extractFloridaGrants($, baseUrl) {
  const grants = [];

  // Look for grant cards or listings on the portal
  // The portal typically uses structured divs or articles for each grant
  $('.grant-item, .grant-card, article, .grant-listing').each((i, el) => {
    const $grant = $(el);

    // Find the title link
    const $titleLink = $grant.find('a[href*="/grant-details/"]').first();
    if (!$titleLink.length) return;

    const href = $titleLink.attr('href');
    const title = $titleLink.text().trim();

    if (!href || !title) return;

    const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;

    // Extract amount if available (look for dollar signs)
    const grantText = $grant.text();
    const amountMatch = grantText.match(/\$[\d,]+/);
    const amount = amountMatch ? amountMatch[0] : '';

    // Try to extract deadline
    const deadlineMatch = grantText.match(/(deadline|due date|closes?)[:\s]+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i);

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
      title,
      amount,
      deadline,
      source: 'florida.thegrantportal.com',
      agency: 'Florida Grant Portal - Various Funders',
    });
  });

  // If the structured approach didn't work, try a simpler link-based approach
  if (grants.length === 0) {
    $('a[href*="/grant-details/"]').each((i, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;

      // Extract title from URL slug
      // URL format: /grant-details/73317/grant-for-nonprofits-supporting-domestic-violence-survivors-and-pets
      const urlParts = href.split('/');
      const slug = urlParts[urlParts.length - 1]?.replace(/\?.*$/, ''); // Remove query params

      if (!slug || slug.length < 5) return;

      // Convert slug to title: "grant-for-nonprofits" -> "Grant for Nonprofits"
      const title = slug
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      // Get surrounding context for additional info
      const $parent = $(el).closest('.grant-card, .grant-item, div[class*="grant"]');
      const contextText = $parent.text();

      // Extract amount
      const amountMatch = contextText.match(/\$[\d,]+/);
      const amount = amountMatch ? amountMatch[0] : '';

      // Extract deadline
      const deadlineMatch = contextText.match(/(deadline|due date|closes?)[:\s]+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i);

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
        title,
        amount,
        deadline,
        source: 'florida.thegrantportal.com',
        agency: 'Florida Grant Portal - Various Funders',
      });
    });
  }

  // Filter grants to only include relevant domestic violence/trafficking grants
  const relevantKeywords = [
    'domestic violence',
    'violence against women',
    'sexual assault',
    'trafficking',
    'victim',
    'survivor',
    'abuse',
    'shelter',
    'crisis',
    'women and children',
    'women\'s',
    'family violence',
    'intimate partner',
    'trauma',
  ];

  const filteredGrants = grants.filter(grant => {
    const searchText = `${grant.title} ${grant.url}`.toLowerCase();
    return relevantKeywords.some(keyword => searchText.includes(keyword));
  });

  console.log(`   Found ${grants.length} total grants, filtered to ${filteredGrants.length} relevant DV/trafficking grants`);
  return filteredGrants;
}

/**
 * Main scraper function
 */
export async function scrapeFloridaDCFGrants(options = {}) {
  const { limit = 20, location = 'Jacksonville, FL' } = options;

  console.log('🏛️  Scraping Florida Grant Portal for DV opportunities...');
  console.log(`   Limit: ${limit}`);
  console.log(`   Location: ${location}`);

  const opportunities = [];

  try {
    // Fetch the Florida Grant Portal page
    console.log(`   Fetching ${FLORIDA_GRANTS_URL}...`);
    const html = await fetchPage(FLORIDA_GRANTS_URL);
    const $ = load(html);

    // Extract grant opportunities from the portal
    const grants = extractFloridaGrants($, PORTAL_BASE_URL);

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
        summary: `Florida domestic violence grant opportunity from Grant Portal: ${grant.title}`,
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
        poc_email: '',
        poc_phone: '',
        award_number: '',
        award_amount: grant.amount || '',
        award_date: '',
        award_awardee: '',
        relevance_score: 0.85, // High relevance - Florida-specific DV grants portal
        topic_hits: 'domestic violence;victim services;Florida;grants portal',
        created_at: new Date().toISOString(),
        raw_data: JSON.stringify(grant),
        isGrant: true,
      };

      opportunities.push(opportunity);
      console.log(`   ✅ Added: ${opportunity.title}`);
    }

    console.log(`\n✅ Scraping complete: Found ${opportunities.length} Florida grants`);
    return opportunities;

  } catch (error) {
    console.error('❌ Florida Grant Portal scraping failed:', error);
    throw error;
  }
}

// Export for use in server
export default { scrapeFloridaDCFGrants };
