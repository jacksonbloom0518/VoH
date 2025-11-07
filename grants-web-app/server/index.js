import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import axios from 'axios';
import { spawn } from 'child_process';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Database setup with sql.js
const dbPath = process.env.DATABASE_PATH || join(__dirname, '../data/grants.db');
let db;

async function initDatabase() {
  const SQL = await initSqlJs();
  
  // Try to load existing database or create new
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
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
  db.run(`
  CREATE TABLE IF NOT EXISTS opportunities (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_record_url TEXT,
    title TEXT NOT NULL,
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
    raw_data TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_source ON opportunities(source);
  CREATE INDEX IF NOT EXISTS idx_agency ON opportunities(agency);
  CREATE INDEX IF NOT EXISTS idx_posted_date ON opportunities(posted_date);
  CREATE INDEX IF NOT EXISTS idx_deadline ON opportunities(response_deadline);
  CREATE INDEX IF NOT EXISTS idx_relevance ON opportunities(relevance_score);
  `);
  saveDatabase();
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
      data: opportunities.map(opp => ({
        ...opp,
        topic_hits: opp.topic_hits ? JSON.parse(opp.topic_hits) : [],
        raw_data: undefined, // Exclude raw_data from list view
      })),
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

    res.json({
      ...opportunity,
      topic_hits: opportunity.topic_hits ? JSON.parse(opportunity.topic_hits) : [],
      raw_data: opportunity.raw_data ? JSON.parse(opportunity.raw_data) : null,
    });
  } catch (error) {
    console.error('Error fetching opportunity:', error);
    res.status(500).json({ error: 'Failed to fetch opportunity' });
  }
});

// GET /api/stats - Get statistics
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
      fundingCategories: 'ISS|HL|ED|LJL|HU',   // All relevant funding categories
      oppStatuses: 'forecasted|posted',         // Opportunity statuses: forecasted (future) OR posted
      rows: 10,                                 // Fetch 10 opportunities
      keyword: 'trafficking OR "Office on Violence Against Women"',  // Any trafficking-related OR Office on Violence Against Women
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

    // Transform and insert the data into the database
    // The search2 API returns data in 'data.oppHits' array
    const opportunities = apiData.oppHits || [];
    let insertedCount = 0;

    console.log(`Processing ${opportunities.length} opportunities...`);

    for (const opp of opportunities) {
      try {
        // Generate a unique ID using number field
        const oppId = opp.number || opp.id || Date.now();
        const id = `grantsgov-${oppId}-${Math.random().toString(36).substr(2, 9)}`;

        // Transform the data to match our schema
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO opportunities (
            id, source, source_record_url, title, summary, agency,
            posted_date, response_deadline, raw_data, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run([
          id,
          'Grants.gov',
          `https://www.grants.gov/search-results-detail/${opp.number}`,
          opp.title || 'Untitled',
          opp.description || opp.synopsis || '',
          opp.agency || opp.agencyCode || null,
          opp.openDate || new Date().toISOString(),
          opp.closeDate || null,
          JSON.stringify(opp),
          new Date().toISOString()
        ]);

        stmt.free();
        insertedCount++;
        console.log(`Inserted: ${opp.title}`);
      } catch (err) {
        console.error('Error inserting opportunity:', err);
      }
    }

    // Save the database after insertions
    saveDatabase();

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

// POST /api/scrape-local-grants - Web scrape local Jacksonville/NE Florida grants
app.post('/api/scrape-local-grants', async (req, res) => {
  try {
    console.log('Starting local grants web scraper...');

    const scraperPath = join(__dirname, '../scraper/local_grants_scraper.py');

    // Check if Python script exists
    if (!fs.existsSync(scraperPath)) {
      return res.status(500).json({
        error: 'Scraper script not found',
        message: 'The local grants scraper script is missing'
      });
    }

    // Execute Python scraper with environment variables
    const pythonProcess = spawn('python', [scraperPath], {
      env: {
        ...process.env,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
        GOOGLE_CSE_ID: process.env.GOOGLE_CSE_ID
      }
    });

    let scriptOutput = '';
    let scriptError = '';

    pythonProcess.stdout.on('data', (data) => {
      scriptOutput += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      scriptError += data.toString();
      console.log('Scraper log:', data.toString());
    });

    pythonProcess.on('close', (code) => {
      try {
        if (code !== 0) {
          console.error('Scraper failed with code', code);
          console.error('Error output:', scriptError);
          return res.status(500).json({
            error: 'Scraper failed',
            message: scriptError || 'The scraper encountered an error',
            code
          });
        }

        // Parse JSON output from Python script
        const result = JSON.parse(scriptOutput);

        if (!result.success) {
          return res.status(500).json({
            error: 'Scraper error',
            message: result.error,
            count: 0
          });
        }

        console.log(`Scraper found ${result.count} grants. Inserting into database...`);

        // Insert grants into database
        let insertedCount = 0;
        let skippedCount = 0;

        for (const grant of result.grants) {
          try {
            // Check if URL already exists in database
            const checkStmt = db.prepare('SELECT id FROM opportunities WHERE source_record_url = ?');
            checkStmt.bind([grant.url]);
            const exists = checkStmt.step();
            checkStmt.free();

            if (exists) {
              skippedCount++;
              console.log(`Skipped duplicate: ${grant.title}`);
              continue;
            }

            // Generate unique ID
            const id = `webscrape-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Insert into database
            const stmt = db.prepare(`
              INSERT INTO opportunities (
                id, source, source_record_url, title, summary,
                posted_date, response_deadline, raw_data, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run([
              id,
              grant.source, // "Web Scraped - Jacksonville" or "Web Scraped - NE Florida"
              grant.url,
              grant.title,
              grant.summary || '',
              grant.found_date || new Date().toISOString(),
              grant.deadline || null,
              JSON.stringify(grant),
              new Date().toISOString()
            ]);

            stmt.free();
            insertedCount++;
            console.log(`Inserted: ${grant.title}`);

          } catch (err) {
            console.error('Error inserting grant:', err);
          }
        }

        // Save database
        saveDatabase();

        res.json({
          success: true,
          message: `Successfully scraped and inserted ${insertedCount} local grant opportunities (${skippedCount} duplicates skipped)`,
          count: insertedCount,
          skipped: skippedCount,
          total: result.count,
          grants: result.grants.map(g => ({
            title: g.title,
            url: g.url,
            source: g.source,
            deadline: g.deadline
          }))
        });

      } catch (parseError) {
        console.error('Error parsing scraper output:', parseError);
        console.error('Output was:', scriptOutput);
        return res.status(500).json({
          error: 'Failed to parse scraper results',
          message: parseError.message
        });
      }
    });

  } catch (error) {
    console.error('Error running local grants scraper:', error);
    res.status(500).json({
      error: 'Failed to run local grants scraper',
      message: error.message
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

