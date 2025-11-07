# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a modern web application for searching and viewing grant opportunities from multiple federal sources (Grants.gov, SAM.gov, USAspending.gov). The stack consists of:
- **Frontend**: React 18 + Vite + React Router + TanStack Query + Tailwind CSS + shadcn/ui
- **Backend**: Node.js + Express + sql.js (in-memory SQLite)
- **Data Pipeline**: Python 3.11+ scripts in parent directory (`../pipeline/`) that fetch from SAM.gov and USAspending APIs
- **Grants.gov Scraper**: Node.js TypeScript tool in parent directory (`../grants-scraper/`) that fetches from Grants.gov API

## Development Commands

### Web App Development
```bash
# Install dependencies
npm install

# Start both frontend (port 3000) and backend (port 5000) in dev mode
npm run dev

# Start only frontend dev server
npm run dev:client

# Start only backend API server
npm run dev:server

# Build for production
npm run build

# Preview production build
npm preview
```

### Data Sync
```bash
# Sync data from Python pipeline and Grants.gov scraper into SQLite database
# This runs Python and Node scripts to populate ./data/grants.db
npm run sync
# Equivalent to: node server/sync.js
```

### Python Pipeline (from parent directory)
```bash
# Activate Python virtual environment first
cd ..
.venv\Scripts\Activate.ps1  # Windows PowerShell
# or: . .venv/Scripts/activate  # Git Bash

# Run SAM.gov + Grants.gov fetch
python -m pipeline run --sources grants,sam --keywords "trafficking,victim services" --days 540

# Run USAspending fetch (18 months)
python -m pipeline.usaspending_runner --start 2024-05-01 --limit 100 --no-geo
```

### Grants.gov Scraper (from parent directory)
```bash
cd ../grants-scraper

# Build TypeScript
npm run build

# Pull Grants.gov opportunities with Villages of Hope filters
node dist/bin/cli.js pull \
  --keyword "trafficking OR victim services" \
  --category "ISS,HL,ED,LJL,HU" \
  --eligibilities "12,13" \
  --pageSize 50 \
  --maxPages 5
```

## Architecture

### Data Flow
1. **Data Sources** (external APIs):
   - SAM.gov (contract opportunities) - fetched by `../pipeline/sam_opportunities.py`
   - USAspending.gov (federal awards) - fetched by `../pipeline/usaspending_runner.py`
   - Grants.gov (grant opportunities) - fetched by `../grants-scraper/` TypeScript CLI

2. **Data Sync** (`server/sync.js`):
   - Orchestrates fetching from all three sources
   - Normalizes schemas from different sources
   - Populates SQLite database at `./data/grants.db`
   - SAM data normalized from pipeline output schema
   - Grants.gov data uses grants-scraper schema
   - USAspending data includes relevance scoring and topic hits

3. **Backend API** (`server/index.js`):
   - Uses sql.js to load SQLite database into memory
   - Provides REST API endpoints for search, filters, stats
   - Database persists to disk on shutdown or manual save

4. **Frontend** (`src/`):
   - React Router handles routing (/, /search, /opportunity/:id)
   - TanStack Query manages API calls and caching
   - Tailwind CSS + shadcn/ui for styling

### Database Schema
The `opportunities` table in SQLite stores normalized records from all sources:
- **Common fields**: `id`, `source`, `title`, `summary`, `agency`, `posted_date`, `response_deadline`
- **SAM-specific**: `naics`, `psc`, `set_aside`
- **Location**: `pop_city`, `pop_state`, `pop_zip`, `pop_country`
- **Contact**: `poc_name`, `poc_email`, `poc_phone`
- **Award**: `award_number`, `award_amount`, `award_date`, `award_awardee`
- **Relevance**: `relevance_score`, `topic_hits` (JSON array)
- **Raw data**: `raw_data` (full JSON from source API)

### API Endpoints
- `GET /api/opportunities` - Search with filters (source, agency, amount, state, deadline, keyword)
- `GET /api/opportunities/:id` - Get single opportunity with full raw data
- `GET /api/stats` - Database statistics (total count, by source, recent count, avg amount)
- `GET /api/filters` - Available filter options (sources, agencies, states)
- `POST /api/sync` - Trigger data sync (placeholder, not yet implemented)
- `GET /api/health` - Health check

### Frontend Structure
- `src/App.jsx` - Router configuration
- `src/components/Layout.jsx` - Main layout with navigation
- `src/pages/HomePage.jsx` - Dashboard with stats
- `src/pages/SearchPage.jsx` - Search interface with filters
- `src/pages/DetailPage.jsx` - Opportunity detail view
- `src/lib/api.js` - Axios API client with TanStack Query helpers
- `src/lib/utils.js` - Utility functions (shadcn/ui `cn` helper)

## Important Implementation Details

### Path Alias
Vite is configured with `@/` alias pointing to `./src/`:
```javascript
import { cn } from '@/lib/utils'
```

### Python Integration
The sync script (`server/sync.js`) spawns Python processes to run the pipeline. Python environment must be activated at `../../.venv/Scripts/python.exe` (relative to server directory).

### Database Persistence
The sql.js database is in-memory but persists to disk:
- On `SIGINT` (graceful shutdown)
- After schema initialization
- Can be manually saved via `saveDatabase()` helper

### Data Normalization
The sync script handles three different JSON schemas:
1. **SAM data** (`grants-scraper/data/sam_only.json`) - normalized pipeline schema with `place_of_performance`, `point_of_contact`, `award_info` nested objects
2. **Grants.gov data** (`grants-scraper/data/opportunities.json`) - grants-scraper schema with `opportunityNumber`, `closeDate`, `awardCeiling`, etc.
3. **USAspending data** (`grants-scraper/data/usaspending.json`) - USAspending schema with `award_id`, `amounts`, `assistance_listing`, etc.

### Villages of Hope Configuration
The data sync uses specific filters for Villages of Hope organization:
- **Keywords**: trafficking, sex trafficking, human trafficking, victim services, sexual assault, domestic violence, survivor services, shelter, transitional housing, case management, legal aid, counseling, workforce reentry
- **SAM.gov**: 18 months (540 days), max 100 records, max 5 pages
- **USAspending**: 18 months, max 100 records, no geography filter
- **Grants.gov**: Categories ISS,HL,ED,LJL,HU + eligibilities 12,13 (nonprofits), max 5 pages

### Environment Variables
Create `.env` in root:
```env
PORT=5000
SAM_API_KEY=your_sam_api_key_here
DATABASE_PATH=./data/grants.db
```

The Python pipeline also requires `.env` in parent directory with `SAM_API_KEY`.

## Testing and Quality

### Testing
This codebase does not currently have test files. When adding tests:
- Use Jest for backend tests
- Use React Testing Library for frontend tests
- Test files should follow pattern `*.test.js` or `*.spec.js`

### Build Validation
Before committing significant changes:
```bash
# Test frontend build
npm run build

# Test backend starts without errors
npm run dev:server

# Test data sync completes
npm run sync
```

## Known Limitations and TODOs

### Current Limitations
- Database is in-memory (sql.js), not ideal for production scale
- Sync script only loads first 2 Grants.gov records (see `sync.js:234`)
- POST /api/sync endpoint not yet implemented with child_process
- No authentication/authorization
- No email alerts or user preferences

### Phase 2 Features (from README)
- Export functionality (CSV/PDF)
- Favorites with localStorage
- Advanced filters UI (collapsible panel)
- Loading states (skeletons, spinners)
- Error boundaries

### Phase 3 Features (from README)
- User authentication
- Email alerts for new opportunities
- Notes and annotations
- Team collaboration
- Advanced analytics
