import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSXModule from 'xlsx';

const XLSX = XLSXModule.default || XLSXModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// File paths
const defaultSourceXlsx = path.resolve(rootDir, 'raw_extracts/character_autolevels_source.xlsx');
const fallbackSourceXlsx = 'C:/Users/satis/.gemini/antigravity/brain/247590de-f9d9-4c9e-9014-d05720560c10/.user_uploaded/media_1793093529082_d6340d8a.xlsx';
const classesJsonPath = path.resolve(rootDir, 'extractions/classes.json');
const intermediateJsonPath = path.resolve(rootDir, 'extractions/character_autolevels_intermediate.json');
const finalJsonPath = path.resolve(rootDir, 'extractions/character_autolevels.json');

/**
 * Strips any modifier after a plus sign (e.g. "28+10" -> 28) and converts to integer.
 * @param {string|number|null|undefined} val
 * @returns {number}
 */
export function stripPlus(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return Math.round(val);
  const str = String(val).trim();
  const basePart = str.split('+')[0].trim();
  const parsed = parseInt(basePart, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Normalizes chapter strings into numeric chapter identifiers.
 * - "Paralogue" -> 10 (default requested)
 * - "Prologue" -> 0
 * - "Cai Ch. X" -> X
 * @param {string} chapterStr
 * @returns {number}
 */
export function parseChapter(chapterStr) {
  if (!chapterStr) return 0;
  const str = String(chapterStr).trim();
  if (/paralogue/i.test(str)) {
    return 10;
  }
  if (/prologue/i.test(str)) {
    return 0;
  }
  const match = str.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

/**
 * Parses level value as integer.
 * @param {string|number} lv
 * @returns {number}
 */
export function parseLevel(lv) {
  if (typeof lv === 'number') return lv;
  const parsed = parseInt(String(lv).trim(), 10);
  return Number.isNaN(parsed) ? 1 : parsed;
}

/**
 * Main generator function.
 */
export async function generateAutolevels(options = {}) {
  const sourcePath = options.sourcePath || (fs.existsSync(defaultSourceXlsx) ? defaultSourceXlsx : fallbackSourceXlsx);
  const classesPath = options.classesPath || classesJsonPath;
  const intermediatePath = options.intermediatePath || intermediateJsonPath;
  const outputPath = options.outputPath || finalJsonPath;

  console.log('=== Fire Emblem Fortune\'s Weave Autolevels Generator ===');
  console.log(`Source Excel: ${sourcePath}`);
  console.log(`Classes JSON: ${classesPath}`);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source Excel file not found: ${sourcePath}`);
  }
  if (!fs.existsSync(classesPath)) {
    throw new Error(`Classes JSON file not found: ${classesPath}`);
  }

  // 1. Read workbook
  const workbook = XLSX.readFile(sourcePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet);

  console.log(`Read ${rawRows.length} rows from sheet "${sheetName}".`);

  // 2 & 3. Build intermediate JSON
  // Filter any completely empty rows
  const validRows = rawRows.filter(r => r.Name && r.Chapter && r.Class);

  const intermediateData = validRows.map(row => {
    return {
      name: String(row.Name).trim(),
      class: String(row.Class).trim(),
      path: 'Cai',
      chapter: parseChapter(row.Chapter),
      level: parseLevel(row.Lv),
      status: row.Status ? String(row.Status).trim() : 'Recruitable',
      hp: stripPlus(row.HP),
      str: stripPlus(row.Str),
      mag: stripPlus(row.Mag),
      spd: stripPlus(row.Spd),
      dex: stripPlus(row.Dex),
      def: stripPlus(row.Def),
      res: stripPlus(row.Res),
      lck: stripPlus(row.Lck),
      cha: stripPlus(row.Cha)
    };
  });

  // Write intermediate JSON
  fs.writeFileSync(intermediatePath, JSON.stringify(intermediateData, null, 2), 'utf-8');
  console.log(`Saved intermediate JSON (${intermediateData.length} entries) -> ${intermediatePath}`);

  // 4. Load classes.json and subtract class bonuses
  const classesData = JSON.parse(fs.readFileSync(classesPath, 'utf-8'));
  const classBonusMap = new Map();

  for (const cl of classesData) {
    if (cl.name) {
      classBonusMap.set(cl.name.toLowerCase().trim(), cl.base_stats_bonus || {});
    }
  }

  // Explicit rule: Commoner and Noble have all bonuses as 0
  const zeroBonuses = { hp: 0, str: 0, mag: 0, spd: 0, dex: 0, def: 0, res: 0, lck: 0, cha: 0 };
  classBonusMap.set('commoner', zeroBonuses);
  classBonusMap.set('noble', zeroBonuses);

  const finalAutolevels = intermediateData.map(item => {
    const classNameKey = item.class.toLowerCase().trim();
    const bonuses = classBonusMap.get(classNameKey) || zeroBonuses;

    if (!classBonusMap.has(classNameKey)) {
      console.warn(`[Warning] No class bonuses found for class "${item.class}". Using 0 bonuses.`);
    }

    return {
      name: item.name,
      class: item.class,
      path: item.path,
      chapter: item.chapter,
      level: item.level,
      status: item.status,
      hp: item.hp - (bonuses.hp || 0),
      str: item.str - (bonuses.str || 0),
      mag: item.mag - (bonuses.mag || 0),
      spd: item.spd - (bonuses.spd || 0),
      dex: item.dex - (bonuses.dex || 0),
      def: item.def - (bonuses.def || 0),
      res: item.res - (bonuses.res || 0),
      lck: item.lck - (bonuses.lck || 0),
      cha: item.cha - (bonuses.cha || 0)
    };
  });

  // Write final JSON
  fs.writeFileSync(outputPath, JSON.stringify(finalAutolevels, null, 2), 'utf-8');
  console.log(`Saved final character_autolevels.json (${finalAutolevels.length} entries) -> ${outputPath}`);

  // Verification step for Fabio Ch. 5 as specified in user request
  const fabioCh5 = finalAutolevels.find(e => e.name === 'Fabio' && e.chapter === 5);
  if (fabioCh5) {
    console.log('\n--- Verification (Fabio Chapter 5) ---');
    console.log(`Fabio Ch. 5 Mag: ${fabioCh5.mag} (Expected: 13, raw was 14 with Diviner bonus +1)`);
    if (fabioCh5.mag === 13) {
      console.log('✓ Fabio Chapter 5 Mag matches requirement exactly.');
    } else {
      console.warn(`✗ Expected Mag 13, got ${fabioCh5.mag}`);
    }
  }

  // Check row uniqueness
  const keySet = new Set();
  let duplicates = 0;
  for (const row of finalAutolevels) {
    const key = `${row.name}|${row.chapter}|${row.status}|${row.class}|${row.level}`;
    if (keySet.has(key)) {
      duplicates++;
      console.warn(`Duplicate key found: ${key}`);
    } else {
      keySet.add(key);
    }
  }
  console.log(`\nUniqueness check: ${keySet.size}/${finalAutolevels.length} unique rows (${duplicates} duplicates).`);

  return {
    intermediateCount: intermediateData.length,
    finalCount: finalAutolevels.length,
    intermediatePath,
    outputPath
  };
}

// Auto-run when executed directly
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  generateAutolevels().catch(err => {
    console.error('Error generating autolevels:', err);
    process.exit(1);
  });
}
