import { readCheckpoint, writeCheckpoint } from "../src/state/checkpoint.js";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

describe("Checkpoint", () => {
  const checkpointPath = join("state", "last_run.json");

  afterEach(() => {
    if (existsSync(checkpointPath)) {
      unlinkSync(checkpointPath);
    }
  });

  it("should read and write checkpoint", async () => {
    const checkpoint = {
      lastSuccessfulRun: "2025-01-15T00:00:00Z",
    };

    await writeCheckpoint(checkpoint);
    const read = await readCheckpoint();

    expect(read).toEqual(checkpoint);
  });

  it("should return null if checkpoint doesn't exist", async () => {
    const read = await readCheckpoint();
    expect(read).toBeNull();
  });
});

