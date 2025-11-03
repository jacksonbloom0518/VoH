#!/usr/bin/env node

import { Command } from "commander";
import { pull } from "../index.js";

const program = new Command();

program
  .name("grants-pull")
  .description("Pull grant opportunities from Grants.gov")
  .version("1.0.0");

program
  .command("pull")
  .description("Pull grant opportunities from Grants.gov")
  .option("--status <status>", "Filter by status (open|closed|forecast)", "open")
  .option("--keyword <string>", "Search keyword")
  .option("--agency <codes>", "Agency codes (comma-separated or repeatable)", (value, prev: string[]) => {
    const codes = value.split(",").map((c) => c.trim());
    return prev ? [...prev, ...codes] : codes;
  })
  .option("--category <categories>", "Categories (comma-separated)", (value) => {
    return value.split(",").map((c) => c.trim()).filter((c) => c.length > 0);
  })
  .option("--eligibilities <codes>", "Eligibility codes (comma-separated)", (value) => {
    return value.split(",").map((c) => c.trim()).filter((c) => c.length > 0);
  })
  .option("--since <date>", "Start date (YYYY-MM-DD) for incremental sync")
  .option("--until <date>", "End date (YYYY-MM-DD)")
  .option("--pageSize <number>", "Page size", "100")
  .option("--maxPages <number>", "Maximum pages to fetch (safety valve)")
  .option("--outDir <path>", "Output directory", "./data")
  .option("--sqlite", "Also write SQLite database")
  .option("--verbose", "Verbose logging")
  .action(async (options) => {
    try {
      const result = await pull({
        status: options.status as "open" | "closed" | "forecast" | undefined,
        keyword: options.keyword,
        agency: Array.isArray(options.agency) ? options.agency : options.agency ? [options.agency] : undefined,
        category: options.category,
        eligibilities: options.eligibilities,
        since: options.since,
        until: options.until,
        pageSize: options.pageSize ? parseInt(options.pageSize, 10) : undefined,
        maxPages: options.maxPages ? parseInt(options.maxPages, 10) : undefined,
        outDir: options.outDir,
        sqlite: options.sqlite || false,
        verbose: options.verbose || false,
      });

      console.log("\n✅ Pull completed successfully!");
      console.log(`   Total fetched: ${result.totalFetched}`);
      console.log(`   Valid: ${result.valid}`);
      console.log(`   Rejected: ${result.rejected}`);
      console.log(`   Pages: ${result.pages}`);
      console.log(`   Duration: ${(result.durationMs / 1000).toFixed(2)}s`);

      process.exit(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("\n❌ Pull failed:", message);
      process.exit(1);
    }
  });

program.parse();

