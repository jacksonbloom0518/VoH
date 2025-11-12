import fetch from 'node-fetch';
import { load } from 'cheerio';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Requirements Generator Module
 * Uses Claude API to generate grant application requirements summaries
 * Fixed: Using correct Claude model version (20240620)
 */

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
];

/**
 * Fetch HTML or PDF content from a URL
 * @param {string} url - The URL to fetch
 * @returns {Promise<{content: string, contentType: string}>}
 */
export async function fetchGrantContent(url) {
  const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  try {
    console.log(`   📄 Fetching content from: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml,application/pdf;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 30000,
      redirect: 'follow',
    });

    if (!response.ok) {
      console.log(`   ⚠️  HTTP ${response.status}: ${response.statusText}`);
      return { content: '', contentType: 'error' };
    }

    const contentType = response.headers.get('content-type') || '';

    // Handle PDF content
    if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
      console.log(`   📑 Processing PDF content...`);
      const buffer = await response.arrayBuffer();

      try {
        // Dynamic import for pdf-parse (CommonJS module)
        const pdfParse = (await import('pdf-parse')).default;
        const data = await pdfParse(Buffer.from(buffer));
        console.log(`   ✅ Extracted ${data.text.length} characters from PDF`);
        return { content: data.text, contentType: 'pdf' };
      } catch (pdfError) {
        console.log(`   ⚠️  PDF parsing failed: ${pdfError.message}`);
        return { content: '', contentType: 'pdf-error' };
      }
    }

    // Handle HTML content
    const html = await response.text();
    console.log(`   ✅ Fetched ${html.length} characters of HTML`);
    return { content: html, contentType: 'html' };

  } catch (error) {
    console.log(`   ❌ Fetch error: ${error.message}`);
    return { content: '', contentType: 'error' };
  }
}

/**
 * Extract requirements sections from HTML/PDF content
 * @param {string} content - The content to parse
 * @param {string} contentType - Type of content (html/pdf)
 * @param {string} title - Grant title for context
 * @returns {string} Extracted requirements text
 */
export function extractRequirementsFromContent(content, contentType, title) {
  if (!content || content.length < 100) {
    return '';
  }

  try {
    // For PDF, content is plain text - search for requirements sections
    if (contentType === 'pdf') {
      const lines = content.split('\n');
      const requirementSections = [];
      let capturing = false;
      let capturedLines = [];

      const startKeywords = [
        'eligibility', 'requirements', 'who can apply', 'who is eligible',
        'applicant eligibility', 'minimum qualifications', 'eligible applicants',
        'program requirements', 'application requirements'
      ];

      const endKeywords = [
        'award information', 'funding', 'submission', 'deadline',
        'how to apply', 'contact', 'background', 'purpose'
      ];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase().trim();

        // Start capturing if we hit a requirements header
        if (!capturing && startKeywords.some(keyword => line.includes(keyword))) {
          capturing = true;
          capturedLines = [lines[i]];
          continue;
        }

        // Stop capturing if we hit an end keyword or captured enough
        if (capturing) {
          if (endKeywords.some(keyword => line.includes(keyword)) || capturedLines.length > 100) {
            requirementSections.push(capturedLines.join('\n'));
            capturing = false;
            capturedLines = [];
          } else {
            capturedLines.push(lines[i]);
          }
        }
      }

      // Add any remaining captured content
      if (capturedLines.length > 0) {
        requirementSections.push(capturedLines.join('\n'));
      }

      const extracted = requirementSections.join('\n\n').substring(0, 5000);
      console.log(`   📝 Extracted ${extracted.length} characters of requirements from PDF`);
      return extracted;
    }

    // For HTML, use cheerio to parse
    const $ = load(content);

    // Remove scripts and styles
    $('script, style, nav, header, footer').remove();

    const requirementText = [];

    // Look for sections with requirements-related headers
    $('h1, h2, h3, h4, h5, h6').each((i, el) => {
      const headerText = $(el).text().toLowerCase();

      if (headerText.includes('eligibility') ||
          headerText.includes('requirements') ||
          headerText.includes('who can apply') ||
          headerText.includes('qualifications')) {

        // Get the next few siblings (paragraphs, lists, etc.)
        let sibling = $(el).next();
        let count = 0;
        const sectionText = [$(el).text()];

        while (sibling.length && count < 10) {
          const tag = sibling.prop('tagName')?.toLowerCase();
          if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
            break; // Stop at next header
          }
          if (['p', 'ul', 'ol', 'div', 'li'].includes(tag)) {
            sectionText.push(sibling.text().trim());
          }
          sibling = sibling.next();
          count++;
        }

        requirementText.push(sectionText.join('\n'));
      }
    });

    const extracted = requirementText.join('\n\n').substring(0, 5000);
    console.log(`   📝 Extracted ${extracted.length} characters of requirements from HTML`);
    return extracted;

  } catch (error) {
    console.log(`   ⚠️  Extraction error: ${error.message}`);
    return '';
  }
}

/**
 * Search for grant requirements using Google Custom Search
 * @param {string} title - Grant title
 * @returns {Promise<string>} Search results snippets
 */
export async function searchGrantRequirements(title) {
  const apiKey = process.env.GOOGLE_API_KEY;
  const cseId = process.env.GOOGLE_CSE_ID;

  if (!apiKey || !cseId) {
    console.log(`   ⚠️  Google API credentials missing, skipping search`);
    return '';
  }

  try {
    const query = `"${title}" requirements eligibility`;
    console.log(`   🔍 Searching for: ${query}`);

    const response = await fetch(
      `https://customsearch.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=3`,
      { timeout: 10000 }
    );

    if (!response.ok) {
      console.log(`   ⚠️  Search API returned ${response.status}`);
      return '';
    }

    const data = await response.json();
    const items = data.items || [];

    const snippets = items.map(item => `${item.title}\n${item.snippet}`).join('\n\n');
    console.log(`   ✅ Found ${items.length} search results`);
    return snippets.substring(0, 2000);

  } catch (error) {
    console.log(`   ⚠️  Search error: ${error.message}`);
    return '';
  }
}

/**
 * Generate requirements summary using Claude API
 * @param {object} grantData - Grant opportunity data
 * @param {string} extractedContent - Content extracted from grant URL
 * @param {string} searchResults - Results from web search
 * @returns {Promise<string>} Generated requirements summary
 */
export async function generateRequirementsSummary(grantData, extractedContent, searchResults) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    console.log(`   ⚠️  Anthropic API key not configured`);
    return `Requirements information unavailable. For details, visit: ${grantData.source_record_url}${grantData.poc_email ? ' or contact: ' + grantData.poc_email : ''}`;
  }

  try {
    console.log(`   🤖 Generating requirements summary with Claude...`);

    const anthropic = new Anthropic({ apiKey });

    // Build a comprehensive prompt that leverages Claude's knowledge base
    // Use scraped content as supplementary information when available
    const prompt = `You are an expert on federal grant programs and nonprofit grant requirements. Generate a concise bullet-point summary (5-8 bullets) of the key application requirements for this grant opportunity.

Grant Information:
• Title: ${grantData.title}
• Agency: ${grantData.agency || 'Not specified'}
• Summary: ${grantData.summary || 'Not provided'}
${grantData.source_record_url ? `• Source: ${grantData.source_record_url}` : ''}
${extractedContent && extractedContent.length > 50 ? `\n\nExtracted Grant Documentation:\n${extractedContent}\n` : ''}
${searchResults && searchResults.length > 50 ? `\n\nAdditional Context:\n${searchResults}\n` : ''}

Instructions:
Draw from your knowledge of federal grant programs, agency-specific requirements, and common nonprofit grant application processes to generate requirements that typically apply to this type of grant. Focus on:

1. **Eligibility Requirements**: Organization type (501(c)(3), government, tribe, etc.), geographic restrictions, size/capacity requirements
2. **Data & Reporting Requirements**: Data collection systems, performance measurement, outcome tracking, quarterly/annual reporting obligations
3. **Compliance Requirements**: Federal regulations (2 CFR 200, FFATA), financial audits, single audit requirements, civil rights compliance
4. **Application Documentation**: IRS determination letter, DUNS/UEI number, SAM.gov registration, financial statements, organizational capacity evidence
5. **Program-Specific Requirements**: Match/cost-share requirements, evidence-based practices, staff qualifications, partnership requirements

Based on the grant title and agency, infer the most relevant requirements. For example:
- ACF grants typically require data systems for tracking beneficiary outcomes
- DOJ Office on Violence Against Women grants require victim services experience and trauma-informed approaches
- HUD grants often require housing/homelessness data systems and HMIS participation
- SAMHSA grants require substance abuse treatment credentials and outcome measurement
- General federal grants require SAM.gov registration, financial management systems, and 2 CFR 200 compliance

Format your response as plain text bullet points starting with • (bullet character). Each bullet should be one clear, actionable requirement. Be specific and practical.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const responseText = message.content[0].text.trim();
    console.log(`   ✅ Generated ${responseText.length} characters of requirements`);
    return responseText;

  } catch (error) {
    console.error(`   ❌ Claude API error: ${error.message}`);

    // Fallback message on error
    return `Requirements information unavailable. For details, visit: ${grantData.source_record_url}${grantData.poc_email ? '\nContact: ' + grantData.poc_email : ''}${grantData.poc_phone ? '\nPhone: ' + grantData.poc_phone : ''}`;
  }
}

/**
 * Process grant requirements - main orchestrator function
 * @param {object} db - Database instance
 * @param {string} opportunityId - Opportunity ID to process
 * @returns {Promise<string>} Generated requirements text
 */
export async function processGrantRequirements(db, opportunityId) {
  try {
    console.log(`\n🔄 Processing requirements for grant: ${opportunityId}`);

    // Fetch grant record from database
    const stmt = db.prepare('SELECT * FROM opportunities WHERE id = ?');
    stmt.bind([opportunityId]);

    if (!stmt.step()) {
      throw new Error('Grant not found in database');
    }

    const grant = stmt.getAsObject();
    console.log(`   📋 Grant: ${grant.title}`);

    // Run content fetch and search in parallel
    const [contentResult, searchResults] = await Promise.all([
      fetchGrantContent(grant.source_record_url),
      searchGrantRequirements(grant.title)
    ]);

    // Extract requirements from fetched content
    const extractedContent = extractRequirementsFromContent(
      contentResult.content,
      contentResult.contentType,
      grant.title
    );

    // Generate summary using Claude
    const requirements = await generateRequirementsSummary(
      grant,
      extractedContent,
      searchResults
    );

    // Update database with requirements
    const updateStmt = db.prepare('UPDATE opportunities SET requirements = ? WHERE id = ?');
    updateStmt.bind([requirements, opportunityId]);
    updateStmt.step();

    console.log(`   ✅ Updated requirements for ${opportunityId}`);

    return requirements;

  } catch (error) {
    console.error(`   ❌ Error processing grant ${opportunityId}:`, error.message);
    throw error;
  }
}

/**
 * Process requirements for multiple grants in batch
 * @param {object} db - Database instance
 * @param {Array<string>} opportunityIds - Array of opportunity IDs
 * @param {function} saveDatabase - Function to save database to disk
 * @returns {Promise<number>} Number of grants processed
 */
export async function batchProcessRequirements(db, opportunityIds, saveDatabase) {
  console.log(`\n📦 Batch processing ${opportunityIds.length} grants...`);

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < opportunityIds.length; i++) {
    const id = opportunityIds[i];

    try {
      await processGrantRequirements(db, id);
      processed++;

      // Add delay to avoid rate limiting (1 second between requests)
      if (i < opportunityIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Save database periodically (every 5 grants)
      if ((i + 1) % 5 === 0) {
        saveDatabase();
        console.log(`   💾 Progress saved: ${i + 1}/${opportunityIds.length}`);
      }

    } catch (error) {
      console.error(`   ❌ Failed to process ${id}: ${error.message}`);
      failed++;
    }
  }

  // Final save
  saveDatabase();

  console.log(`\n✅ Batch complete: ${processed} processed, ${failed} failed`);
  return processed;
}

export default {
  fetchGrantContent,
  extractRequirementsFromContent,
  searchGrantRequirements,
  generateRequirementsSummary,
  processGrantRequirements,
  batchProcessRequirements
};
