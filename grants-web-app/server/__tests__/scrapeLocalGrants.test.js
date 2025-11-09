import {
  analyzeGrantPage,
  selectTopOpportunities,
  normalizeKey,
  shouldSkipOpportunity,
  isPdfContent,
} from '../grantness.js';
import { CSV_HEADERS } from '../csv.js';

describe('grantness helpers', () => {
  const baseHtml = `
    <html>
      <head>
        <title>Services for Survivors of Human Trafficking</title>
        <meta name="description" content="Funding opportunity for survivor services">
      </head>
      <body>
        <h1>Apply for Funding</h1>
        <p>Eligibility: Nonprofit organizations serving survivors.</p>
        <p>Deadline: December 15, 2025</p>
        <p>Award Ceiling: $500,000</p>
        <p>Human trafficking victim services with case management and housing.</p>
      </body>
    </html>
  `;

  it('accepts a true funding opportunity page', () => {
    const result = analyzeGrantPage({
      url: 'https://ojp.gov/funding/opportunity',
      html: baseHtml,
      snippet: 'Funding for survivor services',
      locationHint: 'Jacksonville, FL',
    });
    expect(result.isGrant).toBe(true);
    expect(result.topic_hits).toContain('human trafficking');
    expect(result.response_deadline).toBe('2025-12-15');
    expect(result.relevance_score).toBeGreaterThan(0);
  });

  it('rejects news or press pages lacking grant signals', () => {
    const html = `
      <html>
        <head><title>City News Release</title></head>
        <body><p>This press release highlights a story.</p></body>
      </html>
    `;
    const result = analyzeGrantPage({
      url: 'https://coj.net/news/press-release',
      html,
      snippet: 'news story',
    });
    expect(result.isGrant).toBe(false);
  });

  it('rejects PDF-only content for grantness checks', () => {
    expect(isPdfContent('https://coj.net/opportunity.pdf', 'application/pdf')).toBe(true);
    expect(isPdfContent('https://coj.net/opportunity', 'text/html')).toBe(false);
  });

  it('dedupes using URL and normalized keys', () => {
    const sets = {
      urlSet: new Set(['https://ojp.gov/funding/opportunity']),
      keySet: new Set([normalizeKey('Existing Title', 'DOJ', '2025-12-15')]),
    };
    const skipByUrl = shouldSkipOpportunity(
      {
        source_record_url: 'https://ojp.gov/funding/opportunity',
        title: 'New Title',
        agency: 'DOJ',
        response_deadline: '2025-12-20',
      },
      sets,
    );
    const skipByKey = shouldSkipOpportunity(
      {
        source_record_url: 'https://coj.net/funding/new',
        title: 'Existing Title',
        agency: 'DOJ',
        response_deadline: '2025-12-15',
      },
      sets,
    );
    expect(skipByUrl).toBe(true);
    expect(skipByKey).toBe(true);
  });

  it('orders selections by earliest deadline then relevance score', () => {
    const baseRecord = analyzeGrantPage({
      url: 'https://ojp.gov/funding/opportunity',
      html: baseHtml,
      snippet: 'Funding for survivor services',
      locationHint: 'Jacksonville, FL',
    });

    const candidates = [
      { ...baseRecord, response_deadline: '2025-12-20', relevance_score: 0.9 },
      { ...baseRecord, id: 'b', response_deadline: '2025-11-01', relevance_score: 0.7 },
      { ...baseRecord, id: 'c', response_deadline: '2025-12-20', relevance_score: 0.95 },
    ];

    const selected = selectTopOpportunities(candidates, 2);
    expect(selected).toHaveLength(2);
    expect(selected[0].response_deadline).toBe('2025-11-01');
    expect(selected[1].relevance_score).toBeGreaterThanOrEqual(selected[0].relevance_score);
  });

  it('maps every required CSV column when constructing records', () => {
    const record = analyzeGrantPage({
      url: 'https://ojp.gov/funding/opportunity',
      html: baseHtml,
      snippet: 'Funding for survivor services',
      locationHint: 'Jacksonville, FL',
    });
    const missing = CSV_HEADERS.filter((header) => !(header in record));
    expect(missing).toEqual([]);
  });
});
