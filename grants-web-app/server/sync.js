import { spawn } from 'child_process';
import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PYTHON_PATH = join(__dirname, '../../.venv/Scripts/python.exe');
const PIPELINE_PATH = join(__dirname, '../..');
const DB_PATH = join(__dirname, '../data/grants.db');

console.log('🔄 Starting grant data sync...');
console.log(`📍 Python: ${PYTHON_PATH}`);
console.log(`📍 Pipeline: ${PIPELINE_PATH}`);

// Run Python pipeline commands
async function runPythonCommand(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_PATH, ['-m', ...args], {
      cwd: PIPELINE_PATH,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      // Suppress streaming to console to avoid massive output/timeouts
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      // Suppress streaming to console
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Process exited with code ${code}\n${stderr}`));
      }
    });
  });
}

async function runNodeCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      env: { ...process.env },
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve(stdout); else reject(new Error(`Process exited with code ${code}\n${stderr}`));
    });
  });
}

async function syncData() {
  try {
    // 1. Fetch from SAM.gov (18 months = 540 days, quota-protected)
    console.log('\n📥 Fetching SAM.gov opportunities (18 months)...');
    await runPythonCommand([
      'pipeline',
      'run',
      '--sources', 'sam',
      '--days', '540',
      '--keywords', 'trafficking,sex trafficking,human trafficking,victim services,sexual assault,domestic violence,survivor services,shelter,transitional housing,case management,legal aid,counseling,workforce reentry',
      '--limit', '100',
      '--max-pages', '5',
      '--output-json', 'grants-scraper/data/sam_only.json',
    ]);

    // 2. Fetch from USAspending (18 months, limit 100, no geography filter)
    console.log('\n📥 Fetching USAspending awards (18 months)...');
    const eighteenMonthsAgo = new Date();
    eighteenMonthsAgo.setMonth(eighteenMonthsAgo.getMonth() - 18);
    const startDate = eighteenMonthsAgo.toISOString().split('T')[0];
    
    const usaspendingOutput = await runPythonCommand([
      'pipeline.usaspending_runner',
      '--start', startDate,
      '--limit', '100',
      '--no-geo',
    ]);
    
    // Save USAspending output (pretty-printed JSON)
    const usaspendingPath = join(PIPELINE_PATH, 'grants-scraper/data/usaspending.json');
    try {
      const usaData = JSON.parse(usaspendingOutput);
      fs.writeFileSync(usaspendingPath, JSON.stringify(usaData, null, 2), 'utf-8');
      console.log(`   💾 Saved to: ${usaspendingPath}`);
    } catch (err) {
      // If not JSON, save as-is
      fs.writeFileSync(usaspendingPath, usaspendingOutput, 'utf-8');
      console.log(`   💾 Saved (raw) to: ${usaspendingPath}`);
    }

    // 3. Pull Grants.gov data with Villages of Hope filters (ISS|HL|ED|LJL|HU + eligibilities 12,13)
    console.log('\n📥 Fetching Grants.gov opportunities (Villages of Hope filters)...');
    const grantsCwd = join(PIPELINE_PATH, 'grants-scraper');
    try {
      await runNodeCommand('node', [
        'dist/bin/cli.js',
        'pull',
        '--keyword', 'trafficking OR sex trafficking OR human trafficking OR victim services OR sexual assault OR domestic violence OR survivor services OR shelter OR transitional housing OR case management OR legal aid OR counseling OR workforce reentry',
        '--category', 'ISS,HL,ED,LJL,HU',
        '--eligibilities', '12,13',
        '--pageSize', '50',
        '--maxPages', '5'
      ], grantsCwd);
    } catch (e) {
      console.warn("   ⚠ Grants.gov pull failed; will use existing opportunities.json if present.");
    }

    // 4. Load data into database
    console.log('\n💾 Loading data into database...');
    const SQL = await initSqlJs();
    
    // Load or create database
    let db;
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
      // Create schema
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
    }

    // Load SAM from sam_only.json (normalized schema)
    const samPath = join(PIPELINE_PATH, 'grants-scraper/data/sam_only.json');
    if (fs.existsSync(samPath)) {
      const samOpps = JSON.parse(fs.readFileSync(samPath, 'utf-8'));
      console.log(`   Found ${samOpps.length} opportunities from SAM`);

      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO opportunities (
          id, source, source_record_url, title, summary, agency,
          posted_date, response_deadline, naics, psc, set_aside,
          pop_city, pop_state, pop_zip, pop_country,
          poc_name, poc_email, poc_phone,
          award_number, award_amount, award_date, award_awardee,
          raw_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const opp of samOpps) {
        const pop = opp.place_of_performance || {};
        const poc = opp.point_of_contact || {};
        const award = opp.award_info || {};

        // DEFENSIVE: Ensure required NOT NULL fields are present
        const source = opp.source || 'sam'; // Fallback to 'sam'
        const title = opp.title || 'Untitled Opportunity'; // Fallback to 'Untitled Opportunity'

        // Validate before INSERT
        if (!source || source === '') {
          console.error('❌ Skipping SAM opportunity with empty source:', JSON.stringify(opp, null, 2));
          continue;
        }
        if (!title || title === '') {
          console.error('❌ Skipping SAM opportunity with empty title:', JSON.stringify(opp, null, 2));
          continue;
        }

        insertStmt.run([
          `${source}-${opp.source_record_url || Date.now()}`,
          source,
          opp.source_record_url || '',
          title,
          opp.summary || '',
          opp.agency || '',
          opp.posted_date || '',
          opp.response_deadline || '',
          opp.naics || '',
          opp.psc || '',
          opp.set_aside || '',
          pop.city || '',
          pop.state || '',
          pop.zip || '',
          pop.country || '',
          poc.name || '',
          poc.email || '',
          poc.phone || '',
          award.number || '',
          award.amount || null,
          award.date || '',
          award.awardee || '',
          JSON.stringify(opp.raw || {}),
        ]);
      }
      insertStmt.free();
      console.log(`   ✅ Inserted/updated ${samOpps.length} SAM records`);
    }

    // Load Grants.gov from grants-scraper JSON (grants-scraper schema)
    const grantsPath = join(PIPELINE_PATH, 'grants-scraper/data/opportunities.json');
    if (fs.existsSync(grantsPath)) {
      const grants = JSON.parse(fs.readFileSync(grantsPath, 'utf-8'));
      console.log(`   Found ${grants.length} opportunities from Grants.gov`);

      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO opportunities (
          id, source, source_record_url, title, summary, agency,
          posted_date, response_deadline,
          award_amount,
          raw_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const g of grants) {
        // DEFENSIVE: Ensure required NOT NULL fields are present
        const source = 'grants'; // Always set to 'grants'
        const title = g.title || 'Untitled Opportunity'; // Fallback to 'Untitled Opportunity'

        // Validate before INSERT
        if (!source || source === '') {
          console.error('❌ Skipping Grants.gov opportunity with empty source:', JSON.stringify(g, null, 2));
          continue;
        }
        if (!title || title === '') {
          console.error('❌ Skipping Grants.gov opportunity with empty title:', JSON.stringify(g, null, 2));
          continue;
        }

        const url = g.fullTextUrl || g.synopsisUrl || '';
        insertStmt.run([
          `grants-${g.id || g.opportunityNumber || Date.now()}`,
          source,
          url,
          title,
          '',
          g.agency || '',
          g.postedDate || '',
          g.closeDate || '',
          g.awardCeiling || null,
          JSON.stringify(g),
        ]);
      }
      insertStmt.free();
      console.log(`   ✅ Inserted/updated ${Math.min(grants.length, 2)} Grants.gov records`);
    }

    // Load USAspending data
    if (fs.existsSync(usaspendingPath)) {
      const usaData = JSON.parse(fs.readFileSync(usaspendingPath, 'utf-8'));
      const awards = usaData.awards || [];
      console.log(`   Found ${awards.length} awards from USAspending`);

      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO opportunities (
          id, source, source_record_url, title, summary, agency,
          posted_date, response_deadline, naics, psc,
          pop_city, pop_state, pop_country,
          poc_name, poc_email, poc_phone,
          award_number, award_amount,
          relevance_score, topic_hits, raw_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const award of awards) {
        const pop = award.place_of_performance || {};
        const poc = award.point_of_contact || {};
        const amounts = award.amounts || {};

        // DEFENSIVE: Ensure required NOT NULL fields are present
        const source = 'usaspending'; // Always set to 'usaspending'
        const title = award.title || award.description?.substring(0, 100) || 'Untitled Award'; // Fallback chain

        // Validate before INSERT
        if (!source || source === '') {
          console.error('❌ Skipping USAspending award with empty source:', JSON.stringify(award, null, 2));
          continue;
        }
        if (!title || title === '') {
          console.error('❌ Skipping USAspending award with empty title:', JSON.stringify(award, null, 2));
          continue;
        }

        insertStmt.run([
          `usaspending-${award.award_id}`,
          source,
          (award.usaspending_links || {}).award_page || '',
          title,
          award.description || '',
          (award.awarding_agency || {}).toptier || '',
          award.action_date || '',
          '',
          (award.assistance_listing || {}).aln || '',
          '',
          pop.city || '',
          pop.state || '',
          pop.country || '',
          poc.name || '',
          poc.email || '',
          poc.phone || '',
          award.fain || award.award_id || '',
          amounts.latest_transaction_obligation || amounts.total_obligated || null,
          award.relevance_score || null,
          JSON.stringify(award.topic_hits || []),
          JSON.stringify(award),
        ]);
      }

      insertStmt.free();
      console.log(`   ✅ Inserted/updated ${awards.length} awards`);
    }

    // Save database to disk
    const buffer = Buffer.from(db.export());
    fs.writeFileSync(DB_PATH, buffer);
    
    db.close();
    console.log('\n✅ Sync completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Sync failed:', error);
    process.exit(1);
  }
}

syncData();

