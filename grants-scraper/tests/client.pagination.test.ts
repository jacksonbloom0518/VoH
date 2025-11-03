import { GrantsGovClient } from "../src/client/grantsGov.js";
import { getLogger } from "../src/util/logger.js";
import type { AppConfig } from "../src/config.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetch } from "undici";
import { jest } from "@jest/globals";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mock undici fetch
jest.mock("undici");

describe("GrantsGovClient pagination", () => {
  let client: GrantsGovClient;
  const mockConfig: AppConfig = {
    baseUrl: "https://api.grants.gov",
    requestsPerSecond: 10,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    client = new GrantsGovClient(mockConfig, getLogger(true));
  });

  it("should paginate through multiple pages", async () => {
    const page1 = JSON.parse(
      readFileSync(join(__dirname, "fixtures/grants-response-1.json"), "utf-8")
    );
    const page2 = JSON.parse(
      readFileSync(join(__dirname, "fixtures/grants-response-2.json"), "utf-8")
    );

    const mockFetch = fetch as jest.MockedFunction<typeof fetch>;
    const mockResponse1 = {
      ok: true,
      json: async () => page1,
      status: 200,
      statusText: "OK",
    } as unknown as Awaited<ReturnType<typeof fetch>>;
    const mockResponse2 = {
      ok: true,
      json: async () => page2,
      status: 200,
      statusText: "OK",
    } as unknown as Awaited<ReturnType<typeof fetch>>;

    mockFetch
      .mockResolvedValueOnce(mockResponse1)
      .mockResolvedValueOnce(mockResponse2);

    const results = await client.fetchAll({
      status: "open",
      pageSize: 2,
      page: 1,
    });

    expect(results).toHaveLength(4);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("should stop when hasMore is false", async () => {
    const page1 = JSON.parse(
      readFileSync(join(__dirname, "fixtures/grants-response-1.json"), "utf-8")
    );
    page1.pagination.hasMore = false;

    const mockFetch = fetch as jest.MockedFunction<typeof fetch>;
    const mockResponse = {
      ok: true,
      json: async () => page1,
      status: 200,
      statusText: "OK",
    } as unknown as Awaited<ReturnType<typeof fetch>>;
    mockFetch.mockResolvedValueOnce(mockResponse);

    const results = await client.fetchAll({
      status: "open",
      pageSize: 2,
    });

    expect(results).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

