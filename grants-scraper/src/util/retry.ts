import { sleep } from "./sleep.js";
import type { Logger } from "./logger.js";

export interface RetryOptions {
  tries?: number;
  baseMs?: number;
  jitter?: boolean;
  logger?: Logger;
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Retry a function with exponential backoff and optional jitter.
 * Respects Retry-After header if present in error response.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    tries = 5,
    baseMs = 400,
    jitter = true,
    logger,
    onRetry,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check for Retry-After header in response errors
      let retryAfterMs: number | null = null;
      if (
        error &&
        typeof error === "object" &&
        "response" in error &&
        error.response &&
        typeof error.response === "object" &&
        "headers" in error.response
      ) {
        const headers = error.response.headers;
        if (
          headers &&
          typeof headers === "object" &&
          "retry-after" in headers
        ) {
          const retryAfter = headers["retry-after"];
          if (typeof retryAfter === "string") {
            retryAfterMs = parseInt(retryAfter, 10) * 1000;
          }
        }
      }

      if (attempt === tries) {
        break;
      }

      const delayMs =
        retryAfterMs !== null
          ? retryAfterMs
          : baseMs * Math.pow(2, attempt - 1) + (jitter ? Math.random() * 100 : 0);

      if (onRetry) {
        onRetry(lastError, attempt);
      }

      if (logger) {
        logger.warn(
          {
            attempt,
            tries,
            delayMs: Math.round(delayMs),
            error: lastError.message,
          },
          "Retrying after error"
        );
      }

      await sleep(delayMs);
    }
  }

  throw lastError || new Error("Retry exhausted");
}

