# Grant Opportunities Web Application

Modern web application for searching and viewing grant opportunities from multiple federal sources (Grants.gov, SAM.gov, USAspending.gov).

## Features

- 🔍 **Multi-source search** across 3 federal APIs
- 🎯 **Advanced filtering** by agency, amount, deadline, location
- 📊 **Statistics dashboard** with real-time metrics
- 💾 **SQLite caching** for fast, offline-capable searches
- 📱 **Responsive design** works on desktop, tablet, and mobile
- ⚡ **Modern UI** built with React, Tailwind CSS, and shadcn/ui

## Tech Stack

**Frontend:**
- React 18
- React Router for navigation
- TanStack Query for data fetching
- Tailwind CSS + shadcn/ui for styling
- Vite for build tooling

**Backend:**
- Node.js + Express API server
- better-sqlite3 for database
- Integration with Python pipeline scripts

## Setup Instructions

### 1. Install Dependencies

```bash
cd grants-web-app
npm install
```

### 2. Install Additional Dependencies

The app uses shadcn/ui components. Install the missing package:

```bash
npm install tailwindcss-animate
```

### 3. Environment Setup

Create a `.env` file in the root:

```env
PORT=5000
SAM_API_KEY=your_sam_api_key_here
DATABASE_PATH=./data/grants.db
```

### 4. Initial Data Sync

Run the sync script to populate the database from your Python pipeline:

```bash
# Make sure your Python venv is set up and APIs are working
cd ..
.venv\Scripts\Activate.ps1
cd grants-web-app

# Run the sync
node server/sync.js
```

This will:
- Call your Python pipeline to fetch SAM and USAspending data
- Load Grants.gov data from opportunities.json
- Populate the SQLite database

### 5. Start the Application

```bash
# Start both frontend and backend
npm run dev
```

This runs:
- Frontend dev server on http://localhost:3000
- Backend API server on http://localhost:5000

### 6. Access the App

Open your browser to **http://localhost:3000**

## Usage

### Search Grants

1. Click "Search Grants" in the navigation
2. Enter keywords (e.g., "human trafficking", "victim services")
3. Apply filters:
   - Source (Grants.gov, SAM.gov, USAspending)
   - Agency
   - Amount range
   - State
   - Deadline range
4. View results as cards
5. Click any card to see full details

### View Details

Click on any opportunity to see:
- Full description
- Agency information
- Deadlines and amounts
- Place of performance
- Point of contact
- Raw API data

### Export Data

(To be implemented)
- CSV export of search results
- PDF generation of opportunity details

## File Structure

```
grants-web-app/
├── server/
│   ├── index.js          # Express API server
│   └── sync.js           # Data sync script
├── src/
│   ├── components/       # React components
│   │   └── Layout.jsx
│   ├── pages/           # Page components
│   │   ├── HomePage.jsx
│   │   ├── SearchPage.jsx (to create)
│   │   └── DetailPage.jsx (to create)
│   ├── lib/
│   │   ├── api.js       # API client
│   │   └── utils.js     # Utility functions
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── data/                # SQLite database
├── package.json
├── vite.config.js
├── tailwind.config.js
└── README.md
```

## API Endpoints

### `GET /api/opportunities`
Search opportunities with filters.

**Query params:**
- `search` - Keyword search
- `source` - Filter by source (grants, sam, usaspending)
- `agency` - Filter by agency name
- `minAmount`, `maxAmount` - Amount range
- `state` - State code
- `deadlineFrom`, `deadlineTo` - Deadline range
- `page`, `limit` - Pagination
- `sortBy`, `sortOrder` - Sorting

**Response:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

### `GET /api/opportunities/:id`
Get single opportunity with full details.

### `GET /api/stats`
Get database statistics.

### `GET /api/filters`
Get available filter options (sources, agencies, states).

### `POST /api/sync`
Trigger data sync from Python pipeline.

## Development

### Adding New Components

```bash
# Example: Add a new Button component
# Create src/components/ui/button.jsx following shadcn/ui patterns
```

### Updating Data

Run sync periodically to refresh data:

```bash
node server/sync.js
```

Or implement a cron job / scheduled task.

### Customizing Styles

Edit `tailwind.config.js` and `src/index.css` to customize the theme.

## Next Steps

### Phase 2 Features (To Implement)

1. **SearchPage.jsx** - Full search interface with filters
2. **DetailPage.jsx** - Opportunity detail view
3. **Export functionality** - CSV/PDF export
4. **Favorites** - Save opportunities to localStorage
5. **Advanced filters UI** - Collapsible filter panel
6. **Loading states** - Skeletons and spinners
7. **Error boundaries** - Better error handling

### Phase 3 Features

1. User authentication
2. Email alerts for new opportunities
3. Notes and annotations
4. Team collaboration features
5. Advanced analytics

## Troubleshooting

### Port Already in Use

If port 3000 or 5000 is in use:
```bash
# Change ports in vite.config.js and server/index.js
```

### Database Not Found

Run the sync script first:
```bash
node server/sync.js
```

### Python Scripts Failing

Ensure your Python environment is activated and the pipeline scripts work independently:
```bash
cd ..
.venv\Scripts\Activate.ps1
python -m pipeline.run --sources sam --days 30 --limit 10 --max-pages 1
```

## License

MIT

## Support

For issues or questions, please refer to the project documentation.

