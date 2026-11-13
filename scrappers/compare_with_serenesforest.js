import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerioModule from 'cheerio';

const cheerio = cheerioModule.default || cheerioModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Source URLs
const URLS = {
  characterBaseStats: 'https://serenesforest.net/fortunes-weave/characters/base-stats/',
  characterGrowthRates: 'https://serenesforest.net/fortunes-weave/characters/growth-rates/',
  classModifiers: 'https://serenesforest.net/fortunes-weave/classes/modifiers/',
  classGrowthRates: 'https://serenesforest.net/fortunes-weave/classes/growth-rates/'
};

// Local files
const LOCAL_FILES = {
  characterBaseStats: path.resolve(rootDir, 'extractions/character_base_stats.json'),
  characterGrowths: path.resolve(rootDir, 'extractions/character_growths.json'),
  classes: path.resolve(rootDir, 'extractions/classes.json')
};

const STAT_COLUMNS = ['hp', 'str', 'mag', 'spd', 'dex', 'def', 'res', 'lck', 'cha'];

function parseStatValue(rawStr) {
  if (rawStr === null || rawStr === undefined) return 0;
  const s = String(rawStr).trim();
  if (s === '' || s === '-' || s === '--' || s.toLowerCase() === 'unknown') return 0;
  // If there are parentheses, e.g., '3 (1)' or '(-1)', get the main value (first part)
  const mainPart = s.split('(')[0].replace(/[+%]/g, '').trim();
  if (mainPart === '' || mainPart === '-') return 0;
  const num = parseInt(mainPart, 10);
  return Number.isNaN(num) ? 0 : num;
}

function parseDismountedStatValue(rawStr) {
  if (rawStr === null || rawStr === undefined) return null;
  const s = String(rawStr).trim();
  const match = s.match(/\(([-+]?\d+)\)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

/**
 * Scrapes HTML table and returns structured map of entity stats
 */
function scrapeTableData(html, statOrder = STAT_COLUMNS) {
  const $ = cheerio.load(html);
  const data = new Map();

  $('table').each((tableIdx, tableEl) => {
    $(tableEl).find('tr').each((rowIdx, rowEl) => {
      const cells = [];
      $(rowEl).find('td').each((colIdx, cellEl) => {
        cells.push($(cellEl).text().trim());
      });

      if (cells.length >= 10) {
        const rawName = cells[0];
        // Clean trailing asterisks, brackets, or notes like 'Mu*' or 'Solel, Aurora'
        const cleanName = rawName.replace(/[\*].*$/, '').trim();
        if (!cleanName || cleanName.toLowerCase() === 'name') return;

        const stats = {};
        const dismountedStats = {};
        let hasDismounted = false;

        statOrder.forEach((stat, idx) => {
          const rawVal = cells[idx + 1];
          stats[stat] = parseStatValue(rawVal);
          const dismountedVal = parseDismountedStatValue(rawVal);
          if (dismountedVal !== null) {
            dismountedStats[stat] = dismountedVal;
            hasDismounted = true;
          }
        });

        const key = cleanName.toLowerCase();
        data.set(key, {
          raw_name: rawName,
          clean_name: cleanName,
          stats,
          ...(hasDismounted ? { dismounted_stats: dismountedStats } : {})
        });
      }
    });
  });

  return data;
}

export async function compareWithSerenesForest(options = {}) {
  const outputPath = options.outputPath || path.resolve(rootDir, 'extractions/serenesforest_mismatches.json');

  console.log('================================================================');
  console.log('--- SERENES FOREST COMPARISON & AUDIT TOOL ---');
  console.log('================================================================');

  // 1. Fetch live Serenes Forest pages
  console.log('[Network] Fetching Serenes Forest reference tables...');
  const [cbsHtml, cgrHtml, cmHtml, cgr2Html] = await Promise.all([
    fetch(URLS.characterBaseStats).then(r => r.text()),
    fetch(URLS.characterGrowthRates).then(r => r.text()),
    fetch(URLS.classModifiers).then(r => r.text()),
    fetch(URLS.classGrowthRates).then(r => r.text())
  ]);

  console.log('[Parser] Parsing Serenes Forest data tables...');
  const sfCharBases = scrapeTableData(cbsHtml, STAT_COLUMNS);
  const sfCharGrowths = scrapeTableData(cgrHtml, STAT_COLUMNS);
  const sfClassModifiers = scrapeTableData(cmHtml, STAT_COLUMNS);
  const sfClassGrowths = scrapeTableData(cgr2Html, STAT_COLUMNS);

  console.log(`  > Character Base Stats parsed: ${sfCharBases.size}`);
  console.log(`  > Character Growths parsed:    ${sfCharGrowths.size}`);
  console.log(`  > Class Modifiers parsed:      ${sfClassModifiers.size}`);
  console.log(`  > Class Growths parsed:        ${sfClassGrowths.size}`);

  // 2. Load Local Extracted Data
  console.log('[Local] Loading local extractions...');
  const localCharBases = JSON.parse(fs.readFileSync(LOCAL_FILES.characterBaseStats, 'utf-8'));
  const localCharGrowths = JSON.parse(fs.readFileSync(LOCAL_FILES.characterGrowths, 'utf-8'));
  const localClasses = JSON.parse(fs.readFileSync(LOCAL_FILES.classes, 'utf-8'));

  // 3. Compare Character Base Stats
  const characterBaseStatsMismatches = [];
  for (const lcb of localCharBases) {
    const key = lcb.name.toLowerCase();
    const sf = sfCharBases.get(key);

    if (!sf) {
      characterBaseStatsMismatches.push({
        character_id: lcb.character_id,
        name: lcb.name,
        status: 'not_found_on_serenes_forest',
        local_values: lcb.base_stats
      });
      continue;
    }

    const statDiffs = {};
    for (const stat of STAT_COLUMNS) {
      const localVal = lcb.base_stats ? lcb.base_stats[stat] : 0;
      const sfVal = sf.stats[stat];
      if (localVal !== sfVal) {
        statDiffs[stat] = {
          local: localVal,
          serenes: sfVal,
          diff: (localVal || 0) - (sfVal || 0)
        };
      }
    }

    if (Object.keys(statDiffs).length > 0) {
      characterBaseStatsMismatches.push({
        character_id: lcb.character_id,
        name: lcb.name,
        stat_differences: statDiffs
      });
    }
  }

  // 4. Compare Character Growth Rates
  const characterGrowthMismatches = [];
  for (const lcg of localCharGrowths) {
    const key = lcg.name.toLowerCase();
    const sf = sfCharGrowths.get(key);

    if (!sf) {
      characterGrowthMismatches.push({
        character_id: lcg.character_id,
        name: lcg.name,
        status: 'not_found_on_serenes_forest',
        local_values: lcg.growths
      });
      continue;
    }

    const statDiffs = {};
    for (const stat of STAT_COLUMNS) {
      const localVal = lcg.growths ? lcg.growths[stat] : 0;
      const sfVal = sf.stats[stat];
      if (localVal !== sfVal) {
        statDiffs[stat] = {
          local: localVal,
          serenes: sfVal,
          diff: (localVal || 0) - (sfVal || 0)
        };
      }
    }

    if (Object.keys(statDiffs).length > 0) {
      characterGrowthMismatches.push({
        character_id: lcg.character_id,
        name: lcg.name,
        stat_differences: statDiffs
      });
    }
  }

  // 5. Compare Class Modifiers (base_stats_bonus)
  const classModifierMismatches = [];
  const classGrowthMismatches = [];

  for (const lcl of localClasses) {
    const key = lcl.name.toLowerCase();
    const sfMod = sfClassModifiers.get(key);
    const sfGro = sfClassGrowths.get(key);

    // Modifiers
    if (!sfMod) {
      classModifierMismatches.push({
        class_id: lcl.id,
        name: lcl.name,
        status: 'not_found_on_serenes_forest',
        local_values: lcl.base_stats_bonus
      });
    } else {
      const statDiffs = {};
      for (const stat of STAT_COLUMNS) {
        const localVal = lcl.base_stats_bonus ? lcl.base_stats_bonus[stat] : 0;
        const sfVal = sfMod.stats[stat];
        if (localVal !== sfVal) {
          statDiffs[stat] = {
            local: localVal,
            serenes: sfVal,
            diff: (localVal || 0) - (sfVal || 0)
          };
        }
      }
      if (Object.keys(statDiffs).length > 0) {
        classModifierMismatches.push({
          class_id: lcl.id,
          name: lcl.name,
          stat_differences: statDiffs,
          ...(sfMod.dismounted_stats ? { serenes_dismounted_modifiers: sfMod.dismounted_stats } : {})
        });
      }
    }

    // Growths
    if (!sfGro) {
      classGrowthMismatches.push({
        class_id: lcl.id,
        name: lcl.name,
        status: 'not_found_on_serenes_forest',
        local_values: lcl.stat_growths
      });
    } else {
      const statDiffs = {};
      for (const stat of STAT_COLUMNS) {
        const localVal = lcl.stat_growths ? lcl.stat_growths[stat] : 0;
        const sfVal = sfGro.stats[stat];
        if (localVal !== sfVal) {
          statDiffs[stat] = {
            local: localVal,
            serenes: sfVal,
            diff: (localVal || 0) - (sfVal || 0)
          };
        }
      }
      if (Object.keys(statDiffs).length > 0) {
        classGrowthMismatches.push({
          class_id: lcl.id,
          name: lcl.name,
          stat_differences: statDiffs
        });
      }
    }
  }

  // 6. Compile Final Mismatch Report
  const report = {
    metadata: {
      generated_at: new Date().toISOString(),
      sources: URLS,
      summary: {
        character_base_stats: {
          total_local: localCharBases.length,
          mismatches_count: characterBaseStatsMismatches.length
        },
        character_growths: {
          total_local: localCharGrowths.length,
          mismatches_count: characterGrowthMismatches.length
        },
        class_base_stats_bonus: {
          total_local: localClasses.length,
          mismatches_count: classModifierMismatches.length
        },
        class_stat_growths: {
          total_local: localClasses.length,
          mismatches_count: classGrowthMismatches.length
        }
      }
    },
    character_base_stats_mismatches: characterBaseStatsMismatches,
    character_growth_mismatches: characterGrowthMismatches,
    class_modifier_mismatches: classModifierMismatches,
    class_growth_mismatches: classGrowthMismatches
  };

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n[Report] Mismatch audit JSON written to: ${outputPath}`);

  console.log('\n================================================================');
  console.log('--- COMPARISON AUDIT RESULTS SUMMARY ---');
  console.log('================================================================');
  console.log(`Character Base Stats : ${characterBaseStatsMismatches.length} mismatches / ${localCharBases.length} characters`);
  console.log(`Character Growths    : ${characterGrowthMismatches.length} mismatches / ${localCharGrowths.length} characters`);
  console.log(`Class Stat Modifiers : ${classModifierMismatches.length} mismatches / ${localClasses.length} classes`);
  console.log(`Class Growths        : ${classGrowthMismatches.length} mismatches / ${localClasses.length} classes`);
  console.log('================================================================');

  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  compareWithSerenesForest().catch(err => {
    console.error('Error running comparison:', err);
    process.exit(1);
  });
}
