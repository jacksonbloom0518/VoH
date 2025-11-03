import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '../../grants-scraper/data');
const BACKUP_DIR = join(DATA_DIR, 'backup');

// Files to keep as main data files
const MAIN_FILES = [
  'opportunities.json',      // Grants.gov main file
  'sam_only.json',           // SAM.gov main file  
  'usaspending.json',        // USAspending main file
  'opportunities.csv',       // Grants.gov CSV export
  '_rejects.json',           // Rejected records
];

// Test/smoke files to organize
const TEST_FILES = [
  'usaspending_smoke.json',
  'usaspending_smoke_anywhere.json',
  'usaspending_sample.json',
  'usaspending_sample_1yr.json',
];

async function organizeData() {
  console.log('🗂️  Organizing data files...\n');

  // Create backup directory if it doesn't exist
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`✅ Created backup directory: ${BACKUP_DIR}`);
  }

  // Move test files to backup
  let movedCount = 0;
  for (const testFile of TEST_FILES) {
    const srcPath = join(DATA_DIR, testFile);
    if (fs.existsSync(srcPath)) {
      const destPath = join(BACKUP_DIR, testFile);
      fs.renameSync(srcPath, destPath);
      console.log(`   📦 Moved: ${testFile} → backup/`);
      movedCount++;
    }
  }

  console.log(`\n✅ Moved ${movedCount} test file(s) to backup/`);

  // List main data files
  console.log('\n📋 Main data files:');
  for (const mainFile of MAIN_FILES) {
    const filePath = join(DATA_DIR, mainFile);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      const size = (stats.size / 1024).toFixed(2);
      console.log(`   ✓ ${mainFile} (${size} KB)`);
    }
  }

  console.log('\n📁 Your data organization:');
  console.log(`   Main data: ${DATA_DIR}`);
  console.log(`   Test files: ${BACKUP_DIR}`);
  console.log('\n✅ Organization complete!');
}

organizeData().catch(err => {
  console.error('❌ Organization failed:', err);
  process.exit(1);
});

