import initSqlJs from 'sql.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '../data/grants.db');

async function checkData() {
  console.log('📊 Checking database contents...\n');

  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);

  // Count by source
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📈 Opportunities by Source:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const stmt = db.prepare('SELECT source, COUNT(*) as count FROM opportunities GROUP BY source');
  while (stmt.step()) {
    const row = stmt.getAsObject();
    const emoji = row.source === 'grants' ? '🏛️' : row.source === 'sam' ? '💼' : '💰';
    console.log(`  ${emoji} ${row.source.padEnd(15)} → ${row.count} opportunities`);
  }
  stmt.free();

  // Total count
  const totalStmt = db.prepare('SELECT COUNT(*) as total FROM opportunities');
  totalStmt.step();
  const total = totalStmt.getAsObject().total;
  totalStmt.free();
  
  console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  📊 TOTAL:         → ${total} opportunities\n`);

  // List all with details
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 All Opportunities:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const listStmt = db.prepare(`
    SELECT id, source, title, agency, award_amount, posted_date, response_deadline, pop_city, pop_state 
    FROM opportunities 
    ORDER BY source, posted_date DESC
  `);
  
  let currentSource = null;
  while (listStmt.step()) {
    const row = listStmt.getAsObject();
    
    if (currentSource !== row.source) {
      currentSource = row.source;
      const sourceEmoji = row.source === 'grants' ? '🏛️' : row.source === 'sam' ? '💼' : '💰';
      console.log(`\n${sourceEmoji} ${row.source.toUpperCase()} SOURCE:`);
      console.log('─'.repeat(60));
    }
    
    console.log(`\n  📄 ${row.title}`);
    console.log(`     Agency: ${row.agency || 'N/A'}`);
    if (row.award_amount) {
      const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(row.award_amount);
      console.log(`     Amount: ${amount}`);
    }
    if (row.pop_city || row.pop_state) {
      console.log(`     Location: ${row.pop_city || ''}${row.pop_city && row.pop_state ? ', ' : ''}${row.pop_state || ''}`);
    }
    console.log(`     Posted: ${row.posted_date || 'N/A'}`);
    if (row.response_deadline) {
      console.log(`     Deadline: ${row.response_deadline}`);
    }
    console.log(`     ID: ${row.id}`);
  }
  listStmt.free();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Check if data is mock or real
  const mockCheckStmt = db.prepare("SELECT COUNT(*) as count FROM opportunities WHERE id LIKE 'grants-00%' OR id LIKE 'sam-00%' OR id LIKE 'usaspending-00%'");
  mockCheckStmt.step();
  const mockCount = mockCheckStmt.getAsObject().count;
  mockCheckStmt.free();
  
  if (mockCount === total) {
    console.log('⚠️  NOTE: All data appears to be MOCK data from seed.js');
    console.log('   To load real API data, run: node server/sync.js\n');
  } else if (mockCount > 0) {
    console.log(`ℹ️  NOTE: Database contains ${mockCount} mock records and ${total - mockCount} real API records\n`);
  } else {
    console.log('✅ All data appears to be from real API sources\n');
  }

  db.close();
}

checkData().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

