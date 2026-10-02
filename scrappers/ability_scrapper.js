import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { fetchOrCache } from './utils/downloader.js';
import { cleanText, parseNumber, slugify } from './utils/html_helpers.js';

const ABILITIES_URL = 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/623691';
const ABILITIES_RAW_PATH = 'raw_extracts/abilities_arts/abilities_623691.html';

const COMBAT_ARTS_URL = 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/620961';
const COMBAT_ARTS_RAW_PATH = 'raw_extracts/abilities_arts/combat_arts_620961.html';

const BLAZE_ARTS_URL = 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/620483';
const BLAZE_ARTS_RAW_PATH = 'raw_extracts/abilities_arts/blaze_arts_620483.html';

/**
 * Scrapes all abilities from the abilities page.
 */
export function parseAbilities(html, rawSource) {
  const $ = cheerio.load(html);

  const sections = [
    { title: 'All Personal Abilities', category: 'Personal' },
    { title: 'All Class Abilities', category: 'Class' },
    { title: 'All Master Abilities', category: 'Master' },
    { title: 'All Skill Abilities', category: 'Skill' },
    { title: 'All Mount Abilities', category: 'Mount' },
    { title: 'All Level Abilities', category: 'Level' },
    { title: 'All Bloodmark Abilities', category: 'Bloodmark' }
  ];

  const abilities = [];

  for (const s of sections) {
    const table = $(`h3:contains("${s.title}")`).nextAll('table').first();
    table.find('tr').slice(1).each((_, tr) => {
      const tds = $(tr).find('td');
      if (tds.length < 2) return;

      const name = cleanText(tds.first().text());
      const rawDetails = cleanText(tds.last().text());

      // Crest (for Bloodmark abilities)
      let crest = null;
      const crestMatch = rawDetails.match(/Crest:\s*([A-Za-z0-9\s]+?)(?=\s+Effect:|$)/i);
      if (crestMatch) {
        crest = crestMatch[1].trim();
      }

      // Trigger rate
      let trigger_rate = null;
      const triggerMatch = rawDetails.match(/Trigger(?:ed)?\s*%\s*=\s*([0-9.]+)/i);
      if (triggerMatch) {
        trigger_rate = parseFloat(triggerMatch[1]);
      }

      // Used by
      let used_by = null;
      const usedByMatch = rawDetails.match(/Used\s*by:\s*(.+)$/i);
      if (usedByMatch) {
        used_by = usedByMatch[1].trim();
      }

      // Mastered by
      let mastered_by = null;
      const masteredByMatch = rawDetails.match(/Mastered\s*by:\s*(.+)$/i);
      if (masteredByMatch) {
        mastered_by = masteredByMatch[1].trim();
      }

      // Unlock condition (e.g. Bond Level Unlock: Wild Horse Lv. 3)
      let unlock_condition = null;
      const bondMatch = rawDetails.match(/Bond\s*Level\s*Unlock:\s*(.+)$/i);
      if (bondMatch) {
        unlock_condition = bondMatch[1].trim();
      }

      // Clean effect description
      let effect = rawDetails;
      if (crestMatch) {
        effect = effect.replace(/Crest:\s*[A-Za-z0-9\s]+?(?=\s+Effect:|$)/i, '');
      }
      effect = effect.replace(/^\s*Effect:\s*/i, '');
      effect = effect.replace(/Trigger(?:ed)?\s*%\s*=\s*[0-9.]+\.?/gi, '');
      effect = effect.replace(/Used\s*by:\s*.+$/gi, '');
      effect = effect.replace(/Mastered\s*by:\s*.+$/gi, '');
      effect = effect.replace(/Bond\s*Level\s*Unlock:\s*.+$/gi, '');
      effect = effect.trim().replace(/^[\s,.;]+|[\s,.;]+$/g, '');

      abilities.push({
        id: slugify(name),
        name,
        category: s.category,
        crest,
        trigger_rate,
        effect,
        used_by,
        mastered_by,
        unlock_condition,
        raw_source: rawSource
      });
    });
  }

  return abilities;
}

/**
 * Scrapes Combat Arts and Blaze Arts from their respective pages.
 */
export function parseCombatAndBlazeArts(combatHtml, combatRawSource, blazeHtml, blazeRawSource) {
  const arts = [];

  // Parse Combat Arts
  const $c = cheerio.load(combatHtml);
  const weaponSections = [
    { title: 'All Axe Combat Arts', weapon: 'Axe' },
    { title: 'All Bow Combat Arts', weapon: 'Bow' },
    { title: 'All Gauntlet Combat Arts', weapon: 'Gauntlet' },
    { title: 'All Spear Combat Arts', weapon: 'Spear' },
    { title: 'All Sword Combat Arts', weapon: 'Sword' },
    { title: 'All Utility Combat Arts', weapon: 'Utility' }
  ];

  for (const ws of weaponSections) {
    const table = $c(`h3:contains("${ws.title}")`).nextAll('table').first();
    const trs = table.find('tr');

    for (let i = 1; i < trs.length; i += 2) {
      const row1 = trs.eq(i);
      const row2 = trs.eq(i + 1);

      const name = cleanText(row1.find('th, td').first().text());
      const might = parseNumber(row1.find('th, td').eq(1).text());
      const hit = parseNumber(row1.find('th, td').eq(2).text());
      const crit = parseNumber(row1.find('th, td').eq(3).text());
      const range = cleanText(row1.find('th, td').eq(4).text());
      const cost = parseNumber(row1.find('th, td').eq(5).text());

      let effect = cleanText(row2.text());
      effect = effect.replace(/^\s*Effect:\s*/i, '').trim();

      if (name) {
        arts.push({
          id: slugify(name),
          name,
          art_type: 'Combat Art',
          weapon_type: ws.weapon,
          might: might !== null ? might : 0,
          hit: hit !== null ? hit : 0,
          crit: crit !== null ? crit : 0,
          range: range || '1',
          durability_cost: cost !== null ? cost : 0,
          effect,
          raw_source: combatRawSource
        });
      }
    }
  }

  // Parse Blaze Arts
  const $b = cheerio.load(blazeHtml);
  const blazeTable = $b('h3:contains("All Blaze Arts")').nextAll('table').first();
  blazeTable.find('tr').slice(1).each((_, tr) => {
    const tds = $b(tr).find('td');
    if (tds.length < 3) return;

    const name = cleanText(tds.eq(0).text());
    const character = cleanText(tds.eq(1).text());
    const rawEffect = cleanText(tds.eq(2).text());

    const rangeMatch = rawEffect.match(/Range:\s*([0-9-]+)/i);
    const blazeMatch = rawEffect.match(/Blaze:\s*([0-9]+)/i);
    const reqMatch = rawEffect.match(/Req\.\s*Blaze\s*Gauge:\s*([0-9]+)/i);
    const learnedMatch = rawEffect.match(/Learned\s*from:\s*(.+)$/i);

    let effect = rawEffect
      .replace(/Range:\s*[0-9-]+/gi, '')
      .replace(/Req\.\s*Blaze\s*Gauge:\s*[0-9]+/gi, '')
      .replace(/Blaze:\s*[0-9]+/gi, '')
      .replace(/Learned\s*from:\s*.+$/gi, '')
      .trim();

    if (name) {
      arts.push({
        id: slugify(name),
        name,
        art_type: 'Blaze Art',
        weapon_type: null,
        character: character || null,
        might: null,
        hit: null,
        crit: null,
        range: rangeMatch ? rangeMatch[1] : null,
        durability_cost: null,
        blaze_gain: blazeMatch ? parseNumber(blazeMatch[1]) : null,
        req_blaze_gauge: reqMatch ? parseNumber(reqMatch[1]) : null,
        effect,
        learned_from: learnedMatch ? cleanText(learnedMatch[1]) : null,
        raw_source: blazeRawSource
      });
    }
  });

  return arts;
}

export async function scrapeAbilitiesAndArts() {
  console.log('[Ability Scrapper] Fetching abilities and combat arts HTML pages...');
  const { html: abilitiesHtml, raw_source: abilitiesRawSource } = await fetchOrCache(ABILITIES_URL, ABILITIES_RAW_PATH, 100);
  const { html: combatHtml, raw_source: combatRawSource } = await fetchOrCache(COMBAT_ARTS_URL, COMBAT_ARTS_RAW_PATH, 100);
  const { html: blazeHtml, raw_source: blazeRawSource } = await fetchOrCache(BLAZE_ARTS_URL, BLAZE_ARTS_RAW_PATH, 100);

  // Parse abilities
  console.log('[Ability Scrapper] Parsing abilities...');
  const abilities = parseAbilities(abilitiesHtml, abilitiesRawSource);
  const abilitiesPath = path.resolve('extractions/abilities.json');
  await fs.writeFile(abilitiesPath, JSON.stringify(abilities, null, 2), 'utf-8');
  console.log(`[Ability Scrapper] Saved ${abilities.length} abilities to ${abilitiesPath}`);

  // Parse combat arts and blaze arts
  console.log('[Ability Scrapper] Parsing combat and blaze arts...');
  const combatArts = parseCombatAndBlazeArts(combatHtml, combatRawSource, blazeHtml, blazeRawSource);
  const combatArtsPath = path.resolve('extractions/combat_arts.json');
  await fs.writeFile(combatArtsPath, JSON.stringify(combatArts, null, 2), 'utf-8');
  console.log(`[Ability Scrapper] Saved ${combatArts.length} combat and blaze arts to ${combatArtsPath}`);

  return { abilities, combatArts };
}

if (process.argv[1] && process.argv[1].endsWith('ability_scrapper.js')) {
  scrapeAbilitiesAndArts().catch(err => {
    console.error('[Ability Scrapper] Error:', err);
    process.exit(1);
  });
}
