# Grants.gov Scraper/Ingestor

Production-ready Node.js + TypeScript tool to pull grant opportunities from Grants.gov's public API. Supports incremental sync, pagination, retries, and exports to JSON, CSV, and SQLite.

## Features

- ✅ **Full pagination** - Automatically fetches all pages
- ✅ **Incremental sync** - Uses checkpoints to only fetch new/updated opportunities
- ✅ **Robust error handling** - Retries with exponential backoff + jitter
- ✅ **Rate limiting** - Respects API rate limits
- ✅ **Deduplication** - Removes duplicates by stable ID
- ✅ **Validation** - Zod schema validation with reject tracking
- ✅ **Multiple outputs** - JSON, CSV, and optional SQLite
- ✅ **Comprehensive logging** - Structured logging with Pino

## Quick Start

### 1. Setup

```bash
# Clone or navigate to the project
cd grants-scraper

# Copy environment template
cp .env.example .env

# Edit .env and set GRANTSGOV_BASE_URL
# Example: GRANTSGOV_BASE_URL=https://www.grants.gov/api/v1

# Install dependencies
npm install

# Build
npm run build
```

### 2. Run

```bash
# Pull all open opportunities
node dist/bin/cli.js pull

# Pull with filters
node dist/bin/cli.js pull --status open --since 2025-10-01

# Pull with keyword search
node dist/bin/cli.js pull --keyword "energy efficiency" --agency DOE

# Include SQLite output
node dist/bin/cli.js pull --since 2025-10-01 --sqlite

# Verbose logging
node dist/bin/cli.js pull --verbose
```

## CLI Options

```bash
node dist/bin/cli.js pull [options]

Options:
  --status <status>        Filter by status (open|closed|forecast) [default: open]
  --keyword <string>       Search keyword
  --agency <codes>         Agency codes (comma-separated, can be repeated)
  --category <categories>  Categories (comma-separated)
  --since <date>           Start date (YYYY-MM-DD) for incremental sync
  --until <date>           End date (YYYY-MM-DD)
  --pageSize <number>      Page size [default: 100]
  --maxPages <number>      Maximum pages to fetch (safety valve)
  --outDir <path>          Output directory [default: ./data]
  --sqlite                 Also write SQLite database
  --verbose                Verbose logging
  -h, --help               Display help
```

## Examples

### Basic pull (all open opportunities)

```bash
node dist/bin/cli.js pull
```

Outputs:
- `./data/opportunities.json`
- `./data/opportunities.csv`

### Incremental sync

```bash
# First run - pulls everything
node dist/bin/cli.js pull

# Subsequent runs - only pulls new opportunities since last run
node dist/bin/cli.js pull

# Or specify a date
node dist/bin/cli.js pull --since 2025-10-01
```

The checkpoint is stored in `state/last_run.json` and contains the timestamp of the last successful run.

### Filtered pull

```bash
# By agency
node dist/bin/cli.js pull --agency DOE

# By keyword
node dist/bin/cli.js pull --keyword "renewable energy"

# Multiple agencies
node dist/bin/cli.js pull --agency DOE,EPA --agency NSF

# Date range
node dist/bin/cli.js pull --since 2025-01-01 --until 2025-12-31
```

### With SQLite

```bash
node dist/bin/cli.js pull --sqlite
```

Creates `./data/opportunities.sqlite` with schema:

```sql
CREATE TABLE opportunities (
  id TEXT PRIMARY KEY,
  opportunityNumber TEXT,
  title TEXT NOT NULL,
  agency TEXT DEFAULT '',
  category TEXT,              -- JSON array
  postedDate TEXT NOT NULL,
  closeDate TEXT,
  awardCeiling REAL,
  awardFloor REAL,
  eligibility TEXT,           -- JSON array
  synopsisUrl TEXT,
  fullTextUrl TEXT,
  raw TEXT                    -- Full raw JSON
);
```

## Incremental Sync & Checkpoints

The tool supports incremental sync to avoid re-fetching all data on every run:

1. **First run**: Fetches all opportunities matching filters
2. **Subsequent runs**: Uses `state/last_run.json` checkpoint to only fetch new opportunities
3. **Manual override**: Use `--since YYYY-MM-DD` to override checkpoint

Checkpoint file: `state/last_run.json`
```json
{
  "lastSuccessfulRun": "2025-10-01T00:00:00Z"
}
```

## API Parameters

The tool maps CLI options to Grants.gov API parameters. If the API uses different parameter names, the mapping is in `src/client/grantsGov.ts` (`buildQueryString` method).

**Current mappings:**
- `--status` → `oppStatus`
- `--keyword` → `keyword`
- `--agency` → `agency` (comma-separated)
- `--category` → `category` (comma-separated)
- `--since` → `postedFrom` (date only)
- `--until` → `postedTo` (date only)
- `--pageSize` → `pageSize`
- `--page` → `page`
- Cursor-based: `cursor` → `cursor`

If a filter isn't supported by the API, the tool will fetch a superset and filter client-side (documented in logs).

## Data Schema

Each opportunity is normalized to this schema:

```typescript
{
  id: string;                    // Required, unique identifier
  opportunityNumber?: string;    // Optional grant number
  title: string;                 // Required
  agency: string;                // Default: ""
  category: string[];            // Array of categories
  postedDate: string;            // ISO date (required)
  closeDate: string | null;      // ISO date or null
  awardCeiling: number | null;   // Max award amount
  awardFloor: number | null;     // Min award amount
  eligibility: string[];         // Array of eligible applicant types
  synopsisUrl: string | null;    // URL to synopsis
  fullTextUrl: string | null;    // URL to full announcement
  raw: unknown;                  // Full raw API response
}
```

## Rejected Records

If validation fails for any record, it's written to `data/_rejects.json` with the rejection reason:

```json
[
  {
    "raw": { /* raw API data */ },
    "reason": "Missing required field: postedDate for id GRANT-001"
  }
]
```

## Error Handling & Retries

- **Retries**: Up to 5 attempts with exponential backoff (400ms base) + jitter
- **Retry-After**: Respects HTTP `Retry-After` header if present
- **Rate limiting**: Configurable via `REQUESTS_PER_SECOND` (default: 3)
- **Failures**: Non-zero exit code on repeated failures

## Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch
```

Test coverage:
- Pagination logic
- Schema validation
- Storage writers (JSON/CSV/SQLite)
- Checkpoint state management

## Development

```bash
# Build
npm run build

# Lint
npm run lint

# Format
npm run format

# Clean build artifacts
npm run clean
```

## Troubleshooting

### Rate Limits

If you hit rate limits:
1. Reduce `REQUESTS_PER_SECOND` in `.env`
2. Add delays manually if needed
3. Check API documentation for limits

### 4xx/5xx Errors

- **401 Unauthorized**: Check `GRANTSGOV_API_KEY` (if required)
- **404 Not Found**: Verify `GRANTSGOV_BASE_URL` endpoint
- **429 Too Many Requests**: Reduce `REQUESTS_PER_SECOND`
- **500 Server Error**: Retries should handle transient errors

### Timeouts

The tool uses exponential backoff. If requests consistently time out:
- Check network connectivity
- Verify the API endpoint is accessible
- Increase timeout values if needed (modify `undici` fetch options)

### Missing Environment Variables

The tool requires `GRANTSGOV_BASE_URL`. If missing:

```
Error: GRANTSGOV_BASE_URL is required. Set it in .env file or environment.
```

## Project Structure

```
grants-scraper/
├── src/
│   ├── bin/
│   │   └── cli.ts              # CLI entry point
│   ├── client/
│   │   └── grantsGov.ts        # HTTP client + pagination
│   ├── transform/
│   │   ├── schema.ts           # Zod schema
│   │   └── mapOpportunity.ts   # Raw → normalized mapping
│   ├── storage/
│   │   ├── writeJson.ts        # JSON writer
│   │   ├── writeCsv.ts         # CSV writer
│   │   └── writeSqlite.ts      # SQLite writer
│   ├── state/
│   │   └── checkpoint.ts       # Checkpoint read/write
│   ├── util/
│   │   ├── logger.ts           # Pino logger
│   │   ├── retry.ts            # Retry with backoff
│   │   ├── sleep.ts            # Sleep utility
│   │   └── time.ts             # Date utilities
│   ├── config.ts               # Config loading
│   └── index.ts                # Main pull function
├── tests/
│   ├── fixtures/               # Test data
│   ├── client.pagination.test.ts
│   ├── transform.schema.test.ts
│   ├── storage.writers.test.ts
│   └── state.checkpoint.test.ts
├── data/                       # Output directory (gitignored)
├── state/                      # Checkpoint (gitignored)
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT

