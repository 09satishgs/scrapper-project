/**
 * Utility functions for cleaning scraped text and parsing DOM tables
 */

export function cleanText(str) {
  if (!str) return '';
  return str
    .replace(/<[^>]*>/g, '')      // Remove any inline HTML tags
    .replace(/\s+/g, ' ')         // Collapse whitespace
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero width spaces
    .trim();
}

export function parseNumber(val) {
  if (val === undefined || val === null) return null;
  const cleaned = String(val).replace(/[^0-9.-]/g, '').trim();
  if (cleaned === '' || cleaned === '-') return null;
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}

export function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Parses a standard Game8 table into an array of row objects
 * @param {import('cheerio').CheerioAPI} $ 
 * @param {import('cheerio').Cheerio<any>} tableElement 
 */
export function parseTableRows($, tableElement) {
  const rows = [];
  const headers = [];

  const trs = $(tableElement).find('tr');
  if (trs.length === 0) return rows;

  // Extract headers from first tr or th elements
  const firstRow = trs.first();
  firstRow.find('th, td').each((_, cell) => {
    headers.push(cleanText($(cell).text()));
  });

  trs.slice(1).each((_, tr) => {
    const rowObj = {};
    $(tr).find('td, th').each((idx, cell) => {
      const header = headers[idx] || `col_${idx}`;
      rowObj[header] = cleanText($(cell).text());
    });
    if (Object.keys(rowObj).length > 0) {
      rows.push(rowObj);
    }
  });

  return rows;
}
