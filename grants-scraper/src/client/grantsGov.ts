import { fetch } from "undici";
import type { Logger } from "../util/logger.js";
import { sleep } from "../util/sleep.js";
import { withRetry } from "../util/retry.js";
import type { AppConfig } from "../config.js";

export interface GrantsGovQuery {
  status?: "open" | "closed" | "forecast";
  keyword?: string;
  agency?: string[];
  category?: string[];
  eligibilities?: string[];
  since?: string; // ISO date
  until?: string; // ISO date
  pageSize?: number;
  page?: number;
  cursor?: string;
  startRecordNum?: number;
}

export interface GrantsGovRequest {
  rows?: number;
  keyword?: string;
  oppNum?: string;
  eligibilities?: string;
  agencies?: string;
  oppStatuses?: string; // e.g., "forecasted|posted", "closed", "archived"
  aln?: string;
  fundingCategories?: string;
  startRecordNum?: number;
}

export interface GrantsGovOpportunity {
  id: string;
  number: string;
  title: string;
  agencyCode: string;
  agencyName: string;
  openDate: string; // e.g., "10/11/2023"
  closeDate: string;
  oppStatus: string;
  docType: string;
  alnist?: string[];
}

export interface GrantsGovResponse {
  errorcode: number;
  msg: string;
  token?: string;
  data?: {
    searchParams?: unknown;
    hitCount: number;
    startRecord: number;
    oppHits: GrantsGovOpportunity[];
    oppStatusOptions?: unknown[];
    dateRangeOptions?: unknown[];
    suggestion?: string;
    eligibilities?: unknown[];
    fundingCategories?: unknown[];
    fundingInstruments?: unknown[];
    agencies?: unknown[];
    accessKey?: string;
    errorMsgs?: unknown[];
  };
}

export class GrantsGovClient {
  private readonly baseUrl: string;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private readonly apiKey?: string; // Reserved for future authentication
  private readonly requestsPerSecond: number;
  private readonly logger: Logger;
  private lastRequestTime = 0;
  private requestCount = 0;
  private windowStartTime = Date.now();

  constructor(config: AppConfig, logger: Logger) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.requestsPerSecond = config.requestsPerSecond;
    this.logger = logger;
  }

  /**
   * Rate limit: ensure we don't exceed requestsPerSecond.
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const windowMs = 1000; // 1 second window

    // Reset counter if window expired
    if (now - this.windowStartTime >= windowMs) {
      this.requestCount = 0;
      this.windowStartTime = now;
    }

    // If we've hit the limit, wait until next window
    if (this.requestCount >= this.requestsPerSecond) {
      const waitTime = windowMs - (now - this.windowStartTime);
      if (waitTime > 0) {
        this.logger.debug({ waitTime }, "Rate limiting");
        await sleep(waitTime);
        this.windowStartTime = Date.now();
        this.requestCount = 0;
      }
    }

    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 1000 / this.requestsPerSecond;
    if (timeSinceLastRequest < minInterval) {
      await sleep(minInterval - timeSinceLastRequest);
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  /**
   * Build request body from query object.
   * Maps our query format to Grants.gov API v1 search2 format (POST with JSON body).
   * Reference: https://www.grants.gov/api/common/search2
   */
  private buildRequestBody(query: GrantsGovQuery): GrantsGovRequest {
    const body: GrantsGovRequest = {
      rows: query.pageSize || 100,
    };

    if (query.keyword) {
      body.keyword = query.keyword;
    }

    if (query.agency && query.agency.length > 0) {
      body.agencies = query.agency.join("|"); // API expects pipe-separated for multiple
    }

    if (query.category && query.category.length > 0) {
      body.fundingCategories = query.category.join("|"); // API expects pipe-separated for multiple
    }

    if (query.eligibilities && query.eligibilities.length > 0) {
      body.eligibilities = query.eligibilities.join("|"); // API expects pipe-separated for multiple
    }

    // Map status to oppStatuses format
    if (query.status) {
      // API expects: "forecasted|posted", "closed", "archived"
      if (query.status === "open") {
        body.oppStatuses = "posted"; // Open opportunities are "posted"
      } else if (query.status === "closed") {
        body.oppStatuses = "closed";
      } else if (query.status === "forecast") {
        body.oppStatuses = "forecasted";
      }
    }

    // Pagination: startRecordNum (0-based)
    if (query.startRecordNum !== undefined) {
      body.startRecordNum = query.startRecordNum;
    } else if (query.page !== undefined && query.pageSize) {
      body.startRecordNum = (query.page - 1) * query.pageSize;
    }

    return body;
  }

  /**
   * Fetch a single page of results.
   * Uses POST request with JSON body as per Grants.gov API v1 search2 specification.
   */
  async fetchPage(query: GrantsGovQuery): Promise<GrantsGovResponse> {
    await this.rateLimit();

    // Grants.gov public REST search endpoint (JSON)
    // Example baseUrl: https://apply07.grants.gov
    const url = `${this.baseUrl.replace(/\/$/, "")}/grantsws/rest/opportunities/search`;
    const requestBody = this.buildRequestBody(query);

    this.logger.debug({ url, requestBody }, "Fetching page");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // No API key required for search2 endpoint per documentation

    const response = await withRetry(
      async () => {
        const res = await fetch(url, {
          headers,
          method: "POST",
          body: JSON.stringify(requestBody),
        });

        // Store response in error for Retry-After header access
        if (!res.ok) {
          const error: Error & { response?: { status: number; headers: Headers } } = new Error(
            `HTTP ${res.status}: ${res.statusText}`
          );
          error.response = {
            status: res.status,
            headers: res.headers,
          };
          throw error;
        }

        return res;
      },
      {
        tries: 5,
        baseMs: 400,
        jitter: true,
        logger: this.logger,
      }
    );

    const text = await response.text();
    
    // Check if response is JSON
    if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) {
      this.logger.error(
        { url, status: response.status, textPreview: text.substring(0, 200) },
        "API returned non-JSON response (likely HTML error page)"
      );
      throw new Error(
        `API returned non-JSON response. Status: ${response.status}. Response preview: ${text.substring(0, 200)}`
      );
    }

    try {
      const parsed = JSON.parse(text) as unknown;

      // Case 1: grants.gov "search2" shape with errorcode and nested data
      if (
        parsed &&
        typeof (parsed as { errorcode?: unknown }).errorcode !== "undefined"
      ) {
        const data = parsed as GrantsGovResponse;
        if (data.errorcode !== 0) {
          throw new Error(`API error: ${data.msg || `Error code ${data.errorcode}`}`);
        }
        if (!data.data || !Array.isArray(data.data.oppHits)) {
          throw new Error(`Unexpected response structure: missing data.oppHits array`);
        }
        return data;
      }

      // Case 2: grantsws REST shape (top-level oppHits)
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { oppHits?: unknown[] }).oppHits)
      ) {
        const raw = parsed as {
          hitCount?: number;
          startRecord?: number;
          oppHits: GrantsGovOpportunity[];
        };
        const adapted: GrantsGovResponse = {
          errorcode: 0,
          msg: "ok",
          data: {
            hitCount: raw.hitCount ?? raw.oppHits.length,
            startRecord: raw.startRecord ?? 0,
            oppHits: raw.oppHits,
          },
        };
        return adapted;
      }

      throw new Error("Unrecognized response format from Grants.gov endpoint");
    } catch (error) {
      if (error instanceof Error && error.message.includes("API error")) {
        throw error;
      }
      this.logger.error(
        { url, status: response.status, textPreview: text.substring(0, 200), error },
        "Failed to parse JSON response"
      );
      throw new Error(
        `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Fetch all subsequent pages using startRecordNum pagination.
   */
  async fetchAll(query: GrantsGovQuery, maxPages?: number): Promise<unknown[]> {
    const allResults: unknown[] = [];
    let startRecordNum = query.startRecordNum || 0;
    let pageCount = 0;
    const pageSize = query.pageSize || 100;
    let hasMore = true;

    while (hasMore) {
      const currentQuery = { ...query, startRecordNum };
      const response = await this.fetchPage(currentQuery);

      if (!response.data || !Array.isArray(response.data.oppHits)) {
        this.logger.warn({ response }, "Unexpected response format");
        break;
      }

      const hits = response.data.oppHits;
      allResults.push(...hits);
      pageCount++;

      // Calculate if there are more records
      const hitCount = response.data.hitCount || 0;
      const nextStartRecord = startRecordNum + pageSize;

      if (nextStartRecord < hitCount && hits.length > 0) {
        startRecordNum = nextStartRecord;
        hasMore = true;
      } else {
        hasMore = false;
      }

      // Safety valve: maxPages
      if (maxPages !== undefined && pageCount >= maxPages) {
        this.logger.warn({ pageCount, maxPages }, "Hit max pages limit");
        break;
      }

      // Also stop if no hits returned
      if (hits.length === 0) {
        hasMore = false;
      }
    }

    this.logger.info(
      { totalRecords: allResults.length, pages: pageCount },
      "Fetched all pages"
    );
    return allResults;
  }
}

