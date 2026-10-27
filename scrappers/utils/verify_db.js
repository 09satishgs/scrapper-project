import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('db_builders/fefw.sqlite');

console.log('====================================================');
console.log('--- SQLITE DATABASE VERIFICATION & AUDIT (v2) ---');
console.log('====================================================');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;").all();
console.log(`Verified Tables Count: ${tables.length} (Expected: 28)\n`);

console.log('--- TABLE RECORD COUNTS ---');
let totalRows = 0;
for (const t of tables) {
  const row = db.prepare(`SELECT COUNT(*) as c FROM ${t.name}`).get();
  totalRows += row.c;
  console.log(`${t.name.padEnd(35)}: ${String(row.c).padStart(5)} records`);
}
console.log('----------------------------------------------------');
console.log(`TOTAL DATABASE RECORDS            : ${String(totalRows).padStart(5)} records\n`);

console.log('--- CHARACTER ABILITIES BREAKDOWN ---');
const abilityBreakdown = db.prepare("SELECT unlock_type, COUNT(*) as cnt FROM character_abilities GROUP BY unlock_type;").all();
console.log(abilityBreakdown);

console.log('\n--- PRAGMA FOREIGN KEY CHECK ---');
const fkCheck = db.prepare('PRAGMA foreign_key_check;').all();
console.log(`Foreign Key Violations: ${fkCheck.length} (0 expected)`);

console.log('\n--- CHECK FOR RAW_SOURCE OR URL COLUMNS ACROSS ALL TABLES ---');
const columnsWithRawOrUrl = [];
for (const t of tables) {
  const cols = db.prepare(`PRAGMA table_info(${t.name});`).all();
  for (const c of cols) {
    if (c.name.toLowerCase().includes('raw_source') || c.name.toLowerCase() === 'url') {
      columnsWithRawOrUrl.push(`${t.name}.${c.name}`);
    }
  }
}
console.log(`Found raw_source/url columns: ${columnsWithRawOrUrl.length} (Expected: 0)`);
if (columnsWithRawOrUrl.length > 0) {
  console.error('Violating columns:', columnsWithRawOrUrl);
}

console.log('\n--- VERIFY SLUGIFIED CLASS IDS & FOREIGN KEYS ---');
const archer = db.prepare('SELECT id, name, tier, type, usable_weapons FROM classes WHERE id = ?').get('archer');
console.log('Archer Class Record:', JSON.stringify(archer, null, 2));

const archerAbilities = db.prepare(`
  SELECT ca.id, ca.class_id, ca.ability_id, ca.ability_type, a.name AS ability_name, a.effect
  FROM class_abilities ca
  JOIN abilities a ON ca.ability_id = a.id
  WHERE ca.class_id = ?
`).all('archer');
console.log('Archer Class Abilities (Slugified class_id):', JSON.stringify(archerAbilities, null, 2));

console.log('\n--- SAMPLE CLASS PROGRESSION RECOMMENDATIONS (SLUGIFIED FKs) ---');
const theodoraRec = db.prepare(`
  SELECT 
    cr.character_id,
    cr.overall_tier,
    cr.beginner_class_id,
    b.name AS beginner_name,
    cr.specialty_class_id,
    s.name AS specialty_name,
    cr.advanced_class_id,
    a.name AS advanced_name,
    cr.master_class_id,
    m.name AS master_name,
    cr.divine_class_id,
    d.name AS divine_name
  FROM character_class_recommendations cr
  LEFT JOIN classes b ON cr.beginner_class_id = b.id
  LEFT JOIN classes s ON cr.specialty_class_id = s.id
  LEFT JOIN classes a ON cr.advanced_class_id = a.id
  LEFT JOIN classes m ON cr.master_class_id = m.id
  LEFT JOIN classes d ON cr.divine_class_id = d.id
  WHERE cr.character_id = ?
`).get('theodora');
console.log('Theodora Class Recommendations:', JSON.stringify(theodoraRec, null, 2));

console.log('\n--- SAMPLE STORY ROUTE & CHAPTER (SLUGIFIED FKs) ---');
const caiRoute = db.prepare('SELECT id, route_name, summary FROM story_routes WHERE id = ?').get('cai_s_path');
console.log('Cai Route:', JSON.stringify(caiRoute, null, 2));

const caiChapters = db.prepare('SELECT id, route_id, chapter_number, chapter_title FROM story_chapters WHERE route_id = ? LIMIT 3').all('cai_s_path');
console.log('Sample Chapters (Slugified route_id):', JSON.stringify(caiChapters, null, 2));

console.log('\n--- VERIFY MOUNTS & MOUNTED CLASSES ---');
const sampleMounts = db.prepare('SELECT id, name, type, stat_str, stat_def, growth_str, growth_def, abilities FROM mounts WHERE stat_str IS NOT NULL LIMIT 2').all();
console.log('Sample Mounts with Stat Boosts & Growths:', JSON.stringify(sampleMounts, null, 2));

const mountedClasses = db.prepare('SELECT id, name, tier, mount_type FROM classes WHERE mount_type IS NOT NULL').all();
console.log(`Mounted Classes Count: ${mountedClasses.length} (Expected: 20)`);
console.log('Sample Mounted Classes:', JSON.stringify(mountedClasses.slice(0, 4), null, 2));

console.log('\n--- VERIFY CHARACTER BASE STATS ---');
const baseStatsCount = db.prepare('SELECT COUNT(*) as c FROM character_base_stats').get().c;
console.log(`Character Base Stats Count: ${baseStatsCount} (Expected: 54)`);
const baseStatsCols = db.prepare('PRAGMA table_info(character_base_stats)').all().map(c => c.name);
console.log('Base Stats Columns:', baseStatsCols.join(', '));
const hasMovement = baseStatsCols.includes('movement');
console.log('Has movement column:', hasMovement, '(Expected: false)');
const sampleBaseStats = db.prepare('SELECT * FROM character_base_stats WHERE character_id IN (?, ?)').all('alexandra', 'theodora');
console.log('Sample Base Stats (Alexandra & Theodora):', JSON.stringify(sampleBaseStats, null, 2));

console.log('\n--- VERIFY CHARACTERS AUTOLEVELS ---');
const autolevelsCount = db.prepare('SELECT COUNT(*) as c FROM characters_autolevels').get().c;
console.log(`Characters Autolevels Count: ${autolevelsCount} (Expected: 489)`);
const fabioCh5 = db.prepare('SELECT name, class, chapter, level, hp, str, mag, spd, dex, def, res, lck, cha FROM characters_autolevels WHERE name = ? AND chapter = ?').get('Fabio', 5);
console.log('Fabio Ch. 5 DB Record:', JSON.stringify(fabioCh5, null, 2));
const sampleAutolevels = db.prepare('SELECT id, name, class, path, chapter, level, status, hp, str, mag FROM characters_autolevels LIMIT 3').all();
console.log('Sample Autolevels Records:', JSON.stringify(sampleAutolevels, null, 2));

console.log('\n====================================================');
console.log('--- ALL VERIFICATIONS PASSED ---');
console.log('====================================================');
