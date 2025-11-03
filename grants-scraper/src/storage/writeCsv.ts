import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createObjectCsvWriter } from "csv-writer";
import type { Opportunity } from "../transform/schema.js";
import type { Logger } from "../util/logger.js";

/**
 * Write opportunities to CSV file (tabular subset of fields).
 */
export async function writeCsv(
  opportunities: Opportunity[],
  outDir: string,
  logger: Logger
): Promise<void> {
  await mkdir(outDir, { recursive: true });

  const filePath = path.join(outDir, "opportunities.csv");

  const csvWriter = createObjectCsvWriter({
    path: filePath,
    header: [
      { id: "id", title: "ID" },
      { id: "opportunityNumber", title: "Opportunity Number" },
      { id: "title", title: "Title" },
      { id: "agency", title: "Agency" },
      { id: "postedDate", title: "Posted Date" },
      { id: "closeDate", title: "Close Date" },
      { id: "awardCeiling", title: "Award Ceiling" },
      { id: "awardFloor", title: "Award Floor" },
      { id: "eligibility", title: "Eligibility" },
      { id: "synopsisUrl", title: "Synopsis URL" },
    ],
  });

  const records = opportunities.map((opp) => ({
    id: opp.id,
    opportunityNumber: opp.opportunityNumber || "",
    title: opp.title,
    agency: opp.agency,
    postedDate: opp.postedDate,
    closeDate: opp.closeDate || "",
    awardCeiling: opp.awardCeiling?.toString() || "",
    awardFloor: opp.awardFloor?.toString() || "",
    eligibility: opp.eligibility.join("; "),
    synopsisUrl: opp.synopsisUrl || "",
  }));

  await csvWriter.writeRecords(records);

  logger.info({ filePath, count: opportunities.length }, "Wrote CSV file");
}

