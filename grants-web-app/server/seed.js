import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '../data/grants.db');

const mockData = [
  {
    id: 'grants-001',
    source: 'grants',
    source_record_url: 'https://grants.gov/view/001',
    title: 'Office for Victims of Crime - Human Trafficking Services Grant',
    summary: 'Competitive grant program to support comprehensive services for victims of human trafficking, including emergency shelter, case management, mental health counseling, and legal advocacy.',
    agency: 'Department of Justice - Office for Victims of Crime',
    posted_date: '2025-10-15',
    response_deadline: '2025-12-30',
    naics: '624190',
    psc: null,
    set_aside: null,
    pop_city: 'Jacksonville',
    pop_state: 'FL',
    pop_zip: '32202',
    pop_country: 'USA',
    poc_name: 'Sarah Johnson',
    poc_email: 'sjohnson@ojp.gov',
    poc_phone: '202-555-0123',
    award_number: 'OVC-2025-001',
    award_amount: 500000,
    award_date: null,
    award_awardee: null,
    relevance_score: 0.95,
    topic_hits: JSON.stringify(['human trafficking', 'victim services']),
    raw_data: JSON.stringify({ type: 'grant', status: 'open' }),
  },
  {
    id: 'sam-002',
    source: 'sam',
    source_record_url: 'https://sam.gov/opp/002',
    title: 'Violence Against Women Act - Transitional Housing Program',
    summary: 'Contract opportunity to provide transitional housing services for women survivors of domestic violence and sexual assault. Services include safe housing, counseling, job training, and childcare support.',
    agency: 'Department of Health and Human Services',
    posted_date: '2025-10-20',
    response_deadline: '2025-11-25',
    naics: '624120',
    psc: 'G015',
    set_aside: 'TOTAL_SMALL_BUSINESS',
    pop_city: 'Jacksonville',
    pop_state: 'FL',
    pop_zip: '32204',
    pop_country: 'USA',
    poc_name: 'Michael Chen',
    poc_email: 'mchen@hhs.gov',
    poc_phone: '301-555-0456',
    award_number: 'HHS-VAWA-2025',
    award_amount: 750000,
    award_date: null,
    award_awardee: null,
    relevance_score: 0.90,
    topic_hits: JSON.stringify(['violence against women', 'transitional housing', 'survivor services']),
    raw_data: JSON.stringify({ type: 'contract', naicsCode: '624120' }),
  },
  {
    id: 'usaspending-003',
    source: 'usaspending',
    source_record_url: 'https://usaspending.gov/award/003',
    title: 'Comprehensive Support Services for Trafficking Survivors',
    summary: 'Award for comprehensive victim services including emergency shelter, medical care, mental health counseling, legal assistance, and workforce development for survivors of sex trafficking.',
    agency: 'Department of Justice',
    posted_date: '2024-08-10',
    response_deadline: null,
    naics: '624190',
    psc: null,
    set_aside: null,
    pop_city: 'Jacksonville',
    pop_state: 'FL',
    pop_zip: null,
    pop_country: 'USA',
    poc_name: 'Lisa Martinez',
    poc_email: 'lmartinez@doj.gov',
    poc_phone: '202-555-0789',
    award_number: 'DOJ-2024-VIC-003',
    award_amount: 1250000,
    award_date: '2024-09-01',
    award_awardee: 'Community Services Alliance',
    relevance_score: 0.92,
    topic_hits: JSON.stringify(['sex trafficking', 'trafficking victims', 'survivor services', 'counseling', 'legal aid']),
    raw_data: JSON.stringify({ type: 'award', status: 'active' }),
  },
  {
    id: 'grants-004',
    source: 'grants',
    source_record_url: 'https://grants.gov/view/004',
    title: 'Anti-Trafficking Coordination Team Initiative',
    summary: 'Grant to establish multidisciplinary anti-trafficking coordination teams to improve identification, investigation, prosecution, and victim services for human trafficking cases.',
    agency: 'Department of Justice - Bureau of Justice Assistance',
    posted_date: '2025-09-01',
    response_deadline: '2026-01-15',
    naics: '624110',
    psc: null,
    set_aside: null,
    pop_city: 'Duval County',
    pop_state: 'FL',
    pop_zip: null,
    pop_country: 'USA',
    poc_name: 'Robert Williams',
    poc_email: 'rwilliams@bja.gov',
    poc_phone: '202-555-0234',
    award_number: 'BJA-ACT-2025',
    award_amount: 850000,
    award_date: null,
    award_awardee: null,
    relevance_score: 0.88,
    topic_hits: JSON.stringify(['anti-trafficking', 'human trafficking', 'victim services']),
    raw_data: JSON.stringify({ type: 'grant', category: 'coordination' }),
  },
  {
    id: 'sam-005',
    source: 'sam',
    source_record_url: 'https://sam.gov/opp/005',
    title: 'Sexual Assault Response and Prevention Services',
    summary: 'Service contract for comprehensive sexual assault response including 24/7 crisis hotline, emergency medical advocacy, counseling, and community education programs.',
    agency: 'Department of Defense',
    posted_date: '2025-10-05',
    response_deadline: '2025-11-20',
    naics: '624190',
    psc: 'G012',
    set_aside: null,
    pop_city: 'Jacksonville',
    pop_state: 'FL',
    pop_zip: '32206',
    pop_country: 'USA',
    poc_name: 'Jennifer Davis',
    poc_email: 'jdavis@defense.gov',
    poc_phone: '703-555-0345',
    award_number: 'DOD-SARP-2025',
    award_amount: 450000,
    award_date: null,
    award_awardee: null,
    relevance_score: 0.85,
    topic_hits: JSON.stringify(['sexual assault', 'victim services', 'counseling']),
    raw_data: JSON.stringify({ type: 'contract', setAside: null }),
  },
  {
    id: 'usaspending-006',
    source: 'usaspending',
    source_record_url: 'https://usaspending.gov/award/006',
    title: 'Women\'s Shelter and Support Services Program',
    summary: 'Awarded grant providing emergency shelter, transitional housing, case management, and supportive services for women and children fleeing domestic violence.',
    agency: 'Department of Housing and Urban Development',
    posted_date: '2024-06-15',
    response_deadline: null,
    naics: '624120',
    psc: null,
    set_aside: null,
    pop_city: 'Jacksonville',
    pop_state: 'FL',
    pop_zip: '32208',
    pop_country: 'USA',
    poc_name: 'Amanda Thompson',
    poc_email: 'athompson@hud.gov',
    poc_phone: '202-555-0567',
    award_number: 'HUD-2024-SH-006',
    award_amount: 650000,
    award_date: '2024-07-01',
    award_awardee: 'Safe Haven Services Inc',
    relevance_score: 0.87,
    topic_hits: JSON.stringify(['women shelter', 'domestic violence', 'transitional housing']),
    raw_data: JSON.stringify({ type: 'award', performancePeriod: '24 months' }),
  },
];

async function seedDatabase() {
  console.log('🌱 Seeding database with mock data...');

  const SQL = await initSqlJs();
  
  // Load or create database
  let db;
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

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

  // Insert mock data
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO opportunities (
      id, source, source_record_url, title, summary, agency,
      posted_date, response_deadline, naics, psc, set_aside,
      pop_city, pop_state, pop_zip, pop_country,
      poc_name, poc_email, poc_phone,
      award_number, award_amount, award_date, award_awardee,
      relevance_score, topic_hits, raw_data
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  mockData.forEach(data => {
    insertStmt.run([
      data.id, data.source, data.source_record_url, data.title, data.summary, data.agency,
      data.posted_date, data.response_deadline, data.naics, data.psc, data.set_aside,
      data.pop_city, data.pop_state, data.pop_zip, data.pop_country,
      data.poc_name, data.poc_email, data.poc_phone,
      data.award_number, data.award_amount, data.award_date, data.award_awardee,
      data.relevance_score, data.topic_hits, data.raw_data,
    ]);
  });

  insertStmt.free();

  // Save database to disk
  const buffer = Buffer.from(db.export());
  fs.mkdirSync(dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, buffer);

  db.close();

  console.log(`✅ Seeded ${mockData.length} opportunities`);
  console.log(`📊 Database saved to: ${dbPath}`);
}

seedDatabase().catch(console.error);

