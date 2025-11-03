import initSqlJs from 'sql.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '../data/grants.db');

async function cleanupMock() {
  console.log('🧹 Removing mock records from database...');

  if (!fs.existsSync(dbPath)) {
    console.log('No database found. Nothing to clean.');
    return;
  }

  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);

  // Count total and mock before
  let stmt = db.prepare("SELECT COUNT(*) as total FROM opportunities");
  stmt.step();
  const totalBefore = stmt.getAsObject().total || 0;
  stmt.free();

  stmt = db.prepare("SELECT COUNT(*) as mockCount FROM opportunities WHERE id LIKE 'grants-00%' OR id LIKE 'sam-00%' OR id LIKE 'usaspending-00%'");
  stmt.step();
  const mockBefore = stmt.getAsObject().mockCount || 0;
  stmt.free();

  console.log(`   Total records: ${totalBefore}`);
  console.log(`   Mock records:  ${mockBefore}`);

  // Delete mock
  db.run("DELETE FROM opportunities WHERE id LIKE 'grants-00%' OR id LIKE 'sam-00%' OR id LIKE 'usaspending-00%'");

  // Count after
  stmt = db.prepare("SELECT COUNT(*) as total FROM opportunities");
  stmt.step();
  const totalAfter = stmt.getAsObject().total || 0;
  stmt.free();

  // Save DB
  const out = Buffer.from(db.export());
  fs.writeFileSync(dbPath, out);
  db.close();

  console.log(`✅ Removed ${totalBefore - totalAfter} mock records. Remaining: ${totalAfter}`);
}

cleanupMock().catch(err => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});


