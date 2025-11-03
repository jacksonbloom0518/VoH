// Jest setup file for ESM modules
import { jest } from "@jest/globals";

// Mock undici fetch for tests
jest.mock("undici", () => ({
  fetch: jest.fn(),
}));

