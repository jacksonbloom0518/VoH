import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// Load .env from project root
config({ path: path.join(rootDir, ".env") });

export interface AppConfig {
  baseUrl: string;
  apiKey?: string;
  requestsPerSecond: number;
}

/**
 * Load and validate configuration from environment variables.
 * Fails fast if required values are missing.
 */
export function loadConfig(): AppConfig {
  const baseUrl = process.env.GRANTSGOV_BASE_URL;
  if (!baseUrl) {
    throw new Error(
      "GRANTSGOV_BASE_URL is required. Set it in .env file or environment."
    );
  }

  // Validate URL format
  try {
    new URL(baseUrl);
  } catch {
    throw new Error(`Invalid GRANTSGOV_BASE_URL: ${baseUrl}`);
  }

  const apiKey = process.env.GRANTSGOV_API_KEY;
  const requestsPerSecond = parseInt(
    process.env.REQUESTS_PER_SECOND || "3",
    10
  );

  if (isNaN(requestsPerSecond) || requestsPerSecond < 1) {
    throw new Error(
      `Invalid REQUESTS_PER_SECOND: ${process.env.REQUESTS_PER_SECOND}`
    );
  }

  return {
    baseUrl,
    apiKey,
    requestsPerSecond,
  };
}

