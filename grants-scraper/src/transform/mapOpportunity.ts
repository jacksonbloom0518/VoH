import type { Opportunity as OpportunityType } from "./schema.js";
import { toISOString } from "../util/time.js";

/**
 * Convert MM/DD/YYYY date string to ISO date string
 */
function mmddyyyyToISO(dateStr: string): string | null {
  const parts = dateStr.split("/");
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    const [month, day, year] = parts;
    if (/^\d+$/.test(month) && /^\d+$/.test(day) && /^\d+$/.test(year)) {
      const isoDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00Z`;
      const date = new Date(isoDate);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
  }
  // Fallback to standard date parsing
  return toISOString(dateStr);
}

/**
 * Map raw API response object to normalized Opportunity.
 * Adapts to Grants.gov API v1 search2 response format.
 * Reference: https://www.grants.gov/api/common/search2
 */
export function mapOpportunity(raw: unknown): OpportunityType {
  const obj = raw as Record<string, unknown>;

  // Extract ID - Grants.gov API uses "id"
  const id = String(obj.id || "");

  if (!id) {
    throw new Error("Missing required field: id");
  }

  // Extract title
  const title = String(obj.title || "");

  if (!title) {
    throw new Error(`Missing required field: title for id ${id}`);
  }

  // Extract opportunity number - API uses "number"
  const opportunityNumber = obj.number ? String(obj.number) : undefined;

  // Extract agency - API uses "agencyCode" or "agency"
  const agency =
    typeof obj.agencyCode === "string"
      ? obj.agencyCode
      : typeof obj.agency === "string"
        ? obj.agency
        : "";

  // Extract category - API uses "cfdaList" array
  let category: string[] = [];
  if (Array.isArray(obj.cfdaList)) {
    category = obj.cfdaList.map((c) => String(c));
  } else if (Array.isArray(obj.category)) {
    category = obj.category.map((c) => String(c));
  } else if (typeof obj.category === "string") {
    category = obj.category
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
  }

  // Extract dates - API uses "openDate" and "closeDate" in MM/DD/YYYY format
  let postedDate: string | null = null;

  // Try openDate first (Grants.gov API format)
  const dateStr = (obj.openDate || obj.postedDate || obj.postDate || obj.postedAt || obj.createdAt) as
    | string
    | undefined;

  if (dateStr && typeof dateStr === "string" && dateStr.trim() !== "") {
    // Check if it's MM/DD/YYYY format
    if (dateStr.includes("/") && dateStr.split("/").length === 3) {
      postedDate = mmddyyyyToISO(dateStr);
    } else {
      // Try standard date parsing
      postedDate = toISOString(dateStr);
    }
  }

  if (!postedDate) {
    throw new Error(
      `Missing required field: postedDate (checked openDate, postedDate, postDate, postedAt, createdAt) for id ${id}`
    );
  }

  // Extract closeDate - can be empty string
  let closeDate: string | null = null;
  const closeDateStr = (obj.closeDate || obj.closingDate || obj.deadline || obj.closesAt) as
    | string
    | undefined;

  if (closeDateStr && typeof closeDateStr === "string" && closeDateStr.trim() !== "") {
    // Check if it's MM/DD/YYYY format
    if (closeDateStr.includes("/") && closeDateStr.split("/").length === 3) {
      closeDate = mmddyyyyToISO(closeDateStr);
    } else {
      closeDate = toISOString(closeDateStr);
    }
  }

  // Extract award amounts - API may not include these in search results
  const awardCeiling =
    typeof obj.awardCeiling === "number"
      ? obj.awardCeiling
      : typeof obj.maxAward === "number"
        ? obj.maxAward
        : typeof obj.awardCeiling === "string"
          ? parseFloat(obj.awardCeiling)
          : null;

  const awardFloor =
    typeof obj.awardFloor === "number"
      ? obj.awardFloor
      : typeof obj.minAward === "number"
        ? obj.minAward
        : typeof obj.awardFloor === "string"
          ? parseFloat(obj.awardFloor)
          : null;

  // Extract eligibility - API may not include this in search results
  let eligibility: string[] = [];
  if (Array.isArray(obj.eligibility)) {
    eligibility = obj.eligibility.map((e) => String(e));
  } else if (typeof obj.eligibility === "string") {
    eligibility = obj.eligibility
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
  } else if (Array.isArray(obj.eligibleApplicants)) {
    eligibility = obj.eligibleApplicants.map((e) => String(e));
  } else if (typeof obj.eligibleApplicants === "string") {
    eligibility = obj.eligibleApplicants
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
  }

  // Extract URLs - API may not include these in search results
  const synopsisUrl =
    typeof obj.synopsisUrl === "string"
      ? obj.synopsisUrl
      : typeof obj.synopsis === "string"
        ? obj.synopsis
        : typeof obj.url === "string"
          ? obj.url
          : null;

  const fullTextUrl =
    typeof obj.fullTextUrl === "string"
      ? obj.fullTextUrl
      : typeof obj.fullText === "string"
        ? obj.fullText
        : typeof obj.fullAnnouncementUrl === "string"
          ? obj.fullAnnouncementUrl
          : null;

  // Build normalized object
  const opportunity: OpportunityType = {
    id,
    opportunityNumber,
    title,
    agency,
    category,
    postedDate,
    closeDate,
    awardCeiling: isNaN(awardCeiling || NaN) ? null : awardCeiling || null,
    awardFloor: isNaN(awardFloor || NaN) ? null : awardFloor || null,
    eligibility,
    synopsisUrl,
    fullTextUrl,
    raw,
  };

  return opportunity;
}
