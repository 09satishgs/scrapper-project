import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const diffFilePath = path.resolve(rootDir, 'extractions/serenesforest_mismatches.json');
const charBaseStatsPath = path.resolve(rootDir, 'extractions/character_base_stats.json');
const charGrowthsPath = path.resolve(rootDir, 'extractions/character_growths.json');
const classesPath = path.resolve(rootDir, 'extractions/classes.json');
const charactersPath = path.resolve(rootDir, 'extractions/characters.json');

export function applySerenesForestUpdates() {
  console.log('=== APPLYING SERENES FOREST UPDATES ===');

  if (!fs.existsSync(diffFilePath)) {
    throw new Error(`Diff file not found: ${diffFilePath}`);
  }

  const diffData = JSON.parse(fs.readFileSync(diffFilePath, 'utf-8'));
  const charBaseStats = JSON.parse(fs.readFileSync(charBaseStatsPath, 'utf-8'));
  const charGrowths = JSON.parse(fs.readFileSync(charGrowthsPath, 'utf-8'));
  const classes = JSON.parse(fs.readFileSync(classesPath, 'utf-8'));
  const characters = JSON.parse(fs.readFileSync(charactersPath, 'utf-8'));

  let charBasesUpdated = 0;
  let charGrowthsUpdated = 0;
  let classModifiersUpdated = 0;
  let classGrowthsUpdated = 0;

  // 1. Update Character Base Stats
  const baseDiffMap = new Map();
  for (const m of diffData.character_base_stats_mismatches) {
    if (m.stat_differences) {
      baseDiffMap.set(m.name.toLowerCase(), m.stat_differences);
    }
  }

  for (const item of charBaseStats) {
    const diffs = baseDiffMap.get(item.name.toLowerCase());
    if (diffs) {
      console.log(`Updating Base Stats for ${item.name}:`);
      for (const [stat, vals] of Object.entries(diffs)) {
        console.log(`  ${stat}: ${item.base_stats[stat]} -> ${vals.serenes}`);
        item.base_stats[stat] = vals.serenes;
      }
      charBasesUpdated++;

      // Also update in characters.json if present
      const cObj = characters.find(c => c.name.toLowerCase() === item.name.toLowerCase());
      if (cObj && cObj.base_stats) {
        cObj.base_stats = { ...item.base_stats };
      }
    }
  }

  // 2. Update Character Growths
  const growthDiffMap = new Map();
  for (const m of diffData.character_growth_mismatches) {
    if (m.stat_differences) {
      growthDiffMap.set(m.name.toLowerCase(), m.stat_differences);
    }
  }

  for (const item of charGrowths) {
    const diffs = growthDiffMap.get(item.name.toLowerCase());
    if (diffs) {
      console.log(`Updating Growths for ${item.name}:`);
      for (const [stat, vals] of Object.entries(diffs)) {
        console.log(`  ${stat}: ${item.growths[stat]} -> ${vals.serenes}`);
        item.growths[stat] = vals.serenes;
      }
      charGrowthsUpdated++;
    }
  }

  // 3. Update Class Modifiers & Growths
  const classModDiffMap = new Map();
  for (const m of diffData.class_modifier_mismatches) {
    if (m.stat_differences) {
      classModDiffMap.set(m.name.toLowerCase(), m.stat_differences);
    }
  }

  const classGrowthDiffMap = new Map();
  for (const m of diffData.class_growth_mismatches) {
    if (m.stat_differences) {
      classGrowthDiffMap.set(m.name.toLowerCase(), m.stat_differences);
    }
  }

  for (const cl of classes) {
    const modDiffs = classModDiffMap.get(cl.name.toLowerCase());
    if (modDiffs) {
      console.log(`Updating Modifiers for class ${cl.name}:`);
      if (!cl.base_stats_bonus) cl.base_stats_bonus = {};
      for (const [stat, vals] of Object.entries(modDiffs)) {
        console.log(`  ${stat}: ${cl.base_stats_bonus[stat]} -> ${vals.serenes}`);
        cl.base_stats_bonus[stat] = vals.serenes;
      }
      classModifiersUpdated++;
    }

    const groDiffs = classGrowthDiffMap.get(cl.name.toLowerCase());
    if (groDiffs) {
      console.log(`Updating Growths for class ${cl.name}:`);
      if (!cl.stat_growths) cl.stat_growths = {};
      for (const [stat, vals] of Object.entries(groDiffs)) {
        console.log(`  ${stat}: ${cl.stat_growths[stat]} -> ${vals.serenes}`);
        cl.stat_growths[stat] = vals.serenes;
      }
      classGrowthsUpdated++;
    }
  }

  // Save back to JSON files
  fs.writeFileSync(charBaseStatsPath, JSON.stringify(charBaseStats, null, 2), 'utf-8');
  console.log(`[Saved] ${charBaseStatsPath} (${charBasesUpdated} units updated)`);

  fs.writeFileSync(charactersPath, JSON.stringify(characters, null, 2), 'utf-8');
  console.log(`[Saved] ${charactersPath} (synchronized base_stats)`);

  fs.writeFileSync(charGrowthsPath, JSON.stringify(charGrowths, null, 2), 'utf-8');
  console.log(`[Saved] ${charGrowthsPath} (${charGrowthsUpdated} units updated)`);

  fs.writeFileSync(classesPath, JSON.stringify(classes, null, 2), 'utf-8');
  console.log(`[Saved] ${classesPath} (${classModifiersUpdated} modifiers updated, ${classGrowthsUpdated} growths updated)`);

  console.log('=== UPDATE COMPLETE ===');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  applySerenesForestUpdates();
}
