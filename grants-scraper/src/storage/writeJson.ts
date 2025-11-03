import { writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Opportunity } from "../transform/schema.js";
import type { Logger } from "../util/logger.js";

/**
 * Write opportunities to JSON file with pretty formatting.
 */
export async function writeJson(
  opportunities: Opportunity[],
  outDir: string,
  logger: Logger
): Promise<void> {
  await mkdir(outDir, { recursive: true });

  const filePath = path.join(outDir, "opportunities.json");
  const json = JSON.stringify(opportunities, null, 2);

  await writeFile(filePath, json, "utf-8");

  logger.info({ filePath, count: opportunities.length }, "Wrote JSON file");
}

