import { loadConfig } from "./config.js";
import { getLogger } from "./util/logger.js";
import { GrantsGovClient } from "./client/grantsGov.js";
import { mapOpportunity } from "./transform/mapOpportunity.js";
import { Opportunity } from "./transform/schema.js";
import { writeJson } from "./storage/writeJson.js";
import { writeCsv } from "./storage/writeCsv.js";
import { writeSqlite } from "./storage/writeSqlite.js";
import { readCheckpoint, writeCheckpoint } from "./state/checkpoint.js";
import { toStartOfDayISO, toEndOfDayISO, nowISO } from "./util/time.js";
import type { GrantsGovQuery } from "./client/grantsGov.js";

export interface PullOptions {
  status?: "open" | "closed" | "forecast";
  keyword?: string;
  agency?: string[];
  category?: string[];
  eligibilities?: string[];
  since?: string; // YYYY-MM-DD
  until?: string; // YYYY-MM-DD
  pageSize?: number;
  maxPages?: number;
  outDir?: string;
  sqlite?: boolean;
  verbose?: boolean;
}

export interface PullResult {
  totalFetched: number;
  valid: number;
  rejected: number;
  pages: number;
  durationMs: number;
}

/**
 * Main pull function: fetch, validate, transform, and write opportunities.
 */
export async function pull(options: PullOptions = {}): Promise<PullResult> {
  const startTime = Date.now();
  const logger = getLogger(options.verbose ?? false);

  try {
    // Load config
    const config = loadConfig();
    logger.info({ baseUrl: config.baseUrl }, "Starting pull");

    // Resolve date window
    let sinceISO: string | undefined;
    if (options.since) {
      sinceISO = toStartOfDayISO(options.since);
    } else {
      const checkpoint = await readCheckpoint();
      if (checkpoint) {
        sinceISO = checkpoint.lastSuccessfulRun;
        logger.info({ sinceISO }, "Using checkpoint date");
      }
    }

    let untilISO: string | undefined;
    if (options.until) {
      untilISO = toEndOfDayISO(options.until);
    }

    // Build query
    const query: GrantsGovQuery = {
      status: options.status || "open",
      keyword: options.keyword,
      agency: options.agency,
      category: options.category,
      eligibilities: options.eligibilities,
      since: sinceISO,
      until: untilISO,
      pageSize: options.pageSize || 100,
      page: 1,
    };

    // Fetch all pages
    const client = new GrantsGovClient(config, logger);
    let allRaw = await client.fetchAll(query, options.maxPages);

    // Deduplicate by ID
    const idMap = new Map<string, unknown>();
    for (const raw of allRaw) {
      const obj = raw as Record<string, unknown>;
      const id = String(
        obj.id || obj.opportunityId || obj.opportunityNumber || obj.oppId || ""
      );
      if (id && !idMap.has(id)) {
        idMap.set(id, raw);
      }
    }

    allRaw = Array.from(idMap.values());
    logger.info({ uniqueCount: allRaw.length }, "Deduplicated opportunities");

    // Transform and validate
    const opportunities: Opportunity[] = [];
    const rejects: Array<{ raw: unknown; reason: string }> = [];

    for (const raw of allRaw) {
      try {
        const mapped = mapOpportunity(raw);
        const validated = Opportunity.parse(mapped);
        opportunities.push(validated);
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : String(error);
        rejects.push({ raw, reason });
        logger.debug({ error: reason }, "Rejected opportunity");
      }
    }

    // Write rejects if any
    if (rejects.length > 0) {
      const outDir = options.outDir || "data";
      const { writeFile } = await import("node:fs/promises");
      const { mkdir } = await import("node:fs/promises");
      const path = await import("node:path");
      await mkdir(outDir, { recursive: true });
      await writeFile(
        path.join(outDir, "_rejects.json"),
        JSON.stringify(rejects, null, 2),
        "utf-8"
      );
      logger.warn({ count: rejects.length }, "Wrote rejected records");
    }

    // Write outputs
    const outDir = options.outDir || "data";

    await writeJson(opportunities, outDir, logger);
    await writeCsv(opportunities, outDir, logger);

    if (options.sqlite) {
      await writeSqlite(opportunities, outDir, logger);
    }

    // Update checkpoint
    await writeCheckpoint({ lastSuccessfulRun: nowISO() });

    const durationMs = Date.now() - startTime;
    const result: PullResult = {
      totalFetched: allRaw.length,
      valid: opportunities.length,
      rejected: rejects.length,
      pages: Math.ceil(allRaw.length / (query.pageSize || 100)),
      durationMs,
    };

    logger.info(result, "Pull completed successfully");

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, "Pull failed");
    throw error;
  }
}

