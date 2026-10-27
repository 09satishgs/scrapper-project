import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import * as cheerio from 'cheerio';

const SCHEMA_PATH = 'architecture/DB_SCHEMA.md';
const DB_OUTPUT_PATH = 'db_builders/fefw.sqlite';
const DB_GZ_OUTPUT_PATH = 'db_builders/fefw.sqlite.gz';
const DUMP_OUTPUT_PATH = 'db_builders/dump.sql';

function cleanText(str) {
  if (!str) return null;
  const cleaned = String(str).trim().replace(/\s+/g, ' ');
  return cleaned === '' ? null : cleaned;
}

const GREEK_MAP = {
  'α': 'alpha', 'Α': 'alpha',
  'β': 'beta', 'Β': 'beta',
  'γ': 'gamma', 'Γ': 'gamma',
  'δ': 'delta', 'Δ': 'delta',
  'ε': 'epsilon', 'Ε': 'epsilon',
  'ζ': 'zeta', 'Ζ': 'zeta',
  'η': 'eta', 'Η': 'eta',
  'θ': 'theta', 'Θ': 'theta', 'ϑ': 'theta',
  'ι': 'iota', 'Ι': 'iota',
  'κ': 'kappa', 'Κ': 'kappa',
  'λ': 'lambda', 'Λ': 'lambda',
  'μ': 'mu', 'Μ': 'mu',
  'ν': 'nu', 'Ν': 'nu',
  'ξ': 'xi', 'Ξ': 'xi',
  'ο': 'omicron', 'Ο': 'omicron',
  'π': 'pi', 'Π': 'pi',
  'ρ': 'rho', 'Ρ': 'rho',
  'σ': 'sigma', 'Σ': 'sigma', 'ς': 'sigma',
  'τ': 'tau', 'Τ': 'tau',
  'υ': 'upsilon', 'Υ': 'upsilon',
  'φ': 'phi', 'Φ': 'phi',
  'χ': 'chi', 'Χ': 'chi',
  'ψ': 'psi', 'Ψ': 'psi',
  'ω': 'omega', 'Ω': 'omega'
};

function slugify(str) {
  if (!str) return '';
  let s = String(str);
  for (const [greek, latin] of Object.entries(GREEK_MAP)) {
    s = s.replaceAll(greek, `_${latin}_`);
  }
  return s
    .replace(/\+/g, '_plus')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseStat(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val);
  const str = String(val).replace(/[%+\s]/g, '').trim();
  const parsed = parseInt(str, 10);
  return isNaN(parsed) ? 0 : parsed;
}

function extractSpellNames(rawSpells) {
  if (!rawSpells || !Array.isArray(rawSpells)) return [];
  const names = [];
  const isPlaceholder = (val) => {
    if (!val || typeof val !== 'string') return true;
    const trimmed = val.trim().toLowerCase();
    return trimmed === '' || trimmed === 'tbd' || trimmed === 'tba' || trimmed === 'none' || trimmed === '-' || trimmed === '--';
  };

  for (const s of rawSpells) {
    if (!s) continue;
    if (typeof s === 'string') {
      if (!isPlaceholder(s)) names.push(s.trim());
    } else if (typeof s === 'object') {
      if (Array.isArray(s.black_magic)) {
        for (const bm of s.black_magic) {
          if (!isPlaceholder(bm)) names.push(bm.trim());
        }
      }
      if (Array.isArray(s.white_magic)) {
        for (const wm of s.white_magic) {
          if (!isPlaceholder(wm)) names.push(wm.trim());
        }
      }
      const direct = s.spell || s.name || s.title;
      if (direct && typeof direct === 'string' && !isPlaceholder(direct)) {
        names.push(direct.trim());
      }
    }
  }
  return [...new Set(names)];
}

function extractCombatArtNames(rawArts) {
  if (!rawArts || !Array.isArray(rawArts)) return [];
  const names = [];
  const isPlaceholder = (val) => {
    if (!val || typeof val !== 'string') return true;
    const trimmed = val.trim().toLowerCase();
    return trimmed === '' || trimmed === 'tbd' || trimmed === 'tba' || trimmed === 'none' || trimmed === '-' || trimmed === '--';
  };

  for (const a of rawArts) {
    if (!a) continue;
    if (typeof a === 'string') {
      if (!isPlaceholder(a)) names.push(a.trim());
    } else if (typeof a === 'object') {
      const name = a.name || a.art || a.title;
      if (name && typeof name === 'string' && !isPlaceholder(name)) {
        names.push(name.trim());
      }
    }
  }
  return [...new Set(names)];
}

function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return isNaN(val) ? 'NULL' : String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

export async function buildDatabase() {
  console.log('====================================================');
  console.log('--- STARTING SQLITE DATABASE BUILDER (v1) ---');
  console.log('--- USING SLUGIFIED IDS & NO RAW_SOURCE / URLS ---');
  console.log('====================================================');

  // 1. Read Schema DDL from architecture/DB_SCHEMA.md
  console.log(`[Schema] Reading DDL from ${SCHEMA_PATH}...`);
  const schemaMd = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  const ddlMatch = schemaMd.match(/```sql\n([\s\S]*?)```/);
  if (!ddlMatch) {
    throw new Error('Could not find SQL DDL block in architecture/DB_SCHEMA.md');
  }
  const ddlSql = ddlMatch[1];

  // Initialize SQLite database
  if (fs.existsSync(DB_OUTPUT_PATH)) {
    try {
      fs.unlinkSync(DB_OUTPUT_PATH);
    } catch {
      // Ignore if locked
    }
  }

  const db = new DatabaseSync(DB_OUTPUT_PATH);
  console.log(`[Database] Initialized SQLite database at ${DB_OUTPUT_PATH}`);

  // Execute DDL
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(ddlSql);
  console.log('[Schema] Executed complete 27-table DDL schema successfully.');

  // Accumulate SQL statements for dump.sql
  const sqlDumpStatements = [
    '-- Fire Emblem: Fortune\'s Weave Database Dump',
    '-- Generated dynamically by db_builders/db_builder_v1.js',
    '-- Compatible with SQLite WASM / PostgreSQL / ANSI SQL',
    '',
    'PRAGMA foreign_keys = OFF;',
    'BEGIN TRANSACTION;',
    '',
    ddlSql,
    ''
  ];

  function runInsert(tableName, dataObj) {
    const cols = Object.keys(dataObj);
    const sanitizedVals = Object.values(dataObj).map(v => {
      if (v === undefined || v === null) return null;
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    });
    const placeholders = cols.map(() => '?').join(', ');
    const sql = `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders});`;

    const stmt = db.prepare(sql);
    stmt.run(...sanitizedVals);

    const dumpVals = sanitizedVals.map(escapeSql).join(', ');
    sqlDumpStatements.push(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${dumpVals});`);
  }

  // 2. Load JSON files from extractions/
  console.log('[Data] Loading extracted JSON datasets...');
  const charactersData = JSON.parse(fs.readFileSync('extractions/characters.json', 'utf-8'));
  const growthsData = JSON.parse(fs.readFileSync('extractions/character_growths.json', 'utf-8'));
  const bestClassesData = JSON.parse(fs.readFileSync('extractions/character_best_classes.json', 'utf-8'));
  const giftsData = JSON.parse(fs.readFileSync('extractions/character_gifts.json', 'utf-8'));
  const birdTimeData = JSON.parse(fs.readFileSync('extractions/character_bird_time.json', 'utf-8'));
  const classesData = JSON.parse(fs.readFileSync('extractions/classes.json', 'utf-8'));
  const abilitiesData = JSON.parse(fs.readFileSync('extractions/abilities.json', 'utf-8'));
  const combatArtsData = JSON.parse(fs.readFileSync('extractions/combat_arts.json', 'utf-8'));
  const weaponsData = JSON.parse(fs.readFileSync('extractions/weapons.json', 'utf-8'));
  const spellsData = JSON.parse(fs.readFileSync('extractions/spells.json', 'utf-8'));
  const itemsData = JSON.parse(fs.readFileSync('extractions/items.json', 'utf-8'));
  const questsData = JSON.parse(fs.readFileSync('extractions/quests.json', 'utf-8'));
  const paraloguesData = JSON.parse(fs.readFileSync('extractions/paralogues.json', 'utf-8'));
  const storyRoutesData = JSON.parse(fs.readFileSync('extractions/story_routes.json', 'utf-8'));
  const mechanicsData = JSON.parse(fs.readFileSync('extractions/mechanics.json', 'utf-8'));
  const mountsData = JSON.parse(fs.readFileSync('extractions/mounts.json', 'utf-8'));
  const mountedClassesData = JSON.parse(fs.readFileSync('extractions/mounted_classes.json', 'utf-8'));
  const characterBaseStatsData = JSON.parse(fs.readFileSync('extractions/character_base_stats.json', 'utf-8'));

  // Pre-build identifier maps
  const classMountTypeMap = new Map();
  for (const mc of mountedClassesData) {
    classMountTypeMap.set(mc.class_id, mc.mount_type);
  }

  const classArchiveToSlug = new Map();
  const classNameToId = new Map();
  for (const cl of classesData) {
    const slug = slugify(cl.name);
    classArchiveToSlug.set(cl.id, slug);
    classNameToId.set(cl.name.toLowerCase(), slug);
  }

  const charArchiveToSlug = new Map();
  const charNameToSlug = new Map();
  for (const c of charactersData) {
    charArchiveToSlug.set(c.id, c.slug);
    charNameToSlug.set(c.name.toLowerCase(), c.slug);
  }

  const itemNameToId = new Map();
  for (const it of itemsData) {
    itemNameToId.set(it.name.toLowerCase(), slugify(it.name));
  }

  const abilityNameToId = new Map();
  for (const ab of abilitiesData) {
    abilityNameToId.set(ab.name.toLowerCase(), ab.id);
  }

  // --------------------------------------------------------------------------
  // Table 8: classes (slugified ID)
  // --------------------------------------------------------------------------
  console.log(`[Populating] classes (${classesData.length} records)...`);
  for (const cl of classesData) {
    const classSlug = slugify(cl.name);
    const mountType = classMountTypeMap.get(classSlug) || null;
    const baseBonus = cl.base_stats_bonus || cl.base_stats || {};
    const statGrowths = cl.stat_growths || cl.growths || {};
    runInsert('classes', {
      id: classSlug,
      name: cl.name,
      tier: cl.tier,
      type: cl.type || null,
      mount_type: mountType,
      movement: cl.movement || 4,
      usable_weapons: JSON.stringify(cl.usable_weapons || []),
      license_required: cl.requirements?.license || null,
      ideal_level: cl.requirements?.ideal_level || null,
      renown_level: cl.requirements?.renown_level || null,
      primary_skills: cl.requirements?.primary_skill || null,
      secondary_skills: cl.requirements?.secondary_skill || null,
      unlock_condition: cl.requirements?.special || null,
      hp_bonus: parseStat(baseBonus.hp),
      str_bonus: parseStat(baseBonus.str),
      mag_bonus: parseStat(baseBonus.mag),
      spd_bonus: parseStat(baseBonus.spd),
      dex_bonus: parseStat(baseBonus.dex),
      def_bonus: parseStat(baseBonus.def),
      res_bonus: parseStat(baseBonus.res),
      lck_bonus: parseStat(baseBonus.lck),
      cha_bonus: parseStat(baseBonus.cha),
      hp_growth: parseStat(statGrowths.hp),
      str_growth: parseStat(statGrowths.str),
      mag_growth: parseStat(statGrowths.mag),
      spd_growth: parseStat(statGrowths.spd),
      dex_growth: parseStat(statGrowths.dex),
      def_growth: parseStat(statGrowths.def),
      res_growth: parseStat(statGrowths.res),
      lck_growth: parseStat(statGrowths.lck),
      cha_growth: parseStat(statGrowths.cha)
    });
  }

  // --------------------------------------------------------------------------
  // Table 9: abilities
  // --------------------------------------------------------------------------
  console.log(`[Populating] abilities (${abilitiesData.length} records)...`);
  const insertedAbilities = new Set();
  for (const ab of abilitiesData) {
    if (insertedAbilities.has(ab.id)) continue;
    insertedAbilities.add(ab.id);
    runInsert('abilities', {
      id: ab.id,
      name: ab.name,
      category: ab.category,
      crest: ab.crest || null,
      trigger_rate: ab.trigger_rate || null,
      effect: ab.effect || ''
    });
  }

  // --------------------------------------------------------------------------
  // Table 11: class_abilities
  // --------------------------------------------------------------------------
  console.log('[Populating] class_abilities...');
  const insertedClassAbilities = new Set();
  for (const cl of classesData) {
    const classSlug = slugify(cl.name);
    if (cl.class_abilities) {
      for (const a of cl.class_abilities) {
        const aId = abilityNameToId.get(a.name.toLowerCase()) || slugify(a.name);
        const uniqueKey = `${classSlug}_${aId}_class`;
        if (!insertedClassAbilities.has(uniqueKey)) {
          insertedClassAbilities.add(uniqueKey);
          if (!insertedAbilities.has(aId)) {
            insertedAbilities.add(aId);
            runInsert('abilities', {
              id: aId,
              name: a.name,
              category: 'Class',
              crest: null,
              trigger_rate: null,
              effect: a.effect || ''
            });
          }
          runInsert('class_abilities', {
            id: `${classSlug}_ability_${aId}_class`,
            class_id: classSlug,
            ability_id: aId,
            ability_type: 'class'
          });
        }
      }
    }
    if (cl.master_abilities) {
      for (const a of cl.master_abilities) {
        const aId = abilityNameToId.get(a.name.toLowerCase()) || slugify(a.name);
        const uniqueKey = `${classSlug}_${aId}_mastery`;
        if (!insertedClassAbilities.has(uniqueKey)) {
          insertedClassAbilities.add(uniqueKey);
          if (!insertedAbilities.has(aId)) {
            insertedAbilities.add(aId);
            runInsert('abilities', {
              id: aId,
              name: a.name,
              category: 'Master',
              crest: null,
              trigger_rate: null,
              effect: a.effect || ''
            });
          }
          runInsert('class_abilities', {
            id: `${classSlug}_ability_${aId}_mastery`,
            class_id: classSlug,
            ability_id: aId,
            ability_type: 'mastery'
          });
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Table 15: items
  // --------------------------------------------------------------------------
  console.log(`[Populating] items (${itemsData.length} records)...`);
  const insertedItems = new Set();
  for (const it of itemsData) {
    const iId = slugify(it.name);
    if (insertedItems.has(iId)) continue;
    insertedItems.add(iId);
    runInsert('items', {
      id: iId,
      name: it.name,
      category: it.category,
      effect: it.effect || null,
      how_to_get: it.how_to_get || null
    });
  }

  // --------------------------------------------------------------------------
  // Table 1: characters
  // --------------------------------------------------------------------------
  console.log(`[Populating] characters (${charactersData.length} records)...`);
  for (const c of charactersData) {
    const artIds = extractCombatArtNames(c.abilities_and_combat_arts?.combat_arts).map(slugify);
    const spellIds = extractSpellNames(c.abilities_and_combat_arts?.magic_spells).map(slugify);

    runInsert('characters', {
      id: c.slug,
      name: c.name,
      slug: c.slug,
      affiliation: c.faction || null,
      crest: Array.isArray(c.crest_bloodmark) ? c.crest_bloodmark.join(', ') : (c.crest_bloodmark || null),
      voice_actor_en: c.voice_actors?.en || null,
      voice_actor_jp: c.voice_actors?.jp || null,
      birthday: c.birthday || null,
      likes: JSON.stringify(c.likes || []),
      dislikes: JSON.stringify(c.dislikes || []),
      interests: JSON.stringify(c.interests || []),
      unique_talent: c.unique_exploration_talent ? `${c.unique_exploration_talent.name || ''}: ${c.unique_exploration_talent.details || ''}` : null,
      combat_art_ids: JSON.stringify(artIds),
      spell_ids: JSON.stringify(spellIds)
    });
  }

  // --------------------------------------------------------------------------
  // Table 2: character_recruitment
  // --------------------------------------------------------------------------
  console.log('[Populating] character_recruitment...');
  for (const c of charactersData) {
    const recruitMap = c.recruitment || {};
    for (const route of ['cai', 'dietrich', 'theodora', 'leda']) {
      const rData = recruitMap[route];
      if (rData) {
        runInsert('character_recruitment', {
          id: `${c.slug}_route_${route}`,
          character_id: c.slug,
          route,
          chapter: rData.chapter || null,
          support_level: (rData.support !== undefined && rData.support !== null) ? rData.support : null,
          renown_level: (rData.renown !== undefined && rData.renown !== null) ? rData.renown : null,
          other_conditions: rData.other || null
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // Table 3: character_growths
  // --------------------------------------------------------------------------
  console.log(`[Populating] character_growths (${growthsData.length} records)...`);
  for (const g of growthsData) {
    const cSlug = charArchiveToSlug.get(g.character_id) || slugify(g.name);
    const gr = g.growths || g.growth_rates || g;
    runInsert('character_growths', {
      character_id: cSlug,
      hp: parseStat(gr.hp),
      str: parseStat(gr.str),
      mag: parseStat(gr.mag),
      dex: parseStat(gr.dex),
      spd: parseStat(gr.spd),
      lck: parseStat(gr.lck),
      def: parseStat(gr.def),
      res: parseStat(gr.res),
      cha: parseStat(gr.cha),
      preferred_skills: JSON.stringify(g.preferred_skills || []),
      non_ideal_skills: JSON.stringify(g.non_ideal_skills || [])
    });
  }

  // --------------------------------------------------------------------------
  // Table 4: character_class_recommendations (slugified class IDs)
  // --------------------------------------------------------------------------
  console.log(`[Populating] character_class_recommendations (${bestClassesData.length} records)...`);
  for (const bc of bestClassesData) {
    const cSlug = charArchiveToSlug.get(bc.character_id) || slugify(bc.name);
    const classesMap = bc.best_classes || {};
    const extractClassName = (val) => {
      if (!val) return null;
      if (typeof val === 'string') return val;
      if (typeof val === 'object' && val.class_name) return val.class_name;
      return null;
    };
    const beg = extractClassName(classesMap.beginner);
    const spec = extractClassName(classesMap.specialty);
    const adv = extractClassName(classesMap.advanced);
    const mast = extractClassName(classesMap.master);
    const div = extractClassName(classesMap.divine);

    runInsert('character_class_recommendations', {
      character_id: cSlug,
      overall_tier: bc.overall_tier || null,
      strengths_summary: JSON.stringify(bc.strengths || []),
      beginner_class_id: beg ? (classNameToId.get(beg.toLowerCase()) || slugify(beg)) : null,
      specialty_class_id: spec ? (classNameToId.get(spec.toLowerCase()) || slugify(spec)) : null,
      advanced_class_id: adv ? (classNameToId.get(adv.toLowerCase()) || slugify(adv)) : null,
      master_class_id: mast ? (classNameToId.get(mast.toLowerCase()) || slugify(mast)) : null,
      divine_class_id: div ? (classNameToId.get(div.toLowerCase()) || slugify(div)) : null
    });
  }

  // --------------------------------------------------------------------------
  // Table 5: character_gift_preferences
  // --------------------------------------------------------------------------
  console.log(`[Populating] character_gift_preferences (${giftsData.length} characters)...`);
  const insertedPreferences = new Set();
  for (const gf of giftsData) {
    const cSlug = charArchiveToSlug.get(gf.character_id) || slugify(gf.name);
    const tiers = [
      { tier: 'Really Liked', list: gf.really_liked || [] },
      { tier: 'Liked', list: gf.liked || [] },
      { tier: 'Disliked', list: gf.disliked || [] }
    ];

    for (const { tier, list } of tiers) {
      for (const giftName of list) {
        const iId = itemNameToId.get(giftName.toLowerCase()) || slugify(giftName);
        if (!insertedItems.has(iId)) {
          insertedItems.add(iId);
          runInsert('items', {
            id: iId,
            name: giftName,
            category: 'Gifts',
            effect: null,
            how_to_get: null
          });
        }
        const key = `${cSlug}_${iId}`;
        if (!insertedPreferences.has(key)) {
          insertedPreferences.add(key);
          runInsert('character_gift_preferences', {
            id: `${cSlug}_gift_${iId}`,
            character_id: cSlug,
            item_id: iId,
            preference_tier: tier
          });
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Table 6: character_bird_time_dialogues
  // --------------------------------------------------------------------------
  console.log(`[Populating] character_bird_time_dialogues (${birdTimeData.length} characters)...`);
  for (const bt of birdTimeData) {
    const cSlug = charArchiveToSlug.get(bt.character_id) || slugify(bt.name);
    let qaIdx = 1;
    for (const d of bt.bird_time_answers || []) {
      if (d.topic && d.best_answer) {
        runInsert('character_bird_time_dialogues', {
          id: `${cSlug}_qa_${qaIdx++}`,
          character_id: cSlug,
          topic: d.topic,
          best_answer: d.best_answer
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // Table 7: character_supports
  // --------------------------------------------------------------------------
  console.log('[Populating] character_supports from character profile HTML files...');
  const insertedSupports = new Set();
  for (const c of charactersData) {
    const cSlug = c.slug;
    const htmlPath = c.raw_source;
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf-8');
      const $ = cheerio.load(html);
      $('table').each((_, tbl) => {
        const txt = $(tbl).text();
        if (txt.includes('(A)') || txt.includes('(B)') || txt.includes('(C)')) {
          $(tbl).find('td, th').each((_, cell) => {
            const cellText = cleanText($(cell).text());
            if (!cellText) return;
            const match = cellText.match(/^([A-Za-z\s'\-]+?)\s*\(([A-CS])\)$/);
            if (match) {
              const partnerName = match[1].trim();
              const rank = match[2];
              const pSlug = charNameToSlug.get(partnerName.toLowerCase());
              if (pSlug && pSlug !== cSlug) {
                const key = `${cSlug}_${pSlug}`;
                if (!insertedSupports.has(key)) {
                  insertedSupports.add(key);
                  runInsert('character_supports', {
                    id: `${cSlug}_support_${pSlug}`,
                    character_id: cSlug,
                    partner_character_id: pSlug,
                    max_support_rank: rank
                  });
                }
              }
            }
          });
        }
      });
    }
  }

  // --------------------------------------------------------------------------
  // Table 8: character_base_stats
  // --------------------------------------------------------------------------
  console.log(`[Populating] character_base_stats (${characterBaseStatsData.length} records)...`);
  for (const item of characterBaseStatsData) {
    const bs = item.base_stats;
    runInsert('character_base_stats', {
      character_id: item.slug,
      hp: bs.hp,
      str: bs.str,
      mag: bs.mag,
      dex: bs.dex,
      spd: bs.spd,
      lck: bs.lck,
      def: bs.def,
      res: bs.res,
      cha: bs.cha
    });
  }

  // --------------------------------------------------------------------------
  // Table 11: character_abilities
  // --------------------------------------------------------------------------
  console.log('[Populating] character_abilities...');
  const insertedCharAbilities = new Set();
  for (const c of charactersData) {
    const cSlug = c.slug;
    const abs = c.abilities_and_combat_arts || {};

    // Personal ability
    if (abs.personal_ability?.name) {
      const pName = abs.personal_ability.name;
      const aId = abilityNameToId.get(pName.toLowerCase()) || slugify(pName);
      if (!insertedAbilities.has(aId)) {
        insertedAbilities.add(aId);
        runInsert('abilities', {
          id: aId,
          name: pName,
          category: 'Personal',
          crest: null,
          trigger_rate: null,
          effect: abs.personal_ability.effect || ''
        });
      }
      const key = `${cSlug}_${aId}_personal`;
      if (!insertedCharAbilities.has(key)) {
        insertedCharAbilities.add(key);
        runInsert('character_abilities', {
          id: `${cSlug}_ability_${aId}_personal`,
          character_id: cSlug,
          ability_id: aId,
          unlock_type: 'personal',
          unlock_level: null,
          trigger_rate: null
        });
      }
    }

    // Level up abilities
    for (const la of abs.level_up_abilities || []) {
      const laName = la.name || la;
      const aId = abilityNameToId.get(laName.toLowerCase()) || slugify(laName);
      if (!insertedAbilities.has(aId)) {
        insertedAbilities.add(aId);
        runInsert('abilities', {
          id: aId,
          name: laName,
          category: 'Level',
          crest: null,
          trigger_rate: null,
          effect: la.effect || ''
        });
      }
      const key = `${cSlug}_${aId}_level`;
      if (!insertedCharAbilities.has(key)) {
        insertedCharAbilities.add(key);
        const parsedLevel = (la.level && !isNaN(parseInt(la.level, 10))) ? parseInt(la.level, 10) : null;
        runInsert('character_abilities', {
          id: `${cSlug}_ability_${aId}_level`,
          character_id: cSlug,
          ability_id: aId,
          unlock_type: 'level',
          unlock_level: parsedLevel,
          trigger_rate: null
        });
      }
    }

    // Skill rank / skill level abilities
    for (const sa of abs.skill_level_abilities || []) {
      const saName = sa.name || sa;
      const aId = abilityNameToId.get(saName.toLowerCase()) || slugify(saName);
      if (!insertedAbilities.has(aId)) {
        insertedAbilities.add(aId);
        runInsert('abilities', {
          id: aId,
          name: saName,
          category: 'Skill',
          crest: null,
          trigger_rate: null,
          effect: sa.effect || ''
        });
      }
      const key = `${cSlug}_${aId}_skill`;
      if (!insertedCharAbilities.has(key)) {
        insertedCharAbilities.add(key);
        runInsert('character_abilities', {
          id: `${cSlug}_ability_${aId}_skill`,
          character_id: cSlug,
          ability_id: aId,
          unlock_type: 'skill',
          unlock_level: null,
          trigger_rate: null
        });
      }
    }
  }

  // Bloodmark abilities from abilities catalog
  const bloodmarkAbilities = abilitiesData.filter(a => a.category === 'Bloodmark');
  for (const b of bloodmarkAbilities) {
    if (b.used_by) {
      const names = b.used_by.split(/\s+/);
      for (const rawName of names) {
        const cSlug = charNameToSlug.get(rawName.toLowerCase());
        if (cSlug) {
          const key = `${cSlug}_${b.id}_bloodmark`;
          if (!insertedCharAbilities.has(key)) {
            insertedCharAbilities.add(key);
            runInsert('character_abilities', {
              id: `${cSlug}_ability_${b.id}_bloodmark`,
              character_id: cSlug,
              ability_id: b.id,
              unlock_type: 'bloodmark',
              unlock_level: null,
              trigger_rate: b.trigger_rate || null
            });
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Table 12: combat_arts
  // --------------------------------------------------------------------------
  console.log(`[Populating] combat_arts (${combatArtsData.length} records)...`);
  for (const ca of combatArtsData) {
    const cSlug = ca.character ? charNameToSlug.get(ca.character.toLowerCase()) || null : null;
    runInsert('combat_arts', {
      id: ca.id,
      name: ca.name,
      art_type: ca.art_type,
      weapon_type: ca.weapon_type || null,
      character_id: cSlug,
      might: ca.might || null,
      hit: ca.hit || null,
      crit: ca.crit || null,
      range: ca.range || null,
      durability_cost: ca.durability_cost || null,
      blaze_gain: ca.blaze_gain || null,
      req_blaze_gauge: ca.req_blaze_gauge || null,
      effect: ca.effect || null,
      learned_from: ca.learned_from || null
    });
  }

  // --------------------------------------------------------------------------
  // Table 13: weapons
  // --------------------------------------------------------------------------
  console.log(`[Populating] weapons (${weaponsData.length} records)...`);
  for (const w of weaponsData) {
    runInsert('weapons', {
      id: slugify(w.name),
      name: w.name,
      category: w.category,
      rank: w.rank || null,
      might: w.might !== undefined ? w.might : null,
      hit: w.hit !== undefined ? w.hit : null,
      crit: w.crit !== undefined ? w.crit : null,
      weight: w.weight !== undefined ? w.weight : null,
      durability: w.durability !== undefined ? w.durability : null,
      range: w.range || null,
      special_effects: w.special_effects || null
    });
  }

  // --------------------------------------------------------------------------
  // Table 14: spells
  // --------------------------------------------------------------------------
  console.log(`[Populating] spells (${spellsData.length} records)...`);
  for (const sp of spellsData) {
    runInsert('spells', {
      id: slugify(sp.name),
      name: sp.name,
      category: sp.category,
      rank: sp.rank || null,
      uses: sp.uses !== undefined ? sp.uses : null,
      might: sp.might !== undefined ? sp.might : null,
      hit: sp.hit !== undefined ? sp.hit : null,
      crit: sp.crit !== undefined ? sp.crit : null,
      range: sp.range || null,
      weight: sp.weight !== undefined ? sp.weight : null,
      effects: sp.effects || null
    });
  }

  // --------------------------------------------------------------------------
  // Table 16: quests & Table 17: quest_rewards
  // --------------------------------------------------------------------------
  console.log(`[Populating] quests & quest_rewards (${questsData.length} quests)...`);
  const questIdCounts = new Map();
  for (const q of questsData) {
    const baseId = slugify(q.title);
    let qId = baseId;
    if (questIdCounts.has(baseId)) {
      const cnt = questIdCounts.get(baseId) + 1;
      questIdCounts.set(baseId, cnt);
      qId = `${baseId}_${cnt}`;
    } else {
      questIdCounts.set(baseId, 1);
    }
    const avail = q.chapter_availability || {};
    runInsert('quests', {
      id: qId,
      title: q.title,
      category: q.category || 'Main Quest',
      cai_chapter: avail.cai || null,
      dietrich_chapter: avail.dietrich || null,
      theodora_chapter: avail.theodora || null,
      leda_chapter: avail.leda || null,
      client: q.client || null,
      objective: q.objective || null,
      strategy: q.strategy || null
    });

    let rIdx = 1;
    for (const rStr of q.rewards || []) {
      let rType = 'Item';
      let amount = 1;
      let rName = rStr;
      let matchedItemId = null;

      if (rStr.includes('Gold')) {
        rType = 'Gold';
        rName = 'Gold';
        const m = rStr.match(/(\d+)\s*Gold/i);
        amount = m ? parseInt(m[1], 10) : 1;
      } else if (rStr.includes('Renown')) {
        rType = 'Renown';
        rName = 'Renown';
        const m = rStr.match(/(\d+)\s*Renown/i);
        amount = m ? parseInt(m[1], 10) : 1;
      } else if (rStr.includes('Reveals') || rStr.includes('Unlocks')) {
        rType = 'Unlock';
      } else {
        rType = 'Item';
        matchedItemId = itemNameToId.get(rStr.toLowerCase()) || null;
      }

      runInsert('quest_rewards', {
        id: `${qId}_reward_${rIdx++}`,
        quest_id: qId,
        reward_type: rType,
        reward_name: rName,
        amount,
        item_id: matchedItemId
      });
    }
  }

  // --------------------------------------------------------------------------
  // Table 18: paralogues
  // --------------------------------------------------------------------------
  console.log(`[Populating] paralogues (${paraloguesData.length} records)...`);
  for (const p of paraloguesData) {
    let reqStr = null;
    if (typeof p.requirements === 'string') {
      reqStr = p.requirements;
    } else if (Array.isArray(p.requirements)) {
      reqStr = p.requirements.join('; ');
    } else if (p.requirements && typeof p.requirements === 'object') {
      reqStr = p.requirements.summary || JSON.stringify(p.requirements);
    }

    runInsert('paralogues', {
      id: slugify(p.title),
      title: p.title,
      character_associated: p.character_associated,
      recruitable_character: p.recruitable_character || null,
      requirements: reqStr,
      map_location: p.map_info?.location || p.map_info?.mapLocation || null,
      victory_condition: p.map_info?.victory_condition || p.map_info?.victoryCondition || null,
      defeat_condition: p.map_info?.defeat_condition || p.map_info?.defeatCondition || null,
      strategy: p.strategy || null
    });
  }

  // --------------------------------------------------------------------------
  // Table 19: story_routes & Table 20: story_chapters
  // --------------------------------------------------------------------------
  console.log(`[Populating] story_routes & story_chapters (${storyRoutesData.length} routes)...`);
  for (const r of storyRoutesData) {
    const routeId = slugify(r.route);
    runInsert('story_routes', {
      id: routeId,
      route_name: r.route,
      summary: r.summary || null,
      unlock_conditions: r.conditions || null
    });

    let chIdx = 1;
    for (const ch of r.chapters || []) {
      runInsert('story_chapters', {
        id: `${routeId}_part_${chIdx++}_${slugify(ch.title || 'ch')}`,
        route_id: routeId,
        chapter_number: ch.number || 1,
        chapter_title: ch.title,
        turn_limit: ch.turns ? parseInt(ch.turns, 10) : null,
        objectives: ch.objectives || null,
        clear_conditions: ch.conditions || null
      });
    }
  }

  // --------------------------------------------------------------------------
  // Table 21: mechanics_milestones
  // --------------------------------------------------------------------------
  const milestones = mechanicsData.notable_deeds_milestones || [];
  console.log(`[Populating] mechanics_milestones (${milestones.length} records)...`);
  for (const m of milestones) {
    const mName = m.milestone || m.name;
    runInsert('mechanics_milestones', {
      id: slugify(mName),
      milestone_name: mName,
      category: m.category || null,
      karma_shards_reward: m.karma_shards ? parseInt(m.karma_shards, 10) : null
    });
  }

  // --------------------------------------------------------------------------
  // Table 22: mechanics_temple_blessings
  // --------------------------------------------------------------------------
  const blessingsList = mechanicsData.temple_blessings?.blessings || [];
  const holyDaysList = mechanicsData.temple_blessings?.holy_days || [];
  const holyDaysByGod = new Map();
  for (const hd of holyDaysList) {
    if (hd.god) holyDaysByGod.set(hd.god.toLowerCase(), hd);
  }

  console.log(`[Populating] mechanics_temple_blessings (${blessingsList.length} records)...`);
  for (const b of blessingsList) {
    const gName = b.god || b.name;
    const hd = holyDaysByGod.get((b.god || '').toLowerCase()) || {};
    runInsert('mechanics_temple_blessings', {
      id: slugify(gName),
      god_name: gName,
      cost_normal: b.cost?.normal ? parseInt(b.cost.normal, 10) : null,
      cost_hard: b.cost?.hard ? parseInt(b.cost.hard, 10) : null,
      level_1_effect: b.levels?.level_1 || null,
      level_2_effect: b.levels?.level_2 || null,
      level_3_effect: b.levels?.level_3 || null,
      holy_days: Array.isArray(hd.holy_days) ? hd.holy_days.join(', ') : (hd.holy_days || null),
      perks: Array.isArray(hd.perks) ? hd.perks.join(', ') : (hd.perks || null)
    });
  }

  // --------------------------------------------------------------------------
  // Table 24: mounts
  // --------------------------------------------------------------------------
  console.log(`[Populating] mounts (${mountsData.length} records)...`);
  for (const m of mountsData) {
    runInsert('mounts', {
      id: m.id,
      name: m.name,
      type: m.type,
      stat_hp: m.stat_hp !== undefined ? m.stat_hp : null,
      stat_str: m.stat_str !== undefined ? m.stat_str : null,
      stat_def: m.stat_def !== undefined ? m.stat_def : null,
      stat_mag: m.stat_mag !== undefined ? m.stat_mag : null,
      stat_res: m.stat_res !== undefined ? m.stat_res : null,
      stat_dex: m.stat_dex !== undefined ? m.stat_dex : null,
      stat_spd: m.stat_spd !== undefined ? m.stat_spd : null,
      stat_lck: m.stat_lck !== undefined ? m.stat_lck : null,
      stat_bld: m.stat_bld !== undefined ? m.stat_bld : null,
      growth_hp: m.growth_hp !== undefined ? m.growth_hp : null,
      growth_str: m.growth_str !== undefined ? m.growth_str : null,
      growth_def: m.growth_def !== undefined ? m.growth_def : null,
      growth_mag: m.growth_mag !== undefined ? m.growth_mag : null,
      growth_res: m.growth_res !== undefined ? m.growth_res : null,
      growth_dex: m.growth_dex !== undefined ? m.growth_dex : null,
      growth_spd: m.growth_spd !== undefined ? m.growth_spd : null,
      growth_lck: m.growth_lck !== undefined ? m.growth_lck : null,
      growth_bld: m.growth_bld !== undefined ? m.growth_bld : null,
      abilities: m.abilities ? JSON.stringify(m.abilities) : null,
      obtain: m.obtain || null,
      notes: m.notes || null
    });
  }

  // --------------------------------------------------------------------------
  // Table 24: mechanics_thermae_baths
  // --------------------------------------------------------------------------
  const bathsList = mechanicsData.thermae_baths?.baths || [];
  console.log(`[Populating] mechanics_thermae_baths (${bathsList.length} records)...`);
  for (const bt of bathsList) {
    const bName = bt.bath_name || bt.bath || bt.name;
    runInsert('mechanics_thermae_baths', {
      id: slugify(bName),
      bath_name: bName,
      renown_level_required: bt.renown_level_required ? parseInt(bt.renown_level_required, 10) : (bt.renown_level ? parseInt(bt.renown_level, 10) : 8),
      possible_abilities: Array.isArray(bt.possible_abilities) ? bt.possible_abilities.join(', ') : (bt.possible_abilities || null)
    });
  }

  // --------------------------------------------------------------------------
  // Table 25: mechanics_terrain
  // --------------------------------------------------------------------------
  const terrains = mechanicsData.terrain_effects || [];
  console.log(`[Populating] mechanics_terrain (${terrains.length} records)...`);
  for (const t of terrains) {
    const tName = t.name || t.terrain || 'Unknown';
    runInsert('mechanics_terrain', {
      id: slugify(tName),
      terrain_name: tName,
      category: t.category || null,
      effect: t.effect || '',
      unaffected_classes: Array.isArray(t.unaffected_classes) ? t.unaffected_classes.join(', ') : (t.unaffected_classes || null)
    });
  }

  // --------------------------------------------------------------------------
  // Table 26: mechanics_god_trials
  // --------------------------------------------------------------------------
  const trials = mechanicsData.god_trials || [];
  console.log(`[Populating] mechanics_god_trials (${trials.length} records)...`);
  for (const tr of trials) {
    const gName = tr.god || tr.name;
    runInsert('mechanics_god_trials', {
      id: slugify(gName),
      god_name: gName,
      trial_name: tr.trial_name || `${tr.god}'s Trial`,
      divine_buffs: Array.isArray(tr.enemy_buffs) ? tr.enemy_buffs.join('; ') : (tr.divine_buffs || null),
      equipment_rewards: Array.isArray(tr.rewards) ? tr.rewards.join('; ') : (tr.equipment_rewards || null),
      recommended_strategy: tr.strategy || null
    });
  }

  sqlDumpStatements.push('');
  sqlDumpStatements.push('COMMIT;');
  sqlDumpStatements.push('PRAGMA foreign_keys = ON;');

  // 4. Verify Integrity in SQLite
  console.log('\n[Verification] Running integrity check on SQLite database...');
  const fkErrors = db.prepare('PRAGMA foreign_key_check;').all();
  if (fkErrors.length > 0) {
    console.error(`[Integrity Warning] Found ${fkErrors.length} foreign key check warnings:`, fkErrors);
  } else {
    console.log('[Integrity] Foreign key constraints: 100% VALID (0 errors).');
  }

  // 5. Output Dump SQL
  console.log(`[Dump] Writing SQL dump file to ${DUMP_OUTPUT_PATH}...`);
  fs.writeFileSync(DUMP_OUTPUT_PATH, sqlDumpStatements.join('\n'), 'utf-8');

  // Close sync DB to safely read binary buffer
  db.close();

  // 6. Output Gzip Compressed Database
  console.log(`[Compression] Generating gzip archive at ${DB_GZ_OUTPUT_PATH}...`);
  const rawDbBuffer = fs.readFileSync(DB_OUTPUT_PATH);
  const compressedGzBuffer = zlib.gzipSync(rawDbBuffer, { level: 9 });
  fs.writeFileSync(DB_GZ_OUTPUT_PATH, compressedGzBuffer);

  const rawSizeKb = (rawDbBuffer.length / 1024).toFixed(1);
  const gzSizeKb = (compressedGzBuffer.length / 1024).toFixed(1);
  const dumpSizeKb = (fs.statSync(DUMP_OUTPUT_PATH).size / 1024).toFixed(1);
  const ratio = ((compressedGzBuffer.length / rawDbBuffer.length) * 100).toFixed(1);

  console.log('\n====================================================');
  console.log('--- DATABASE BUILD COMPLETED SUCCESSFULLY ---');
  console.log('====================================================');
  console.log(`✓ SQLite Binary DB:    ${DB_OUTPUT_PATH} (${rawSizeKb} KB)`);
  console.log(`✓ CDN Compressed DB:   ${DB_GZ_OUTPUT_PATH} (${gzSizeKb} KB, ${ratio}% of original)`);
  console.log(`✓ SQL Script Dump:     ${DUMP_OUTPUT_PATH} (${dumpSizeKb} KB)`);
  console.log('====================================================\n');
}

buildDatabase().catch(err => {
  console.error('\n[Builder Error]', err);
  process.exit(1);
});
