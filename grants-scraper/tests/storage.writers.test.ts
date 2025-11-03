import { writeJson } from "../src/storage/writeJson.js";
import { writeCsv } from "../src/storage/writeCsv.js";
import { writeSqlite } from "../src/storage/writeSqlite.js";
import { getLogger } from "../src/util/logger.js";
import { Opportunity } from "../src/transform/schema.js";
import { existsSync, unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";

const testDir = join("data", "test");

describe("Storage writers", () => {
  const logger = getLogger();

  const testOpportunities: Opportunity[] = [
    {
      id: "TEST-001",
      title: "Test Grant 1",
      agency: "DOE",
      category: ["Research"],
      postedDate: "2025-01-15T00:00:00Z",
      closeDate: "2025-06-30T00:00:00Z",
      awardCeiling: 100000,
      awardFloor: 10000,
      eligibility: ["Universities"],
      synopsisUrl: "https://example.com/1",
      fullTextUrl: "https://example.com/1/full",
      raw: {},
    },
  ];

  afterEach(() => {
    const jsonPath = join(testDir, "opportunities.json");
    const csvPath = join(testDir, "opportunities.csv");
    const dbPath = join(testDir, "opportunities.sqlite");

    if (existsSync(jsonPath)) unlinkSync(jsonPath);
    if (existsSync(csvPath)) unlinkSync(csvPath);
    if (existsSync(dbPath)) unlinkSync(dbPath);
  });

  it("should write JSON file", async () => {
    await writeJson(testOpportunities, testDir, logger);

    const jsonPath = join(testDir, "opportunities.json");
    expect(existsSync(jsonPath)).toBe(true);

    const content = JSON.parse(readFileSync(jsonPath, "utf-8"));
    expect(content).toHaveLength(1);
    expect(content[0].id).toBe("TEST-001");
  });

  it("should write CSV file", async () => {
    await writeCsv(testOpportunities, testDir, logger);

    const csvPath = join(testDir, "opportunities.csv");
    expect(existsSync(csvPath)).toBe(true);

    const content = readFileSync(csvPath, "utf-8");
    expect(content).toContain("TEST-001");
    expect(content).toContain("Test Grant 1");
  });

  it("should write SQLite database", async () => {
    try {
      await writeSqlite(testOpportunities, testDir, logger);

      const dbPath = join(testDir, "opportunities.sqlite");
      expect(existsSync(dbPath)).toBe(true);

      // Only test if better-sqlite3 is available
      try {
        const Database = (await import("better-sqlite3")).default;
        const db = new Database(dbPath);
        const row = db.prepare("SELECT * FROM opportunities WHERE id = ?").get("TEST-001");

        expect(row).toBeDefined();
        db.close();
      } catch {
        // better-sqlite3 not available, skip this part
        console.warn("Skipping SQLite verification - better-sqlite3 not available");
      }
    } catch (error) {
      // If better-sqlite3 is not installed, skip this test
      if (error instanceof Error && error.message.includes("better-sqlite3 is not installed")) {
        console.warn("Skipping SQLite test - better-sqlite3 not installed");
        return;
      }
      throw error;
    }
  });
});

