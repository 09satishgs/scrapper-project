import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const charactersJsonPath = path.resolve(rootDir, 'extractions/characters.json');
const outputPath = path.resolve(rootDir, 'extractions/path_early_recruits.json');

const ROUTES = [
  { key: 'cai', label: 'Cai' },
  { key: 'dietrich', label: 'Dietrich' },
  { key: 'theodora', label: 'Theodora' },
  { key: 'leda', label: 'Leda' }
];

/**
 * Parses chapter string and extracts the chapter number if it matches "Part I Chapter <X>".
 * Returns null if it does not match.
 * @param {string|null|undefined} chapterStr
 * @returns {number|null}
 */
export function parsePart1ChapterNumber(chapterStr) {
  if (!chapterStr || typeof chapterStr !== 'string') return null;
  const match = chapterStr.trim().match(/^Part\s+I\s+Chapter\s+(\d+)$/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Validates whether the renown requirement satisfies: <= 7 or null/undefined.
 * @param {number|string|null|undefined} renown
 * @returns {boolean}
 */
export function isEarlyRenown(renown) {
  if (renown === null || renown === undefined || renown === '') return true;
  const num = parseInt(String(renown).trim(), 10);
  if (Number.isNaN(num)) return true;
  return num <= 7;
}

/**
 * Extracts early recruits across all 4 story paths.
 * Criteria:
 * 1. Chapter matches "Part I Chapter <X>" where X <= 7
 * 2. Renown requirement is <= 7 or null
 *
 * @param {Object} options
 * @returns {Array<Object>}
 */
export function generatePathEarlyRecruits(options = {}) {
  const srcPath = options.charactersPath || charactersJsonPath;
  const destPath = options.outputPath || outputPath;

  console.log(`[Path Early Recruits] Reading character data from ${srcPath}...`);
  if (!fs.existsSync(srcPath)) {
    throw new Error(`File not found: ${srcPath}`);
  }

  const characters = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
  const results = [];

  for (const char of characters) {
    if (!char.recruitment || typeof char.recruitment !== 'object') continue;

    for (const route of ROUTES) {
      const rec = char.recruitment[route.key];
      if (!rec) continue;

      const chNum = parsePart1ChapterNumber(rec.chapter);
      if (chNum !== null && chNum <= 7 && isEarlyRenown(rec.renown)) {
        results.push({
          path: route.label,
          character_id: char.slug || char.id,
          character_name: char.name
        });
      }
    }
  }

  // Sort deterministically: by path order (Cai, Dietrich, Theodora, Leda), then character name
  const pathOrder = { Cai: 1, Dietrich: 2, Theodora: 3, Leda: 4 };
  results.sort((a, b) => {
    const pDiff = (pathOrder[a.path] || 99) - (pathOrder[b.path] || 99);
    if (pDiff !== 0) return pDiff;
    return a.character_name.localeCompare(b.character_name);
  });

  fs.writeFileSync(destPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`[Path Early Recruits] Successfully written ${results.length} records to ${destPath}`);

  // Summary breakdown
  const summary = {};
  for (const r of results) {
    summary[r.path] = (summary[r.path] || 0) + 1;
  }
  console.log('[Path Early Recruits] Breakdown by path:', summary);

  return results;
}

// Auto-run if executed directly
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  generatePathEarlyRecruits();
}
