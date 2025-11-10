import fs from 'fs';
import { dirname } from 'path';
import { parse } from 'csv-parse/sync';
import { normalizeKey } from './grantness.js';

export const CSV_HEADERS = [
  'id',
  'source',
  'source_record_url',
  'title',
  'summary',
  'agency',
  'posted_date',
  'response_deadline',
  'naics',
  'psc',
  'set_aside',
  'pop_city',
  'pop_state',
  'pop_zip',
  'pop_country',
  'poc_name',
  'poc_email',
  'poc_phone',
  'award_number',
  'award_amount',
  'award_date',
  'award_awardee',
  'relevance_score',
  'topic_hits',
  'created_at',
  'raw_data',
  'requirements',
];

export function ensureCsvFile(csvPath) {
  if (fs.existsSync(csvPath)) return;
  fs.mkdirSync(dirname(csvPath), { recursive: true });
  fs.writeFileSync(csvPath, `${CSV_HEADERS.join(',')}\n`, 'utf-8');
}

export function readCsvIndex(csvPath) {
  const urlSet = new Set();
  const keySet = new Set();
  if (!fs.existsSync(csvPath)) {
    return { urlSet, keySet, rows: [] };
  }
  const raw = fs.readFileSync(csvPath, 'utf-8');
  if (!raw.trim()) return { urlSet, keySet, rows: [] };
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });
  for (const row of rows) {
    if (row.source_record_url) {
      urlSet.add(row.source_record_url.trim());
    }
    keySet.add(normalizeKey(row.title, row.agency, row.response_deadline));
  }
  return { urlSet, keySet, rows };
}

export function appendCsvRows(csvPath, records) {
  if (!records.length) return;
  ensureCsvFile(csvPath);
  const payload = records
    .map((record) => CSV_HEADERS.map((header) => serializeCell(record[header] ?? '')).join(','))
    .join('\n');
  fs.appendFileSync(csvPath, `${payload}\n`, 'utf-8');
}

function serializeCell(value) {
  const str = value == null ? '' : String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
