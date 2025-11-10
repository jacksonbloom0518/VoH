import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import axios from 'axios';
import nodemailer from 'nodemailer';
import robotsParser from 'robots-parser';
import { readCsvIndex, appendCsvRows, CSV_HEADERS } from './csv.js';
import {
  analyzeGrantPage,
  selectTopOpportunities,
  normalizeKey,
  shouldSkipOpportunity,
  isPdfContent,
  isAllowedDomain,
  createStableId,
} from './grantness.js';
import { scrapeOVWGrants } from '../scraper/ovw-scraper.js';
import { scrapeACFGrants } from '../scraper/acf-scraper.js';
import { scrapeFloridaDCFGrants } from '../scraper/florida-dcf-scraper.js';
import { scrapeJaxFoundationGrants } from '../scraper/jax-foundation-scraper.js';
import { batchProcessRequirements } from './requirements-generator.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Database setup with sql.js
const dbPath = process.env.DATABASE_PATH || join(__dirname, '../data/grants.db');
const csvPath = join(__dirname, '../../grants-scraper/data/opportunities.csv');
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36',
];
const robotsCache = new Map();
let db;

async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing database if it exists, otherwise create new one
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
    console.log('📦 Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('📦 Created new database');
  }

  return db;
}

// Middleware
app.use(cors());
app.use(express.json());

// Helper to save database to disk
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.mkdirSync(dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, buffer);
  }
}

// Initialize database schema
function initSchema() {
  // sql.js doesn't support multi-statement execution with db.run()
  // We need to run each statement separately

  // Create table if it doesn't exist
  // NOTE: Removed NOT NULL constraints due to sql.js bug with prepared statements
  // Data integrity is enforced in application code instead
  db.run(`
    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      source TEXT,
      source_record_url TEXT,
      title TEXT,
      summary TEXT,
      agency TEXT,
      posted_date TEXT,
      response_deadline TEXT,
      naics TEXT,
      psc TEXT,
      set_aside TEXT,
      pop_city TEXT,
      pop_state TEXT,
      pop_zip TEXT,
      pop_country TEXT,
      poc_name TEXT,
      poc_email TEXT,
      poc_phone TEXT,
      award_number TEXT,
      award_amount REAL,
      award_date TEXT,
      award_awardee TEXT,
      relevance_score REAL,
      topic_hits TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      raw_data TEXT,
      requirements TEXT
    )
  `);

  // Create indexes separately
  db.run(`CREATE INDEX IF NOT EXISTS idx_source ON opportunities(source)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_agency ON opportunities(agency)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_posted_date ON opportunities(posted_date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_deadline ON opportunities(response_deadline)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_relevance ON opportunities(relevance_score)`);

  // Add requirements column if it doesn't exist (migration for existing databases)
  try {
    db.run(`ALTER TABLE opportunities ADD COLUMN requirements TEXT`);
    console.log('✅ Added requirements column to existing database');
  } catch (err) {
    // Column already exists - this is fine
  }

  console.log('✅ Database schema initialized');
  saveDatabase();
}


function getDbIndex() {
  const urlSet = new Set();
  const keySet = new Set();
  const stmt = db.prepare('SELECT source_record_url, title, agency, response_deadline FROM opportunities');
  while (stmt.step()) {
    const row = stmt.getAsObject();
    if (row.source_record_url) {
      urlSet.add(row.source_record_url);
    }
    keySet.add(normalizeKey(row.title, row.agency, row.response_deadline));
  }
  stmt.free();
  return { urlSet, keySet };
}

function insertOpportunitiesIntoDb(records = []) {
  if (!records.length) return;
  const columns = CSV_HEADERS;
  const placeholders = columns.map(() => '?').join(', ');
  const sqlStatement = `INSERT OR REPLACE INTO opportunities (${columns.join(', ')}) VALUES (${placeholders})`;

  // DEBUG: Log the SQL statement and columns being used
  console.log('   📊 INSERT SQL:', sqlStatement);
  console.log('   📊 Columns:', columns);
  console.log('   📊 Column count:', columns.length);

  const stmt = db.prepare(sqlStatement);

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    // Critical validation: ensure required NOT NULL fields are present
    if (!record.source || record.source === '' || record.source === null || record.source === undefined) {
      console.error(`❌ CRITICAL: Record ${i} has invalid source field!`);
      console.error(`   Record:`, JSON.stringify(record, null, 2));
      throw new Error(`Cannot insert record with missing 'source' field (NOT NULL constraint). Record: ${record.title || 'Unknown'}`);
    }
    if (!record.title || record.title === '' || record.title === null || record.title === undefined) {
      console.error(`❌ CRITICAL: Record ${i} has invalid title field!`);
      console.error(`   Record:`, JSON.stringify(record, null, 2));
      throw new Error(`Cannot insert record with missing 'title' field (NOT NULL constraint). Source: ${record.source || 'Unknown'}`);
    }

    // Map columns to values, with fallback to empty string
    const values = columns.map((column, idx) => {
      const value = record[column];
      // For required NOT NULL columns, we've already validated above
      // For other columns, null/undefined becomes empty string
      if (value === null || value === undefined) {
        return '';
      }
      return value;
    });

    // DEBUG: Log first 3 columns and their values
    console.log(`   📊 First 3 column-value pairs:`,
      columns.slice(0, 3).map((col, idx) => `${col}=${values[idx]}`).join(', '));

    try {
      // Try using bind() then step() instead of run()
      stmt.bind(values);
      stmt.step();
      stmt.reset();
    } catch (err) {
      console.error(`❌ SQL INSERT failed for record ${i}:`, err.message);
      console.error(`   Record:`, JSON.stringify(record, null, 2));
      console.error(`   Values:`, values);
      console.error(`   Values length:`, values.length);
      throw err;
    }
  }

  stmt.free();
}

/**
 * Automatically process requirements for grants that don't have them yet
 * Runs in the background without blocking the response
 * @param {number} maxGrants - Maximum number of grants to process (default: 5)
 */
async function processNewGrantRequirements(maxGrants = 5) {
  try {
    // Only process if Anthropic API key is configured
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      console.log('   ⏭️  Skipping requirements generation (no API key configured)');
      return;
    }

    // Find grants without requirements
    const stmt = db.prepare('SELECT id FROM opportunities WHERE requirements IS NULL LIMIT ?');
    stmt.bind([maxGrants]);

    const grantsToProcess = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      grantsToProcess.push(row.id);
    }
    stmt.free();

    if (grantsToProcess.length === 0) {
      console.log('   ✅ All grants have requirements');
      return;
    }

    console.log(`\n🤖 Starting background requirements processing for ${grantsToProcess.length} grants...`);

    // Process in background (don't await)
    batchProcessRequirements(db, grantsToProcess, saveDatabase)
      .then((processed) => {
        console.log(`\n✅ Background processing complete: ${processed} grants processed`);
      })
      .catch((error) => {
        console.error(`\n❌ Background processing error: ${error.message}`);
      });

  } catch (error) {
    console.error('Error starting requirements processing:', error.message);
  }
}

function hydrateRecord(record) {
  const hydrated = { ...record };

  // CRITICAL: Ensure source field is ALWAYS set (NOT NULL constraint)
  // Try to extract from source_record_url first
  if (hydrated.source_record_url) {
    try {
      const parsed = new URL(hydrated.source_record_url);
      if (!hydrated.source || hydrated.source === '' || hydrated.source === null || hydrated.source === undefined) {
        hydrated.source = parsed.hostname;
      }
      if (!hydrated.id) hydrated.id = createStableId(parsed.href);
    } catch {
      // fall through to defaults
    }
  }

  // Fallback #1: Use 'web-scraped' if source is still missing
  if (!hydrated.source || hydrated.source === '' || hydrated.source === null || hydrated.source === undefined) {
    hydrated.source = 'web-scraped';
  }

  // Fallback #2: Last resort - use 'unknown' (should never reach here)
  if (!hydrated.source || hydrated.source === '') {
    console.warn('⚠️  WARNING: Source field was still empty after fallbacks, using "unknown"');
    hydrated.source = 'unknown';
  }

  // Ensure ID is set
  if (!hydrated.id) {
    hydrated.id = createStableId(
      `${hydrated.title || 'opportunity'}-${hydrated.agency || 'unknown'}-${Date.now()}-${Math.random()}`
    );
  }

  // CRITICAL: Ensure title field is ALWAYS set (NOT NULL constraint)
  if (!hydrated.title || hydrated.title === '' || hydrated.title === null || hydrated.title === undefined) {
    console.warn('⚠️  WARNING: Title field was empty, using "Untitled Opportunity"');
    hydrated.title = 'Untitled Opportunity';
  }

  // Fill in all other CSV_HEADERS fields with empty string if undefined/null
  CSV_HEADERS.forEach((header) => {
    if (hydrated[header] === undefined || hydrated[header] === null) {
      hydrated[header] = '';
    }
  });

  return hydrated;
}

const BASE_QUERY =
  'site:.gov (grant OR funding) (apply OR application) (trafficking OR "violence against women" OR survivors OR "victim services" OR shelter OR "domestic violence")';

function buildSearchQueries(location = '') {
  const queries = [BASE_QUERY, `${BASE_QUERY} ("victim services" OR "survivor services")`];
  if (location) {
    queries.push(`${BASE_QUERY} ("${location}" OR Florida OR FL)`);
  }
  return queries;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function fetchSerpResults(query) {
  const apiKey = process.env.GOOGLE_API_KEY;
  const cseId = process.env.GOOGLE_CSE_ID;
  if (!apiKey || !cseId) {
    throw new Error('Missing Google API credentials for local scraping');
  }
  const url = 'https://customsearch.googleapis.com/customsearch/v1';
  const response = await axios.get(url, {
    params: {
      key: apiKey,
      cx: cseId,
      q: query,
      num: 10,
      safe: 'active',
    },
    timeout: 10000,
  });
  return (
    response.data?.items?.map((item) => ({
      link: item.link,
      title: item.title,
      snippet: item.snippet,
    })) || []
  );
}

async function isAllowedByRobots(url) {
  try {
    const parsed = new URL(url);
    const origin = `${parsed.protocol}//${parsed.host}`;
    if (!robotsCache.has(origin)) {
      const robotsUrl = `${origin}/robots.txt`;
      const robotsResponse = await axios.get(robotsUrl, { timeout: 5000 });
      robotsCache.set(origin, robotsParser(robotsUrl, robotsResponse.data));
    }
    const parser = robotsCache.get(origin);
    return parser ? parser.isAllowed(url, randomUserAgent()) : true;
  } catch (error) {
    return true;
  }
}

async function fetchPageHtml(url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': randomUserAgent(),
          Accept: 'text/html,application/xhtml+xml',
        },
        timeout: 15000,
      });
      const contentType = response.headers['content-type'] || '';
      if (isPdfContent(url, contentType)) {
        return { isPdf: true };
      }
      return { html: response.data, contentType };
    } catch (error) {
      const status = error.response?.status;
      if (status === 404 || status === 403) {
        return null;
      }
      if (status === 429) {
        await delay((attempt + 1) * 600);
        continue;
      }
      if (attempt === 2) throw error;
      await delay((attempt + 1) * 400);
    }
  }
  return null;
}

async function evaluateCandidate(candidate, location, dedupeSets) {
  if (!candidate?.link) return null;
  let normalizedUrl;
  try {
    normalizedUrl = new URL(candidate.link).href;
  } catch {
    return null;
  }
  const hostname = new URL(normalizedUrl).hostname.toLowerCase();
  if (!isAllowedDomain(hostname)) return null;
  if (dedupeSets.urlSet.has(normalizedUrl)) return null;
  if (!(await isAllowedByRobots(normalizedUrl))) return null;
  await delay(250 + Math.random() * 400);
  const page = await fetchPageHtml(normalizedUrl);
  if (!page || page.isPdf) return null;
  const opportunity = analyzeGrantPage({
    url: normalizedUrl,
    html: page.html,
    snippet: candidate.snippet,
    locationHint: location,
  });
  if (!opportunity.isGrant) return null;
  if (shouldSkipOpportunity(opportunity, dedupeSets)) return null;
  dedupeSets.urlSet.add(opportunity.source_record_url);
  dedupeSets.keySet.add(normalizeKey(opportunity.title, opportunity.agency, opportunity.response_deadline));
  return opportunity;
}

async function collectLocalOpportunities({ location, dedupeSets, limit }) {
  const queries = buildSearchQueries(location);
  const candidates = [];
  for (const query of queries) {
    const serpResults = await fetchSerpResults(query);
    for (const candidate of serpResults) {
      const opportunity = await evaluateCandidate(candidate, location, dedupeSets);
      if (opportunity) {
        candidates.push(opportunity);
        if (candidates.length >= limit * 3) {
          return candidates;
        }
      }
    }
  }
  return candidates;
}

// API Routes

// GET /api/opportunities - Search and filter opportunities
app.get('/api/opportunities', (req, res) => {
  try {
    const {
      search = '',
      source,
      agency,
      minAmount,
      maxAmount,
      state,
      deadlineFrom,
      deadlineTo,
      page = 1,
      limit = 20,
      sortBy = 'posted_date',
      sortOrder = 'desc',
    } = req.query;

    let query = 'SELECT * FROM opportunities WHERE 1=1';
    const params = [];

    // Search filter
    if (search) {
      query += ' AND (title LIKE ? OR summary LIKE ? OR agency LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    // Source filter
    if (source) {
      query += ' AND source = ?';
      params.push(source);
    }

    // Agency filter
    if (agency) {
      query += ' AND agency LIKE ?';
      params.push(`%${agency}%`);
    }

    // Amount filters
    if (minAmount) {
      query += ' AND award_amount >= ?';
      params.push(parseFloat(minAmount));
    }
    if (maxAmount) {
      query += ' AND award_amount <= ?';
      params.push(parseFloat(maxAmount));
    }

    // State filter
    if (state) {
      query += ' AND pop_state = ?';
      params.push(state);
    }

    // Deadline filters
    if (deadlineFrom) {
      query += ' AND response_deadline >= ?';
      params.push(deadlineFrom);
    }
    if (deadlineTo) {
      query += ' AND response_deadline <= ?';
      params.push(deadlineTo);
    }

    // Count total results
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const countStmt = db.prepare(countQuery);
    countStmt.bind(params);
    countStmt.step();
    const countResult = countStmt.getAsObject();
    const total = countResult.total || 0;
    countStmt.free();

    // Add sorting
    const validSortColumns = ['posted_date', 'response_deadline', 'award_amount', 'relevance_score', 'title'];
    const validSortOrders = ['asc', 'desc'];
    
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'posted_date';
    const sortDirection = validSortOrders.includes(sortOrder.toLowerCase()) ? sortOrder.toUpperCase() : 'DESC';
    
    query += ` ORDER BY ${sortColumn} ${sortDirection}`;

    // Add pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const stmt = db.prepare(query);
    stmt.bind(params);
    const opportunities = [];
    while (stmt.step()) {
      opportunities.push(stmt.getAsObject());
    }
    stmt.free();

    res.json({
      data: opportunities.map(opp => {
        // Handle topic_hits: can be JSON array or semicolon-separated string
        let topicHits = [];
        if (opp.topic_hits) {
          try {
            topicHits = JSON.parse(opp.topic_hits);
          } catch {
            // If not valid JSON, treat as semicolon-separated string
            topicHits = opp.topic_hits.split(';').map(s => s.trim()).filter(Boolean);
          }
        }

        return {
          ...opp,
          topic_hits: topicHits,
          raw_data: undefined, // Exclude raw_data from list view
        };
      }),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    res.status(500).json({ error: 'Failed to fetch opportunities' });
  }
});

// GET /api/opportunities/:id - Get single opportunity with full details
app.get('/api/opportunities/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('SELECT * FROM opportunities WHERE id = ?');
    stmt.bind([id]);
    
    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: 'Opportunity not found' });
    }
    
    const opportunity = stmt.getAsObject();
    stmt.free();

    // Handle topic_hits: can be JSON array or semicolon-separated string
    let topicHits = [];
    if (opportunity.topic_hits) {
      try {
        topicHits = JSON.parse(opportunity.topic_hits);
      } catch {
        // If not valid JSON, treat as semicolon-separated string
        topicHits = opportunity.topic_hits.split(';').map(s => s.trim()).filter(Boolean);
      }
    }

    // Handle raw_data: should be JSON
    let rawData = null;
    if (opportunity.raw_data) {
      try {
        rawData = JSON.parse(opportunity.raw_data);
      } catch {
        // If parsing fails, keep as string or null
        rawData = opportunity.raw_data;
      }
    }

    res.json({
      ...opportunity,
      topic_hits: topicHits,
      raw_data: rawData,
    });
  } catch (error) {
    console.error('Error fetching opportunity:', error);
    res.status(500).json({ error: 'Failed to fetch opportunity' });
  }
});

// GET /api/stats - Get statistics
// POST /api/mock-data - Generate mock grant data for testing (no external API calls)
app.post('/api/mock-data', (req, res) => {
  try {
    const mockGrants = [
      {
        title: 'Domestic Violence Prevention and Services Grant',
        agency: 'Office on Violence Against Women',
        source: 'Mock Data',
        source_record_url: 'https://www.grants.gov/',
        posted_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        response_deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
        summary: 'Funding for organizations providing comprehensive services to domestic violence survivors including shelter, counseling, legal advocacy, and economic empowerment.',
        award_amount: 350000
      },
      {
        title: 'Sex Trafficking Victim Services and Support',
        agency: 'Department of Justice',
        source: 'Mock Data',
        source_record_url: 'https://www.grants.gov/',
        posted_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        response_deadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        summary: 'Grant opportunity for nonprofits providing case management, housing assistance, legal services, and trauma-informed care to survivors of sex trafficking.',
        award_amount: 500000
      },
      {
        title: 'Transitional Housing for Survivors Program',
        agency: 'HUD - Department of Housing and Urban Development',
        source: 'Mock Data',
        source_record_url: 'https://www.grants.gov/',
        posted_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        response_deadline: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000).toISOString(),
        summary: 'Competitive grant for creating and operating transitional housing programs for women escaping domestic violence and human trafficking with supportive services.',
        award_amount: 1000000
      },
      {
        title: 'Mental Health and Trauma Services for Trafficking Survivors',
        agency: 'SAMHSA - Substance Abuse and Mental Health Services Administration',
        source: 'Mock Data',
        source_record_url: 'https://www.grants.gov/',
        posted_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        response_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        summary: 'Funding for integrated mental health and substance abuse treatment services designed specifically for survivors of human trafficking with trauma-informed approaches.',
        award_amount: 400000
      },
      {
        title: 'Legal Advocacy and Justice Services Grant',
        agency: 'Department of Justice - Office for Victims of Crime',
        source: 'Mock Data',
        source_record_url: 'https://www.grants.gov/',
        posted_date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        response_deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        summary: 'Grant for providing legal representation, immigration assistance, protective orders, and justice advocacy services to domestic violence and trafficking survivors.',
        award_amount: 300000
      }
    ];

    let inserted = 0;
    for (const grant of mockGrants) {
      const id = `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const stmt = db.prepare(`
        INSERT INTO opportunities (
          id, title, agency, source, source_record_url, posted_date, response_deadline, summary, award_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run([
        id, grant.title, grant.agency, grant.source, grant.source_record_url,
        grant.posted_date, grant.response_deadline, grant.summary, grant.award_amount
      ]);
      inserted++;
    }

    // IMPORTANT: Save the database to disk
    saveDatabase();

    res.json({ success: true, message: `✅ Added ${inserted} mock grant opportunities! Refresh to see them.` });
  } catch (error) {
    console.error('Error adding mock data:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    // Total count
    let stmt = db.prepare('SELECT COUNT(*) as count FROM opportunities');
    stmt.step();
    const total = stmt.getAsObject().count || 0;
    stmt.free();

    // By source
    stmt = db.prepare('SELECT source, COUNT(*) as count FROM opportunities GROUP BY source');
    const bySource = [];
    while (stmt.step()) {
      bySource.push(stmt.getAsObject());
    }
    stmt.free();

    // Recent count
    stmt = db.prepare("SELECT COUNT(*) as count FROM opportunities WHERE posted_date >= date('now', '-30 days')");
    stmt.step();
    const recentCount = stmt.getAsObject().count || 0;
    stmt.free();

    // Avg amount
    stmt = db.prepare('SELECT AVG(award_amount) as avg FROM opportunities WHERE award_amount IS NOT NULL');
    stmt.step();
    const avgAmount = stmt.getAsObject().avg || 0;
    stmt.free();

    res.json({ total, bySource, recentCount, avgAmount });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// GET /api/filters - Get available filter options
app.get('/api/filters', (req, res) => {
  try {
    const filters = { sources: [], agencies: [], states: [] };

    // Sources
    let stmt = db.prepare('SELECT DISTINCT source FROM opportunities ORDER BY source');
    while (stmt.step()) {
      filters.sources.push(stmt.getAsObject().source);
    }
    stmt.free();

    // Agencies
    stmt = db.prepare('SELECT DISTINCT agency FROM opportunities WHERE agency IS NOT NULL ORDER BY agency LIMIT 100');
    while (stmt.step()) {
      filters.agencies.push(stmt.getAsObject().agency);
    }
    stmt.free();

    // States
    stmt = db.prepare('SELECT DISTINCT pop_state FROM opportunities WHERE pop_state IS NOT NULL ORDER BY pop_state');
    while (stmt.step()) {
      filters.states.push(stmt.getAsObject().pop_state);
    }
    stmt.free();

    res.json(filters);
  } catch (error) {
    console.error('Error fetching filters:', error);
    res.status(500).json({ error: 'Failed to fetch filter options' });
  }
});

// POST /api/sync - Trigger data sync (calls Python scripts)
app.post('/api/sync', async (req, res) => {
  res.json({ message: 'Sync endpoint - implement with child_process to call your Python scripts' });
});

// POST /api/fetch-grants-gov - Fetch opportunities from Grants.gov API
app.post('/api/fetch-grants-gov', async (req, res) => {
  try {
    // Build the Grants.gov API request using the new search2 endpoint
    const grantsGovUrl = 'https://api.grants.gov/v1/api/search2';

    // Calculate date range: 2 years ago to today (for posted opportunities)
    const today = new Date();
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(today.getFullYear() - 2);

    // Format dates as MM/DD/YYYY for Grants.gov API
    const formatDate = (date) => {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const year = date.getFullYear();
      return `${month}/${day}/${year}`;
    };

    // Request body based on user requirements
    // Use pipe-delimited strings for multiple values
    const requestBody = {
      fundingCategories: 'ISS|LJL',             // Income Security & Social Services, Law Justice & Legal Services (removed HL/ED to avoid irrelevant health/education grants)
      oppStatuses: 'forecasted|posted',         // Opportunity statuses: forecasted (future) OR posted
      rows: 50,                                 // Fetch more to filter down
      keyword: '"human trafficking" OR "sex trafficking" OR "domestic violence" OR "sexual assault" OR "Office on Violence Against Women" OR VAWA OR FVPSA OR "dating violence" OR stalking',  // Specific DV/trafficking keywords
      startRecordNum: 0                         // Start from first record
      // Note: Not using date filter to allow forecasted opportunities (which are future-focused)
      // The 'posted' status will naturally include recent opportunities
    };

    console.log('Fetching from Grants.gov API with body:', JSON.stringify(requestBody, null, 2));

    // Make POST request to Grants.gov API (no API key needed)
    const response = await axios.post(grantsGovUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    // The API response has a nested structure: response.data.data.oppHits
    const apiData = response.data?.data || {};

    console.log('Grants.gov API response received:', {
      status: response.status,
      totalRecords: apiData.hitCount || 0,
      oppHitsCount: apiData.oppHits?.length || 0
    });

    // FILTER OUT IRRELEVANT TOPICS
    const irrelevantKeywords = [
      'hiv', 'aids', 'pepfar', 'botswana', 'ukraine', 'sierra leone', 'namibia', 'democratic republic',
      'alzheimer', 'dementia', 'respite', 'homelessness', 'homeless', 'youth homelessness',
      'language access', 'language services', 'translation', 'educationusa',
      'substance abuse', 'opioid', 'drug', 'superfund', 'environmental',
      'tuberculosis', 'tb services', 'malaria', 'global health',
      'central america', 'kinshasa', 'haut katanga', 'wildlife trafficking', 'narcotics'
    ];

    const rawOpportunities = apiData.oppHits || [];
    const opportunities = rawOpportunities.filter(opp => {
      const searchText = `${opp.title || ''} ${opp.description || ''} ${opp.synopsis || ''} ${opp.agency || ''}`.toLowerCase();
      const hasIrrelevantContent = irrelevantKeywords.some(keyword => searchText.includes(keyword));

      if (hasIrrelevantContent) {
        console.log(`🚫 Filtered out irrelevant grant: ${opp.title}`);
        return false;
      }
      return true;
    });

    let insertedCount = 0;

    console.log(`Processing ${opportunities.length} relevant opportunities (filtered from ${rawOpportunities.length} total)...`);

    for (const opp of opportunities) {
      try {
        // Generate a unique ID using number field
        const oppId = opp.number || opp.id || Date.now();
        const id = `grantsgov-${oppId}-${Math.random().toString(36).substr(2, 9)}`;

        // DEFENSIVE: Ensure required NOT NULL fields are present
        const source = 'Grants.gov'; // Always set
        const title = opp.title || opp.opportunityTitle || 'Untitled Opportunity';
        const source_record_url = opp.number
          ? `https://www.grants.gov/search-results-detail/${opp.number}`
          : `https://www.grants.gov/`;

        // Validate before INSERT
        if (!source || source === '') {
          throw new Error('Source field cannot be empty');
        }
        if (!title || title === '') {
          throw new Error('Title field cannot be empty');
        }

        // Transform the data to match our schema
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO opportunities (
            id, source, source_record_url, title, summary, agency,
            posted_date, response_deadline, raw_data, created_at, requirements
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run([
          id,
          source,
          source_record_url,
          title,
          opp.description || opp.synopsis || '',
          opp.agency || opp.agencyCode || '',
          opp.openDate || new Date().toISOString(),
          opp.closeDate || '',
          JSON.stringify(opp),
          new Date().toISOString(),
          null
        ]);

        stmt.free();
        insertedCount++;
        console.log(`✅ Inserted: ${title}`);
      } catch (err) {
        console.error('❌ Error inserting opportunity:', err.message);
        console.error('   Opportunity data:', JSON.stringify(opp, null, 2));
      }
    }

    // Save the database after insertions
    saveDatabase();

    // Automatically process requirements for new grants (background)
    if (insertedCount > 0) {
      processNewGrantRequirements(Math.min(insertedCount, 5));
    }

    res.json({
      success: true,
      message: `Successfully fetched and inserted ${insertedCount} opportunities from Grants.gov`,
      count: insertedCount,
      totalAvailable: apiData.hitCount || 0,
      opportunities: opportunities.map(opp => ({
        id: opp.number || opp.id,
        title: opp.title,
        agency: opp.agency,
        postedDate: opp.openDate,
        closeDate: opp.closeDate
      }))
    });

  } catch (error) {
    console.error('Error fetching from Grants.gov:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to fetch from Grants.gov API',
      message: error.response?.data?.message || error.message,
      details: error.response?.data
    });
  }
});

// POST /api/fetch-grants-forecasts - Fetch FORECASTED opportunities from Grants.gov API
app.post('/api/fetch-grants-forecasts', async (req, res) => {
  try {
    const grantsGovUrl = 'https://api.grants.gov/v1/api/search2';

    // Request body targeting ONLY forecasted opportunities - HIGHLY SPECIFIC TO TRAFFICKING/DV
    const requestBody = {
      fundingCategories: 'ISS|LJL',              // Income Security & Social Services, Law Justice & Legal Services (NOT Health to avoid HIV grants)
      oppStatuses: 'forecasted',                 // ONLY forecasted opportunities
      rows: 50,                                  // Fetch more to filter down
      keyword: '"human trafficking" OR "sex trafficking" OR "domestic violence" OR "sexual assault" OR "Office on Violence Against Women" OR VAWA OR FVPSA OR "dating violence" OR stalking',
      startRecordNum: 0
    };

    console.log('📅 Fetching FORECASTED grants from Grants.gov API with body:', JSON.stringify(requestBody, null, 2));

    // Make POST request to Grants.gov API (no API key needed)
    const response = await axios.post(grantsGovUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    const apiData = response.data?.data || {};

    console.log('Grants.gov Forecasts API response:', {
      status: response.status,
      totalRecords: apiData.hitCount || 0,
      oppHitsCount: apiData.oppHits?.length || 0
    });

    // FILTER OUT IRRELEVANT TOPICS
    const irrelevantKeywords = [
      'hiv', 'aids', 'pepfar', 'botswana', 'ukraine', 'sierra leone', 'namibia', 'democratic republic',
      'alzheimer', 'dementia', 'respite', 'homelessness', 'homeless', 'youth homelessness',
      'language access', 'language services', 'translation', 'educationusa',
      'substance abuse', 'opioid', 'drug', 'superfund', 'environmental',
      'tuberculosis', 'tb services', 'malaria', 'global health',
      'central america', 'kinshasa', 'haut katanga'
    ];

    const rawOpportunities = apiData.oppHits || [];
    const opportunities = rawOpportunities.filter(opp => {
      const searchText = `${opp.title || ''} ${opp.description || ''} ${opp.synopsis || ''} ${opp.agency || ''}`.toLowerCase();
      const hasIrrelevantContent = irrelevantKeywords.some(keyword => searchText.includes(keyword));

      if (hasIrrelevantContent) {
        console.log(`🚫 Filtered out irrelevant forecast: ${opp.title}`);
        return false;
      }
      return true;
    });

    let insertedCount = 0;

    console.log(`Processing ${opportunities.length} relevant forecasted opportunities (filtered from ${rawOpportunities.length} total)...`);

    for (const opp of opportunities) {
      try {
        // Generate a unique ID using number field
        const oppId = opp.number || opp.id || Date.now();
        const id = `forecast-${oppId}-${Math.random().toString(36).substr(2, 9)}`;

        // DEFENSIVE: Ensure required NOT NULL fields are present
        const source = 'Grants.gov Forecast';
        const title = opp.title || opp.opportunityTitle || 'Untitled Forecast';
        const source_record_url = opp.number
          ? `https://www.grants.gov/search-results-detail/${opp.number}`
          : `https://www.grants.gov/`;

        // Validate before INSERT
        if (!source || source === '') {
          throw new Error('Source field cannot be empty');
        }
        if (!title || title === '') {
          throw new Error('Title field cannot be empty');
        }

        // Transform the data to match our schema
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO opportunities (
            id, source, source_record_url, title, summary, agency,
            posted_date, response_deadline, raw_data, created_at, requirements
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run([
          id,
          source,
          source_record_url,
          title,
          opp.description || opp.synopsis || '',
          opp.agency || opp.agencyCode || '',
          opp.estimatedOpenDate || opp.openDate || '',  // Forecasts have estimated open date
          opp.estimatedCloseDate || opp.closeDate || '',  // Forecasts have estimated close date
          JSON.stringify(opp),
          new Date().toISOString(),
          null
        ]);

        stmt.free();
        insertedCount++;
        console.log(`✅ Inserted forecast: ${title}`);
      } catch (err) {
        console.error('❌ Error inserting forecasted opportunity:', err.message);
        console.error('   Opportunity data:', JSON.stringify(opp, null, 2));
      }
    }

    // Save the database after insertions
    saveDatabase();

    // Automatically process requirements for new grants (background)
    if (insertedCount > 0) {
      processNewGrantRequirements(Math.min(insertedCount, 5));
    }

    res.json({
      success: true,
      message: `Successfully fetched and inserted ${insertedCount} forecasted opportunities from Grants.gov`,
      count: insertedCount,
      totalAvailable: apiData.hitCount || 0,
      opportunities: opportunities.map(opp => ({
        id: opp.number || opp.id,
        title: opp.title,
        agency: opp.agency,
        estimatedOpenDate: opp.estimatedOpenDate,
        estimatedCloseDate: opp.estimatedCloseDate
      }))
    });

  } catch (error) {
    console.error('Error fetching forecasts from Grants.gov:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to fetch forecasts from Grants.gov API',
      message: error.response?.data?.message || error.message,
      details: error.response?.data
    });
  }
});

// POST /api/fetch-hud-grants - Fetch HUD housing grants from Grants.gov API
app.post('/api/fetch-hud-grants', async (req, res) => {
  try {
    const grantsGovUrl = 'https://api.grants.gov/v1/api/search2';

    // Request body targeting HUD grants related to housing/homelessness/trafficking
    const requestBody = {
      agencies: 'HUD',                               // Department of Housing and Urban Development
      oppStatuses: 'forecasted|posted',              // Both forecasted and posted
      rows: 25,
      keyword: '"domestic violence" OR "sexual assault" OR trafficking OR "transitional housing" OR homeless OR "supportive housing" OR VAWA',
      startRecordNum: 0
    };

    console.log('🏘️  Fetching HUD grants from Grants.gov API with body:', JSON.stringify(requestBody, null, 2));

    const response = await axios.post(grantsGovUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    const apiData = response.data?.data || {};

    console.log('Grants.gov HUD API response:', {
      status: response.status,
      totalRecords: apiData.hitCount || 0,
      oppHitsCount: apiData.oppHits?.length || 0
    });

    const rawOpportunities = apiData.oppHits || [];

    // FILTER OUT TRIBAL-SPECIFIC AND IRRELEVANT GRANTS
    const tribalKeywords = [
      'indian', 'tribal', 'tribe', 'native american', 'alaska native',
      'native village', 'indigenous', 'native hawaiian', 'aboriginal'
    ];

    const opportunities = rawOpportunities.filter(opp => {
      const searchText = `${opp.title || ''} ${opp.description || ''} ${opp.synopsis || ''}`.toLowerCase();

      // Check for tribal-specific content
      const hasTribalContent = tribalKeywords.some(keyword => searchText.includes(keyword));

      if (hasTribalContent) {
        console.log(`🚫 Filtered out tribal-specific HUD grant: ${opp.title}`);
        return false;
      }

      return true;
    });

    let insertedCount = 0;

    console.log(`Processing ${opportunities.length} relevant HUD opportunities (filtered from ${rawOpportunities.length})...`);

    for (const opp of opportunities) {
      try {
        const oppId = opp.number || opp.id || Date.now();
        const id = `hud-${oppId}-${Math.random().toString(36).substr(2, 9)}`;

        const source = 'Grants.gov HUD';
        const title = opp.title || opp.opportunityTitle || 'Untitled HUD Grant';
        const source_record_url = opp.number
          ? `https://www.grants.gov/search-results-detail/${opp.number}`
          : `https://www.grants.gov/`;

        if (!source || source === '') {
          throw new Error('Source field cannot be empty');
        }
        if (!title || title === '') {
          throw new Error('Title field cannot be empty');
        }

        const stmt = db.prepare(`
          INSERT OR REPLACE INTO opportunities (
            id, source, source_record_url, title, summary, agency,
            posted_date, response_deadline, raw_data, created_at, requirements
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run([
          id,
          source,
          source_record_url,
          title,
          opp.description || opp.synopsis || '',
          opp.agency || opp.agencyCode || 'HUD',
          opp.openDate || opp.estimatedOpenDate || '',
          opp.closeDate || opp.estimatedCloseDate || '',
          JSON.stringify(opp),
          new Date().toISOString(),
          null
        ]);

        stmt.free();
        insertedCount++;
        console.log(`✅ Inserted HUD grant: ${title}`);
      } catch (err) {
        console.error('❌ Error inserting HUD opportunity:', err.message);
        console.error('   Opportunity data:', JSON.stringify(opp, null, 2));
      }
    }

    saveDatabase();

    // Automatically process requirements for new grants (background)
    if (insertedCount > 0) {
      processNewGrantRequirements(Math.min(insertedCount, 5));
    }

    res.json({
      success: true,
      message: `Successfully fetched and inserted ${insertedCount} HUD grant opportunities from Grants.gov`,
      count: insertedCount,
      totalAvailable: apiData.hitCount || 0,
      opportunities: opportunities.map(opp => ({
        id: opp.number || opp.id,
        title: opp.title,
        agency: opp.agency,
        openDate: opp.openDate || opp.estimatedOpenDate,
        closeDate: opp.closeDate || opp.estimatedCloseDate
      }))
    });

  } catch (error) {
    console.error('Error fetching HUD grants from Grants.gov:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to fetch HUD grants from Grants.gov API',
      message: error.response?.data?.message || error.message,
      details: error.response?.data
    });
  }
});

// POST /api/fetch-samhsa-grants - Fetch SAMHSA behavioral health grants from Grants.gov API
app.post('/api/fetch-samhsa-grants', async (req, res) => {
  try {
    const grantsGovUrl = 'https://api.grants.gov/v1/api/search2';

    // Request body targeting SAMHSA grants related to trauma/violence/mental health
    const requestBody = {
      agencies: 'HHS-SAMHSA',                        // SAMHSA agency code
      oppStatuses: 'forecasted|posted',              // Both forecasted and posted
      rows: 25,
      keyword: 'trauma OR violence OR "domestic violence" OR "sexual assault" OR trafficking OR "victim services" OR "mental health"',
      startRecordNum: 0
    };

    console.log('🧠 Fetching SAMHSA grants from Grants.gov API with body:', JSON.stringify(requestBody, null, 2));

    const response = await axios.post(grantsGovUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    const apiData = response.data?.data || {};

    console.log('Grants.gov SAMHSA API response:', {
      status: response.status,
      totalRecords: apiData.hitCount || 0,
      oppHitsCount: apiData.oppHits?.length || 0
    });

    const opportunities = apiData.oppHits || [];
    let insertedCount = 0;

    console.log(`Processing ${opportunities.length} SAMHSA opportunities...`);

    for (const opp of opportunities) {
      try {
        const oppId = opp.number || opp.id || Date.now();
        const id = `samhsa-${oppId}-${Math.random().toString(36).substr(2, 9)}`;

        const source = 'Grants.gov SAMHSA';
        const title = opp.title || opp.opportunityTitle || 'Untitled SAMHSA Grant';
        const source_record_url = opp.number
          ? `https://www.grants.gov/search-results-detail/${opp.number}`
          : `https://www.grants.gov/`;

        if (!source || source === '') {
          throw new Error('Source field cannot be empty');
        }
        if (!title || title === '') {
          throw new Error('Title field cannot be empty');
        }

        const stmt = db.prepare(`
          INSERT OR REPLACE INTO opportunities (
            id, source, source_record_url, title, summary, agency,
            posted_date, response_deadline, raw_data, created_at, requirements
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run([
          id,
          source,
          source_record_url,
          title,
          opp.description || opp.synopsis || '',
          opp.agency || opp.agencyCode || 'SAMHSA',
          opp.openDate || opp.estimatedOpenDate || '',
          opp.closeDate || opp.estimatedCloseDate || '',
          JSON.stringify(opp),
          new Date().toISOString(),
          null
        ]);

        stmt.free();
        insertedCount++;
        console.log(`✅ Inserted SAMHSA grant: ${title}`);
      } catch (err) {
        console.error('❌ Error inserting SAMHSA opportunity:', err.message);
        console.error('   Opportunity data:', JSON.stringify(opp, null, 2));
      }
    }

    saveDatabase();

    // Automatically process requirements for new grants (background)
    if (insertedCount > 0) {
      processNewGrantRequirements(Math.min(insertedCount, 5));
    }

    res.json({
      success: true,
      message: `Successfully fetched and inserted ${insertedCount} SAMHSA grant opportunities from Grants.gov`,
      count: insertedCount,
      totalAvailable: apiData.hitCount || 0,
      opportunities: opportunities.map(opp => ({
        id: opp.number || opp.id,
        title: opp.title,
        agency: opp.agency,
        openDate: opp.openDate || opp.estimatedOpenDate,
        closeDate: opp.closeDate || opp.estimatedCloseDate
      }))
    });

  } catch (error) {
    console.error('Error fetching SAMHSA grants from Grants.gov:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to fetch SAMHSA grants from Grants.gov API',
      message: error.response?.data?.message || error.message,
      details: error.response?.data
    });
  }
});

// POST /api/scrape-florida-dcf - Scrape Florida DCF domestic violence grants
app.post('/api/scrape-florida-dcf', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.body?.limit) || 20, 50));
    const location = req.body?.location?.trim() || 'Jacksonville, FL';

    console.log('🏛️  Scraping Florida DCF grants:', { limit, location });

    // Call the Florida DCF scraper
    const opportunities = await scrapeFloridaDCFGrants({ limit, location });

    console.log(`   Scraped ${opportunities.length} Florida DCF grants`);

    // Insert into database
    const inserted = await insertOpportunitiesIntoDb(opportunities);

    res.json({
      success: true,
      message: `Successfully scraped and inserted ${inserted} Florida DCF grant opportunities`,
      count: inserted,
      grants: opportunities.map(opp => ({
        title: opp.title,
        source: opp.source,
        deadline: opp.response_deadline,
        url: opp.source_record_url
      }))
    });

  } catch (error) {
    console.error('❌ Error scraping Florida DCF grants:', error);
    res.status(500).json({
      error: 'Failed to scrape Florida DCF grants',
      message: error.message,
      stack: error.stack
    });
  }
});

// POST /api/scrape-jax-foundation - Scrape Community Foundation for NE Florida grants
app.post('/api/scrape-jax-foundation', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.body?.limit) || 10, 20));
    const location = req.body?.location?.trim() || 'Jacksonville, FL';

    console.log('🏦 Scraping Jacksonville Foundation grants:', { limit, location });

    // Call the Jacksonville Foundation scraper
    const opportunities = await scrapeJaxFoundationGrants({ limit, location });

    console.log(`   Scraped ${opportunities.length} foundation grants`);

    // Insert into database
    const inserted = await insertOpportunitiesIntoDb(opportunities);

    res.json({
      success: true,
      message: `Successfully scraped and inserted ${inserted} foundation grant opportunities`,
      count: inserted,
      grants: opportunities.map(opp => ({
        title: opp.title,
        source: opp.source,
        deadline: opp.response_deadline,
        url: opp.source_record_url
      }))
    });

  } catch (error) {
    console.error('❌ Error scraping Jacksonville Foundation grants:', error);
    res.status(500).json({
      error: 'Failed to scrape Jacksonville Foundation grants',
      message: error.message,
      stack: error.stack
    });
  }
});

// POST /api/scrape-local-grants - Web scrape local Jacksonville/NE Florida grants
app.post('/api/scrape-local-grants', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.body?.limit) || 2, 5));
    const location = req.body?.location?.trim() || 'Jacksonville, FL';

    console.log('🔍 Scraping local grants:', { limit, location });

    const csvIndex = readCsvIndex(csvPath);
    const dbIndex = getDbIndex();
    const dedupeSets = {
      urlSet: new Set([...csvIndex.urlSet, ...dbIndex.urlSet]),
      keySet: new Set([...csvIndex.keySet, ...dbIndex.keySet]),
    };

    const candidates = await collectLocalOpportunities({ location, dedupeSets, limit });
    console.log(`   Found ${candidates.length} candidates`);

    const selected = selectTopOpportunities(candidates, limit);
    console.log(`   Selected ${selected.length} top opportunities`);

    let saved = [];
    if (selected.length) {
      console.log('   Before hydration - sample record:', JSON.stringify(selected[0], null, 2));
      saved = selected.map(hydrateRecord);
      console.log('   After hydration - sample record:', JSON.stringify(saved[0], null, 2));

      // Validate all records have required fields
      for (let i = 0; i < saved.length; i++) {
        const record = saved[i];
        if (!record.source || record.source === '') {
          console.error(`❌ Record ${i} missing source field!`, JSON.stringify(record, null, 2));
          throw new Error(`Record ${i} is missing required 'source' field: ${record.title}`);
        }
        if (!record.title || record.title === '') {
          console.error(`❌ Record ${i} missing title field!`, JSON.stringify(record, null, 2));
          throw new Error(`Record ${i} is missing required 'title' field`);
        }
      }

      console.log('   ✅ All records validated - proceeding with save');
      appendCsvRows(csvPath, saved);
      insertOpportunitiesIntoDb(saved);
      saveDatabase();
      console.log(`   ✅ Successfully saved ${saved.length} opportunities`);
    }

    res.json({
      success: true,
      count: saved.length,
      message: saved.length
        ? `Found ${saved.length} local opportunities`
        : 'No new local opportunities found',
      grants: saved.map((grant) => ({
        title: grant.title,
        url: grant.source_record_url,
        source: grant.source,
        deadline: grant.response_deadline,
        relevanceScore: grant.relevance_score,
      })),
      opportunities: saved,
    });
  } catch (error) {
    console.error('❌ Error scraping local grants:', error);
    console.error('   Stack trace:', error.stack);
    res.status(500).json({
      error: 'Failed to scrape local grants',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// POST /api/scrape-ovw - Scrape DOJ Office on Violence Against Women grants
app.post('/api/scrape-ovw', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.body?.limit) || 20, 50));
    const location = req.body?.location?.trim() || 'Jacksonville, FL';

    console.log('🔍 Scraping OVW grants:', { limit, location });

    // Call the OVW scraper
    const opportunities = await scrapeOVWGrants({ limit, location });
    console.log(`   Found ${opportunities.length} OVW opportunities`);

    // Deduplicate and save to database
    const csvIndex = readCsvIndex(csvPath);
    const dbIndex = getDbIndex();
    const dedupeSets = {
      urlSet: new Set([...csvIndex.urlSet, ...dbIndex.urlSet]),
      keySet: new Set([...csvIndex.keySet, ...dbIndex.keySet]),
    };

    // Filter out duplicates
    const newOpportunities = opportunities.filter(opp =>
      !shouldSkipOpportunity(opp, dedupeSets)
    );
    console.log(`   After deduplication: ${newOpportunities.length} new opportunities`);

    let saved = [];
    if (newOpportunities.length) {
      // Hydrate records
      saved = newOpportunities.map(hydrateRecord);

      // Validate all records
      for (let i = 0; i < saved.length; i++) {
        const record = saved[i];
        if (!record.source || record.source === '') {
          console.error(`❌ Record ${i} missing source field!`, JSON.stringify(record, null, 2));
          throw new Error(`Record ${i} is missing required 'source' field: ${record.title}`);
        }
        if (!record.title || record.title === '') {
          console.error(`❌ Record ${i} missing title field!`, JSON.stringify(record, null, 2));
          throw new Error(`Record ${i} is missing required 'title' field`);
        }
      }

      // Save to database
      console.log('   ✅ All records validated - proceeding with save');
      appendCsvRows(csvPath, saved);
      insertOpportunitiesIntoDb(saved);
      saveDatabase();
      console.log(`   ✅ Successfully saved ${saved.length} OVW opportunities`);
    }

    res.json({
      success: true,
      count: saved.length,
      message: saved.length
        ? `Found ${saved.length} new OVW grant opportunities`
        : 'No new OVW opportunities found (may be duplicates or filtered)',
      grants: saved.map(grant => ({
        title: grant.title,
        url: grant.source_record_url,
        source: grant.source,
        deadline: grant.response_deadline,
        amount: grant.award_amount,
        relevanceScore: grant.relevance_score,
      })),
      opportunities: saved,
    });
  } catch (error) {
    console.error('❌ Error scraping OVW grants:', error);
    console.error('   Stack trace:', error.stack);
    res.status(500).json({
      error: 'Failed to scrape OVW grants',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// POST /api/scrape-acf - Scrape HHS ACF OFVPS grants
app.post('/api/scrape-acf', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.body?.limit) || 20, 50));
    const location = req.body?.location?.trim() || 'Jacksonville, FL';

    console.log('🔍 Scraping ACF grants:', { limit, location });

    // Call the ACF scraper
    const opportunities = await scrapeACFGrants({ limit, location });
    console.log(`   Found ${opportunities.length} ACF opportunities`);

    // Deduplicate and save to database
    const csvIndex = readCsvIndex(csvPath);
    const dbIndex = getDbIndex();
    const dedupeSets = {
      urlSet: new Set([...csvIndex.urlSet, ...dbIndex.urlSet]),
      keySet: new Set([...csvIndex.keySet, ...dbIndex.keySet]),
    };

    // Filter out duplicates
    const newOpportunities = opportunities.filter(opp =>
      !shouldSkipOpportunity(opp, dedupeSets)
    );
    console.log(`   After deduplication: ${newOpportunities.length} new opportunities`);

    let saved = [];
    if (newOpportunities.length) {
      // Hydrate records
      saved = newOpportunities.map(hydrateRecord);

      // Validate all records
      for (let i = 0; i < saved.length; i++) {
        const record = saved[i];
        if (!record.source || record.source === '') {
          console.error(`❌ Record ${i} missing source field!`, JSON.stringify(record, null, 2));
          throw new Error(`Record ${i} is missing required 'source' field: ${record.title}`);
        }
        if (!record.title || record.title === '') {
          console.error(`❌ Record ${i} missing title field!`, JSON.stringify(record, null, 2));
          throw new Error(`Record ${i} is missing required 'title' field`);
        }
      }

      // Save to database
      console.log('   ✅ All records validated - proceeding with save');
      appendCsvRows(csvPath, saved);
      insertOpportunitiesIntoDb(saved);
      saveDatabase();
      console.log(`   ✅ Successfully saved ${saved.length} ACF opportunities`);
    }

    res.json({
      success: true,
      count: saved.length,
      message: saved.length
        ? `Found ${saved.length} new ACF grant opportunities`
        : 'No new ACF opportunities found (may be duplicates or filtered)',
      grants: saved.map(grant => ({
        title: grant.title,
        url: grant.source_record_url,
        source: grant.source,
        deadline: grant.response_deadline,
        amount: grant.award_amount,
        relevanceScore: grant.relevance_score,
      })),
      opportunities: saved,
    });
  } catch (error) {
    console.error('❌ Error scraping ACF grants:', error);
    console.error('   Stack trace:', error.stack);
    res.status(500).json({
      error: 'Failed to scrape ACF grants',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// POST /api/fetch-usaspending - Fetch grant awards from USASpending.gov API
app.post('/api/fetch-usaspending', async (req, res) => {
  try {
    const usaspendingUrl = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';

    // Calculate date range: last 18 months
    const today = new Date();
    const eighteenMonthsAgo = new Date();
    eighteenMonthsAgo.setMonth(today.getMonth() - 18);

    // Format dates as YYYY-MM-DD for USASpending API
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Request body for grant awards - using very specific keywords
    const requestBody = {
      filters: {
        award_type_codes: ['02', '03', '04', '05'],  // Grant award codes
        time_period: [{
          start_date: formatDate(eighteenMonthsAgo),
          end_date: formatDate(today)
        }],
        keywords: [
          'domestic violence', 'sexual assault', 'VAWA',
          'Office on Violence Against Women', 'FVPSA',
          'Violence Against Women Act', 'dating violence'
        ]
      },
      fields: [
        'Award ID', 'Recipient Name', 'Start Date', 'End Date',
        'Award Amount', 'Awarding Agency', 'Awarding Sub Agency',
        'Description', 'Place of Performance City Name',
        'Place of Performance State Code', 'Place of Performance Zip',
        'Place of Performance Country Name'
      ],
      page: 1,
      limit: 50,  // Reduced from 100
      order: 'desc',
      sort: 'Award Amount'
    };

    console.log('💰 Fetching from USASpending.gov API...');
    console.log(`   Date range: ${formatDate(eighteenMonthsAgo)} to ${formatDate(today)}`);

    // Make POST request to USASpending API (no API key needed)
    const response = await axios.post(usaspendingUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    const apiData = response.data || {};
    console.log('USASpending API response:', {
      status: response.status,
      totalRecords: apiData.page_metadata?.total || 0,
      resultsCount: apiData.results?.length || 0
    });

    // FILTER OUT IRRELEVANT TOPICS - expanded list
    const irrelevantKeywords = [
      'hiv', 'aids', 'pepfar', 'botswana', 'ukraine', 'sierra leone', 'namibia',
      'alzheimer', 'dementia', 'respite', 'homelessness', 'homeless', 'housing first',
      'language access', 'translation', 'substance abuse', 'opioid', 'drug', 'addiction',
      'environmental', 'tuberculosis', 'malaria', 'global health', 'pandemic',
      'wildlife trafficking', 'narcotics', 'arms trafficking', 'drug trafficking',
      'veterans', 'veteran', 'tribal', 'native american', 'indian',
      'mental health', 'behavioral health', 'suicide', 'psychiatric',
      'covid', 'coronavirus', 'vaccine', 'immunization',
      'refugee', 'asylum', 'immigration', 'migrant',
      'central america', 'guatemala', 'el salvador', 'honduras'
    ];

    const rawResults = apiData.results || [];
    const filteredResults = rawResults.filter(award => {
      const searchText = `${award['Recipient Name'] || ''} ${award['Description'] || ''} ${award['Awarding Agency'] || ''}`.toLowerCase();

      // Check for irrelevant content
      const hasIrrelevantContent = irrelevantKeywords.some(keyword => searchText.includes(keyword));
      if (hasIrrelevantContent) {
        console.log(`🚫 Filtered out irrelevant award: ${award['Recipient Name']}`);
        return false;
      }

      // Require at least one relevant keyword
      const relevantKeywords = ['domestic violence', 'sexual assault', 'vawa', 'fvpsa', 'dating violence', 'stalking', 'violence against women'];
      const hasRelevantContent = relevantKeywords.some(keyword => searchText.includes(keyword));
      if (!hasRelevantContent) {
        console.log(`🚫 Filtered out (no DV keywords): ${award['Recipient Name']}`);
        return false;
      }

      return true;
    });

    let insertedCount = 0;
    console.log(`Processing ${filteredResults.length} relevant awards (filtered from ${rawResults.length} total)...`);

    for (const award of filteredResults) {
      try {
        const awardId = award['Award ID'] || '';
        const id = `usaspending-${awardId.replace(/[^a-zA-Z0-9]/g, '-')}`;

        // DEFENSIVE: Ensure required fields
        const source = 'USASpending';
        const title = `${award['Recipient Name'] || 'Unknown Recipient'} - ${award['Awarding Agency'] || 'Grant'}`;
        const source_record_url = `https://www.usaspending.gov/award/${awardId}`;

        if (!source || !title) {
          throw new Error('Missing required fields');
        }

        // Insert into database
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO opportunities (
            id, source, source_record_url, title, summary, agency,
            posted_date, response_deadline, pop_city, pop_state, pop_zip, pop_country,
            award_number, award_amount, award_date, award_awardee,
            raw_data, created_at, requirements
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run([
          id,
          source,
          source_record_url,
          title,
          award['Description'] || '',
          award['Awarding Agency'] || award['Awarding Sub Agency'] || '',
          award['Start Date'] || new Date().toISOString(),
          award['End Date'] || '',
          award['Place of Performance City Name'] || '',
          award['Place of Performance State Code'] || '',
          award['Place of Performance Zip'] || '',
          award['Place of Performance Country Name'] || 'USA',
          awardId,
          award['Award Amount'] || 0,
          award['Start Date'] || '',
          award['Recipient Name'] || '',
          JSON.stringify(award),
          new Date().toISOString(),
          null
        ]);

        stmt.free();
        insertedCount++;
        console.log(`✅ Inserted: ${title.substring(0, 80)}...`);
      } catch (err) {
        console.error('❌ Error inserting award:', err.message);
      }
    }

    saveDatabase();

    res.json({
      success: true,
      message: `Successfully fetched and inserted ${insertedCount} awards from USASpending.gov`,
      count: insertedCount,
      totalAvailable: apiData.page_metadata?.total || 0,
      awards: filteredResults.slice(0, 10).map(award => ({
        id: award['Award ID'],
        recipient: award['Recipient Name'],
        agency: award['Awarding Agency'],
        amount: award['Award Amount'],
        startDate: award['Start Date']
      }))
    });

  } catch (error) {
    console.error('Error fetching from USASpending.gov:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to fetch from USASpending.gov API',
      message: error.response?.data?.message || error.message
    });
  }
});

// POST /api/fetch-sam - Fetch contract opportunities from SAM.gov API
app.post('/api/fetch-sam', async (req, res) => {
  try {
    const samApiKey = process.env.SAM_API_KEY;

    if (!samApiKey || samApiKey.trim() === '') {
      return res.status(400).json({
        error: 'SAM.gov API key not configured',
        message: 'Please add your SAM_API_KEY to the .env file. Get your API key from: https://open.gsa.gov/api/opportunities-api/'
      });
    }

    const samUrl = 'https://api.sam.gov/opportunities/v2/search';

    // Calculate date range: last 18 months
    const today = new Date();
    const eighteenMonthsAgo = new Date();
    eighteenMonthsAgo.setMonth(today.getMonth() - 18);

    // Format dates as MM/DD/YYYY for SAM API
    const formatDate = (date) => {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const year = date.getFullYear();
      return `${month}/${day}/${year}`;
    };

    // Query parameters - PostedFrom and PostedTo are mandatory
    const params = {
      postedFrom: formatDate(eighteenMonthsAgo),
      postedTo: formatDate(today),
      limit: 100,
      offset: 0,
      ptype: 'g'  // 'g' = grants/assistance (not contracts)
    };

    console.log('🏛️  Fetching from SAM.gov API with params:', params);

    // Make GET request to SAM API with API key in header
    const response = await axios.get(samUrl, {
      params,
      headers: {
        'X-Api-Key': samApiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    const apiData = response.data || {};
    console.log('SAM.gov API response:', {
      status: response.status,
      totalRecords: apiData.totalRecords || 0,
      resultsCount: apiData.opportunitiesData?.length || 0
    });

    // FILTER FOR RELEVANT OPPORTUNITIES - two-stage filter
    const irrelevantKeywords = [
      'hiv', 'aids', 'pepfar', 'botswana', 'ukraine', 'sierra leone', 'namibia',
      'alzheimer', 'dementia', 'respite', 'homelessness', 'homeless', 'housing first',
      'language access', 'translation', 'substance abuse', 'opioid', 'drug', 'addiction',
      'environmental', 'tuberculosis', 'malaria', 'global health', 'pandemic',
      'wildlife trafficking', 'narcotics', 'arms trafficking', 'drug trafficking',
      'veterans', 'veteran', 'tribal', 'native american', 'indian',
      'mental health', 'behavioral health', 'suicide', 'psychiatric',
      'covid', 'coronavirus', 'vaccine', 'immunization',
      'refugee', 'asylum', 'immigration', 'migrant',
      'central america', 'guatemala', 'el salvador', 'honduras',
      'construction', 'infrastructure', 'engineering', 'architect'
    ];

    const relevantKeywords = [
      'domestic violence', 'sexual assault', 'vawa',
      'violence against women', 'dating violence', 'stalking',
      'fvpsa', 'intimate partner violence', 'human trafficking victims',
      'sex trafficking victims', 'victim services', 'survivor services'
    ];

    const rawOpportunities = apiData.opportunitiesData || [];

    // Filter opportunities for relevance (date filtering handled by API params)
    const filteredOpportunities = rawOpportunities.filter(opp => {
      const searchText = `${opp.title || ''} ${opp.description || ''} ${opp.synopsis || ''}`.toLowerCase();

      // First filter: exclude irrelevant topics
      const hasIrrelevantContent = irrelevantKeywords.some(keyword => searchText.includes(keyword));
      if (hasIrrelevantContent) {
        console.log(`🚫 Filtered out irrelevant: ${opp.title}`);
        return false;
      }

      // Second filter: require at least one relevant keyword
      const isRelevant = relevantKeywords.some(keyword => searchText.includes(keyword.toLowerCase()));
      if (!isRelevant) {
        console.log(`🚫 Filtered out (no DV keywords): ${opp.title}`);
        return false;
      }

      return true;
    });

    let insertedCount = 0;
    console.log(`Processing ${filteredOpportunities.length} relevant opportunities (filtered from ${rawOpportunities.length} total)...`);

    for (const opp of filteredOpportunities) {
      try {
        const solicitationNumber = opp.solicitationNumber || '';
        const id = `sam-${solicitationNumber.replace(/[^a-zA-Z0-9]/g, '-')}`;

        // DEFENSIVE: Ensure required fields
        const source = 'SAM.gov';
        const title = opp.title || 'Untitled Opportunity';
        const source_record_url = opp.uiLink || `https://sam.gov/opp/${solicitationNumber}`;

        if (!source || !title) {
          throw new Error('Missing required fields');
        }

        // Extract point of contact
        const poc = opp.pointOfContact?.[0] || {};
        const placeOfPerformance = opp.placeOfPerformance || {};

        // Insert into database
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO opportunities (
            id, source, source_record_url, title, summary, agency,
            posted_date, response_deadline, naics, psc, set_aside,
            pop_city, pop_state, pop_zip, pop_country,
            poc_name, poc_email, poc_phone, award_number,
            raw_data, created_at, requirements
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run([
          id,
          source,
          source_record_url,
          title,
          opp.description || opp.synopsis || '',
          opp.organizationName || opp.fullParentPathName || '',
          opp.postedDate || new Date().toISOString(),
          opp.responseDeadLine || '',
          opp.naicsCode || '',
          opp.classificationCode || '',
          opp.setAsideCode || opp.setAside || '',
          placeOfPerformance.city || '',
          placeOfPerformance.state || '',
          placeOfPerformance.zip || '',
          placeOfPerformance.country || 'USA',
          poc.fullName || poc.name || '',
          poc.email || '',
          poc.phone || '',
          solicitationNumber,
          JSON.stringify(opp),
          new Date().toISOString(),
          null
        ]);

        stmt.free();
        insertedCount++;
        console.log(`✅ Inserted: ${title.substring(0, 80)}...`);
      } catch (err) {
        console.error('❌ Error inserting opportunity:', err.message);
      }
    }

    saveDatabase();

    // Automatically process requirements for new grants (background)
    if (insertedCount > 0) {
      processNewGrantRequirements(Math.min(insertedCount, 5));
    }

    res.json({
      success: true,
      message: `Successfully fetched and inserted ${insertedCount} opportunities from SAM.gov`,
      count: insertedCount,
      totalAvailable: apiData.totalRecords || 0,
      opportunities: filteredOpportunities.slice(0, 10).map(opp => ({
        id: opp.solicitationNumber,
        title: opp.title,
        agency: opp.organizationName,
        postedDate: opp.postedDate,
        deadline: opp.responseDeadLine
      }))
    });

  } catch (error) {
    console.error('❌ SAM.gov API Error Details:');
    console.error('   Status:', error.response?.status);
    console.error('   Status Text:', error.response?.statusText);
    console.error('   Error Data:', JSON.stringify(error.response?.data, null, 2));
    console.error('   Error Message:', error.message);
    console.error('   Request URL:', samUrl);
    console.error('   Request Params:', JSON.stringify(params, null, 2));

    // Handle rate limiting
    if (error.response?.status === 429) {
      return res.status(429).json({
        error: 'SAM.gov API rate limit exceeded',
        message: 'Please wait a few minutes before trying again',
        nextAccessTime: error.response?.data?.nextAccessTime
      });
    }

    // Handle 400 errors specifically
    if (error.response?.status === 400) {
      return res.status(400).json({
        error: 'SAM.gov API Bad Request',
        message: error.response?.data?.errorMessage || error.response?.data?.message || 'Invalid request parameters. The SAM.gov API may have changed or your API key may be invalid.',
        details: error.response?.data
      });
    }

    res.status(500).json({
      error: 'Failed to fetch from SAM.gov API',
      message: error.response?.data?.message || error.message,
      details: error.response?.data
    });
  }
});

// Clear all opportunities (admin endpoint)
app.post('/api/admin/clear-all', (req, res) => {
  try {
    // Count records before deleting
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM opportunities');
    const result = countStmt.getAsObject();
    const deletedCount = result.count || 0;

    // Delete all records
    db.run('DELETE FROM opportunities');

    // Save database
    saveDatabase();

    console.log(`🗑️  Deleted ${deletedCount} opportunities from database`);

    res.json({
      success: true,
      message: `Successfully deleted ${deletedCount} opportunities`,
      deletedCount
    });
  } catch (error) {
    console.error('Error clearing database:', error);
    res.status(500).json({
      error: 'Failed to clear database',
      message: error.message
    });
  }
});

// POST /api/send-email - send recent opportunities by email
app.post('/api/send-email', async (req, res) => {
  try {
    const { recipients, limit = 10 } = req.body || {};

    // Normalize recipients
    let recips = [];
    if (Array.isArray(recipients)) recips = recipients.map(r => String(r).trim()).filter(Boolean);
    else if (typeof recipients === 'string') recips = recipients.split(',').map(r => r.trim()).filter(Boolean);

    if (!recips.length) {
      return res.status(400).json({ error: 'No recipient email addresses provided. Provide a comma-separated string or an array of emails in `recipients`.' });
    }

    // Require SMTP configuration
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !FROM_EMAIL) {
      return res.status(400).json({ error: 'SMTP configuration missing. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and FROM_EMAIL in your .env.' });
    }

    // Fetch recent opportunities from DB
    const stmt = db.prepare('SELECT id, title, agency, source_record_url, posted_date, response_deadline FROM opportunities ORDER BY posted_date DESC LIMIT ?');
    stmt.bind([limit]);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();

    if (!rows.length) {
      return res.json({ success: true, message: 'No opportunities to email.' });
    }

    // Build email content
    const htmlList = rows.map(r => `
      <li style="margin-bottom:12px">
        <strong>${r.title || 'Untitled'}</strong><br/>
        ${r.agency ? `<em>${r.agency}</em><br/>` : ''}
        Deadline: ${r.response_deadline || r.posted_date || 'N/A'}<br/>
        ${r.source_record_url ? `<a href="${r.source_record_url}">${r.source_record_url}</a>` : ''}
      </li>
    `).join('');

    const html = `
      <div>
        <h2>Recent grant opportunities (${rows.length})</h2>
        <ul style="list-style: none; padding: 0;">${htmlList}</ul>
        <p>Generated by Villages of Hope grants tool</p>
      </div>
    `;

    const text = rows.map(r => `${r.title || 'Untitled'} - ${r.agency || ''}\nDeadline: ${r.response_deadline || r.posted_date || 'N/A'}\n${r.source_record_url || ''}\n`).join('\n');

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT ? parseInt(SMTP_PORT, 10) : 587,
      secure: SMTP_PORT && parseInt(SMTP_PORT, 10) === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: FROM_EMAIL,
      to: recips.join(', '),
      subject: `Recent grant opportunities (${rows.length})`,
      text,
      html,
    });

    return res.json({ success: true, message: 'Email sent', info });
  } catch (error) {
    console.error('Error sending email:', error);
    return res.status(500).json({ error: error.message || 'Failed to send email' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// POST /api/test-data - Add sample opportunities for testing
app.post('/api/test-data', (req, res) => {
  try {
    const sampleOpportunities = [
      {
        id: `test-1-${Date.now()}`,
        title: 'Domestic Violence Prevention Grant',
        agency: 'Office on Violence Against Women',
        source: 'Test Data',
        source_record_url: 'https://www.grants.gov/',
        posted_date: new Date().toISOString(),
        response_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        summary: 'Grant for supporting domestic violence survivors and prevention programs.',
        award_amount: 250000
      },
      {
        id: `test-2-${Date.now()}`,
        title: 'Sex Trafficking Victim Services',
        agency: 'Department of Justice',
        source: 'Test Data',
        source_record_url: 'https://www.grants.gov/',
        posted_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        response_deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
        summary: 'Funding for organizations providing services to victims of sex trafficking.',
        award_amount: 500000
      },
      {
        id: `test-3-${Date.now()}`,
        title: 'Housing Support for Survivors',
        agency: 'HUD',
        source: 'Test Data',
        source_record_url: 'https://www.grants.gov/',
        posted_date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        response_deadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        summary: 'Grant for providing safe housing to domestic violence and trafficking survivors.',
        award_amount: 1000000
      }
    ];

    let inserted = 0;
    for (const opp of sampleOpportunities) {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO opportunities (
          id, title, agency, source, source_record_url, posted_date, response_deadline, summary, award_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run([
        opp.id, opp.title, opp.agency, opp.source, opp.source_record_url,
        opp.posted_date, opp.response_deadline, opp.summary, opp.award_amount
      ]);
      inserted++;
    }

    res.json({ success: true, message: `Added ${inserted} test opportunities` });
  } catch (error) {
    console.error('Error adding test data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
(async () => {
  await initDatabase();
  initSchema();
  
  app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📊 Database: ${dbPath}`);
  });
})();

// Graceful shutdown
process.on('SIGINT', () => {
  saveDatabase();
  if (db) db.close();
  process.exit(0);
});

