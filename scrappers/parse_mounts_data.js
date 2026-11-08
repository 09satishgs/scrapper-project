import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSXModule from 'xlsx';

const XLSX = XLSXModule.default || XLSXModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const defaultSourceXlsx = path.resolve(rootDir, 'raw_extracts/mounts_source.xlsx');
const fallbackSourceXlsx = 'C:/Users/satis/.gemini/antigravity/brain/247590de-f9d9-4c9e-9014-d05720560c10/.user_uploaded/media_1793035215845_525c4e88.xlsx';
const mountsJsonPath = path.resolve(rootDir, 'extractions/mounts.json');
const mountedClassesJsonPath = path.resolve(rootDir, 'extractions/mounted_classes.json');

function slugify(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseStat(val) {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim();
  if (s === '' || s.toLowerCase() === 'unknown' || s === '-' || s === '--') return null;
  const num = parseInt(s, 10);
  return Number.isNaN(num) ? null : num;
}

function parseGrowth(val) {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim();
  if (s === '' || s.toLowerCase() === 'unknown' || s === '-' || s === '--') return null;
  const num = parseFloat(s);
  if (Number.isNaN(num)) return null;
  // If decimal between 0 and 1, convert to percentage integer (e.g. 0.15 -> 15)
  if (num > 0 && num <= 1) {
    return Math.round(num * 100);
  }
  return Math.round(num);
}

function parseAbilityBlock(rawStr) {
  if (!rawStr || typeof rawStr !== 'string') return null;
  const lines = rawStr.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const name = lines[0];
  let bond3 = null;
  let bond5 = null;
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('Bond 3:')) {
      bond3 = l.replace(/^Bond 3:\s*/, '').trim();
    } else if (l.startsWith('Bond 5:')) {
      bond5 = l.replace(/^Bond 5:\s*/, '').trim();
    }
  }
  return {
    name,
    bond_3: bond3,
    bond_5: bond5,
    full_text: rawStr
  };
}

export function parseMountsData() {
  const sourcePath = fs.existsSync(defaultSourceXlsx) ? defaultSourceXlsx : fallbackSourceXlsx;
  console.log(`[Mounts Parser] Reading Excel workbook from ${sourcePath}...`);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Mounts Excel workbook not found at ${sourcePath}`);
  }

  const wb = XLSX.readFile(sourcePath);
  const mountsSheet = wb.Sheets['Mounts'];
  if (!mountsSheet) {
    throw new Error('Could not find "Mounts" sheet in workbook');
  }

  // Parse Mounts
  const mounts = [];
  // Row 5 is header, rows 6 to 21 are mount data
  for (let R = 6; R <= 21; ++R) {
    const row = [];
    for (let C = 0; C <= 24; ++C) {
      const cell = mountsSheet[XLSX.utils.encode_cell({ r: R, c: C })];
      row.push(cell ? cell.v : null);
    }

    const mountName = row[0];
    const family = row[1];
    if (!mountName) continue;

    const abilities = [row[20], row[21], row[22]]
      .map(parseAbilityBlock)
      .filter(Boolean);

    let obtain = row[23];
    if (obtain === 'Unknown') {
      obtain = null;
    } else if (obtain) {
      obtain = String(obtain).trim();
    }

    let notes = row[24];
    if (notes) {
      notes = String(notes).trim();
    }

    // Exact Excel Header column mapping:
    // C0: Mount, C1: Family
    // C2: Added HP, C3: Added Str, C4: Added Mag, C5: Added Dex, C6: Added Spd, C7: Added Lck, C8: Added Def, C9: Added Res, C10: Added Bld
    // C11: HP growth, C12: Str growth, C13: Mag growth, C14: Dex growth, C15: Spd growth, C16: Lck growth, C17: Def growth, C18: Res growth, C19: Bld growth
    // C20: Ability 1, C21: Ability 2, C22: Ability 3, C23: Obtain, C24: Notes
    mounts.push({
      id: slugify(mountName),
      name: String(mountName).trim(),
      type: String(family).trim(),
      stat_hp: parseStat(row[2]),
      stat_str: parseStat(row[3]),
      stat_def: parseStat(row[8]),
      stat_mag: parseStat(row[4]),
      stat_res: parseStat(row[9]),
      stat_dex: parseStat(row[5]),
      stat_spd: parseStat(row[6]),
      stat_lck: parseStat(row[7]),
      stat_bld: parseStat(row[10]),
      growth_hp: parseGrowth(row[11]),
      growth_str: parseGrowth(row[12]),
      growth_def: parseGrowth(row[17]),
      growth_mag: parseGrowth(row[13]),
      growth_res: parseGrowth(row[18]),
      growth_dex: parseGrowth(row[14]),
      growth_spd: parseGrowth(row[15]),
      growth_lck: parseGrowth(row[16]),
      growth_bld: parseGrowth(row[19]),
      abilities,
      obtain: obtain || null,
      notes: notes || null
    });
  }

  // Parse Mounted Classes
  const mountedClassesSheet = wb.Sheets['Mounted Classes'];
  const mountedClasses = [];
  if (mountedClassesSheet) {
    // Header at row 3: ['Class sprite / icon', 'Class', 'Tier', 'Movement', 'Mount type(s)']
    // Data rows 4 to 23
    for (let R = 4; R <= 23; ++R) {
      const classNameCell = mountedClassesSheet[XLSX.utils.encode_cell({ r: R, c: 1 })];
      const tierCell = mountedClassesSheet[XLSX.utils.encode_cell({ r: R, c: 2 })];
      const movementCell = mountedClassesSheet[XLSX.utils.encode_cell({ r: R, c: 3 })];
      const mountTypeCell = mountedClassesSheet[XLSX.utils.encode_cell({ r: R, c: 4 })];

      if (!classNameCell || !classNameCell.v) continue;
      const className = String(classNameCell.v).trim();
      const classSlug = slugify(className);

      mountedClasses.push({
        class_id: classSlug,
        class_name: className,
        tier: tierCell ? String(tierCell.v).trim() : null,
        movement_type: movementCell ? String(movementCell.v).trim() : null,
        mount_type: mountTypeCell ? String(mountTypeCell.v).trim() : null
      });

      // Special alias mapping: Winged Soldier <-> Wing Soldier
      if (classSlug === 'winged_soldier') {
        mountedClasses.push({
          class_id: 'wing_soldier',
          class_name: 'Wing Soldier',
          tier: tierCell ? String(tierCell.v).trim() : null,
          movement_type: movementCell ? String(movementCell.v).trim() : null,
          mount_type: mountTypeCell ? String(mountTypeCell.v).trim() : null
        });
      }
    }
  }

  // Write extractions
  fs.writeFileSync(mountsJsonPath, JSON.stringify(mounts, null, 2), 'utf-8');
  console.log(`[Mounts Parser] Generated ${mountsJsonPath} (${mounts.length} records)`);

  fs.writeFileSync(mountedClassesJsonPath, JSON.stringify(mountedClasses, null, 2), 'utf-8');
  console.log(`[Mounts Parser] Generated ${mountedClassesJsonPath} (${mountedClasses.length} records)`);

  return { mounts, mountedClasses };
}

// Auto-run if invoked directly
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  parseMountsData();
}
