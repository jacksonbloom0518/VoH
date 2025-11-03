import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Opportunity } from "../transform/schema.js";
import type { Logger } from "../util/logger.js";

// Dynamic import for optional better-sqlite3 dependency
type DatabaseConstructor = new (path: string) => {
  exec: (sql: string) => void;
  prepare: (sql: string) => {
    run: (...args: unknown[]) => void;
  };
  transaction: <T>(fn: (opps: T[]) => void) => (opps: T[]) => void;
  close: () => void;
};

let Database: DatabaseConstructor | null = null;

async function getDatabase(): Promise<DatabaseConstructor> {
  if (!Database) {
    try {
      const betterSqlite3 = await import("better-sqlite3");
      Database = betterSqlite3.default as DatabaseConstructor;
    } catch (error) {
      throw new Error(
        "better-sqlite3 is not installed. Install it with: npm install better-sqlite3\n" +
          "Note: On Windows, you may need Visual Studio Build Tools to compile native modules."
      );
    }
  }
  return Database;
}

/**
 * Write opportunities to SQLite database with upsert.
 * Creates table with schema matching normalized Opportunity.
 */
export async function writeSqlite(
  opportunities: Opportunity[],
  outDir: string,
  logger: Logger
): Promise<void> {
  await mkdir(outDir, { recursive: true });

  const dbPath = path.join(outDir, "opportunities.sqlite");
  const DB = await getDatabase();
  const db = new DB(dbPath);

  try {
    // Create table if not exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS opportunities (
        id TEXT PRIMARY KEY,
        opportunityNumber TEXT,
        title TEXT NOT NULL,
        agency TEXT DEFAULT '',
        category TEXT, -- JSON array stored as text
        postedDate TEXT NOT NULL,
        closeDate TEXT,
        awardCeiling REAL,
        awardFloor REAL,
        eligibility TEXT, -- JSON array stored as text
        synopsisUrl TEXT,
        fullTextUrl TEXT,
        raw TEXT -- JSON stored as text
      );

      CREATE INDEX IF NOT EXISTS idx_posted_date ON opportunities(postedDate);
      CREATE INDEX IF NOT EXISTS idx_agency ON opportunities(agency);
    `);

    // Prepare upsert statement
    const stmt = db.prepare(`
      INSERT INTO opportunities (
        id, opportunityNumber, title, agency, category, postedDate,
        closeDate, awardCeiling, awardFloor, eligibility,
        synopsisUrl, fullTextUrl, raw
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        opportunityNumber = excluded.opportunityNumber,
        title = excluded.title,
        agency = excluded.agency,
        category = excluded.category,
        postedDate = excluded.postedDate,
        closeDate = excluded.closeDate,
        awardCeiling = excluded.awardCeiling,
        awardFloor = excluded.awardFloor,
        eligibility = excluded.eligibility,
        synopsisUrl = excluded.synopsisUrl,
        fullTextUrl = excluded.fullTextUrl,
        raw = excluded.raw
    `);

    const insertMany = db.transaction((opps: Opportunity[]) => {
      for (const opp of opps) {
        stmt.run(
          opp.id,
          opp.opportunityNumber || null,
          opp.title,
          opp.agency,
          JSON.stringify(opp.category),
          opp.postedDate,
          opp.closeDate,
          opp.awardCeiling,
          opp.awardFloor,
          JSON.stringify(opp.eligibility),
          opp.synopsisUrl,
          opp.fullTextUrl,
          JSON.stringify(opp.raw)
        );
      }
    });

    insertMany(opportunities);

    logger.info({ dbPath, count: opportunities.length }, "Wrote SQLite database");
  } finally {
    db.close();
  }
}

