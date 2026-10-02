import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { fetchOrCache } from './utils/downloader.js';
import { cleanText, parseNumber, slugify } from './utils/html_helpers.js';

const HUB_URL = 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/620256';
const HUB_RAW_PATH = 'raw_extracts/classes/list_of_classes_620256.html';

const TIER_PAGES = [
  { tier: 'Beginner', id: '624166', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624166', file: 'raw_extracts/classes/beginner_624166.html' },
  { tier: 'Specialty', id: '624168', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624168', file: 'raw_extracts/classes/specialty_624168.html' },
  { tier: 'Advanced', id: '624169', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624169', file: 'raw_extracts/classes/advanced_624169.html' },
  { tier: 'Master', id: '624171', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624171', file: 'raw_extracts/classes/master_624171.html' },
  { tier: 'Divine', id: '624172', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624172', file: 'raw_extracts/classes/divine_624172.html' }
];

const KNOWN_WEAPONS = ['Sword', 'Axe', 'Bow', 'Gauntlet', 'Spear', 'Black Magic', 'White Magic', 'Dark Magic', 'Staff', 'Reason', 'Faith'];

function parseSkillList(str) {
  const list = [];
  if (!str) return list;
  const skillRegex = /([A-Za-z\s]+?)(?:Skill)?\s*\(([A-S]\+?)\)/gi;
  let match;
  while ((match = skillRegex.exec(str)) !== null) {
    const skillName = cleanText(match[1]);
    const rank = match[2].trim();
    if (skillName && rank) {
      list.push({ skill: skillName, rank });
    }
  }
  return list;
}

export function parseClassPage(html, rawSource, fallbackInfo = {}) {
  const $ = cheerio.load(html);

  // Class Name
  const pageTitle = cleanText($('h1').text());
  let name = pageTitle.replace(/\s+(Stats|Skills|Abilities|Overview|Guide|,|and).*$/i, '').trim();
  if (!name && fallbackInfo.name) {
    name = fallbackInfo.name;
  }

  let tier = fallbackInfo.tier || null;
  let type = null;
  let movement = null;
  const usable_weapons = [];

  // Parse Basic Info table
  $('table').each((_, table) => {
    const heading = cleanText($(table).prevAll('h2, h3').first().text());
    if (heading.includes('Basic Info') || heading.includes('Overview')) {
      $(table).find('tr').each((_, tr) => {
        const rowHeader = cleanText($(tr).find('th, td').first().text()).toLowerCase();
        const rowVal = cleanText($(tr).find('th, td').last().text());

        if (rowHeader.includes('tier') && !tier) {
          tier = rowVal;
        } else if (rowHeader.includes('type')) {
          type = rowVal;
        } else if (rowHeader.includes('movement')) {
          movement = parseNumber(rowVal);
        } else if (rowHeader.includes('weapon')) {
          for (const w of KNOWN_WEAPONS) {
            const regex = new RegExp(`\\b${w}\\b`, 'i');
            if (regex.test(rowVal) && !usable_weapons.includes(w)) {
              usable_weapons.push(w);
            }
          }
        }
      });
    }
  });

  // Requirements (Exam Requirements)
  const requirements = {
    license: null,
    item: null,
    ideal_level: null,
    renown_level: null,
    primary_skills: [],
    secondary_skills: [],
    unlock_condition: null
  };

  $('table').each((_, table) => {
    const heading = cleanText($(table).prevAll('h2, h3').first().text());
    if (heading.includes('Exam Requirements') || heading.includes('Unlock Requirements')) {
      $(table).find('tr').each((_, tr) => {
        const header = cleanText($(tr).find('th, td').first().text()).toLowerCase();
        const val = cleanText($(tr).find('th, td').last().text());
        if (header.includes('license')) {
          requirements.license = val;
        } else if (header.includes('item')) {
          requirements.item = val;
        } else if (header.includes('ideal lv') || header.includes('level')) {
          requirements.ideal_level = parseNumber(val);
        } else if (header.includes('renown lv') || header.includes('renown')) {
          requirements.renown_level = parseNumber(val);
        } else if (header.includes('primary skill')) {
          requirements.primary_skills = parseSkillList(val);
        } else if (header.includes('secondary skill')) {
          requirements.secondary_skills = parseSkillList(val);
        }
      });
    }
  });

  // Unlock conditions from headings
  $('h2, h3').each((_, el) => {
    const t = cleanText($(el).text());
    if (t.includes('Restore') || t.includes('Obtain') || t.includes('Complete') || t.includes('Unlock')) {
      if (!t.includes('How to Unlock') && !t.includes('Unlock Master Classes Starting Part 3') && !t.includes('Exam Requirements')) {
        requirements.unlock_condition = t;
        const nextP = $(el).next('p');
        if (nextP.length) {
          const pText = cleanText(nextP.text());
          if (pText) requirements.unlock_condition += `: ${pText}`;
        }
      }
    }
  });

  // Base Stats and Growths
  const base_stats_bonus = {};
  const stat_growths = {};
  $('table').each((_, table) => {
    const heading = cleanText($(table).prevAll('h2, h3').first().text());
    if (heading.includes('Base Stats') || heading.includes('Growth') || heading.includes('Stats')) {
      $(table).find('tr').slice(1).each((_, tr) => {
        const tds = $(tr).find('th, td');
        if (tds.length >= 3) {
          const stat = cleanText(tds.eq(0).text()).toLowerCase();
          const bonus = parseNumber(tds.eq(1).text());
          const growth = parseNumber(tds.eq(2).text());
          if (stat) {
            base_stats_bonus[stat] = bonus;
            stat_growths[stat] = growth;
          }
        }
      });
    }
  });

  // Skill EXP Bonus
  const skill_exp_bonuses = [];
  $('table').each((_, table) => {
    const heading = cleanText($(table).prevAll('h2, h3').first().text());
    if (heading.includes('Skill EXP Bonus')) {
      const text = cleanText($(table).text().replace(/Skill EXP Bonus/gi, ''));
      const parts = text.split(',');
      for (const part of parts) {
        const match = part.match(/([A-Za-z\s]+?)\s*([+-]?\d+)/);
        if (match) {
          skill_exp_bonuses.push({
            skill: cleanText(match[1]),
            bonus: parseNumber(match[2])
          });
        }
      }
    }
  });

  // Master Ability
  const master_abilities = [];
  $('table').each((_, table) => {
    const heading = cleanText($(table).prevAll('h2, h3').first().text());
    if (heading.includes('Master Ability')) {
      $(table).find('tr').each((_, tr) => {
        const tds = $(tr).find('th, td');
        if (tds.length >= 2) {
          const abName = cleanText(tds.eq(0).text());
          const abEffect = cleanText(tds.eq(1).text());
          if (abName) {
            master_abilities.push({ name: abName, effect: abEffect });
          }
        }
      });
    }
  });

  // Class Ability
  const class_abilities = [];
  $('table').each((_, table) => {
    const heading = cleanText($(table).prevAll('h2, h3').first().text());
    if (heading.includes('Class Ability')) {
      $(table).find('tr').each((_, tr) => {
        const tds = $(tr).find('th, td');
        if (tds.length >= 2) {
          const abName = cleanText(tds.eq(0).text());
          const abEffect = cleanText(tds.eq(1).text());
          if (abName) {
            class_abilities.push({ name: abName, effect: abEffect });
          }
        }
      });
    }
  });

  return {
    id: fallbackInfo.id || '',
    name,
    tier,
    type,
    movement,
    usable_weapons,
    requirements,
    base_stats_bonus: Object.keys(base_stats_bonus).length > 0 ? base_stats_bonus : null,
    stat_growths: Object.keys(stat_growths).length > 0 ? stat_growths : null,
    skill_exp_bonuses,
    class_abilities,
    master_abilities,
    url: fallbackInfo.url || '',
    raw_source: rawSource
  };
}

export async function scrapeClasses() {
  console.log('[Class Scrapper] Fetching Class Hub and Tier pages...');
  const { html: hubHtml } = await fetchOrCache(HUB_URL, HUB_RAW_PATH, 100);

  for (const tp of TIER_PAGES) {
    try {
      await fetchOrCache(tp.url, tp.file, 100);
    } catch (err) {
      console.warn(`[Class Scrapper] Tier page fetch warning (${tp.tier}): ${err.message}`);
    }
  }

  const $ = cheerio.load(hubHtml);
  const classesList = [];
  const tiers = ['Beginner', 'Specialty', 'Advanced', 'Master', 'Divine'];

  $('div.scroll--table').each((i, wrapper) => {
    const tier = tiers[i] || 'Unknown';
    $(wrapper).find('table tr').slice(1).each((_, tr) => {
      const nameCell = $(tr).find('th, td').first();
      const a = nameCell.find('a');
      const name = a.length ? cleanText(a.text()) : cleanText(nameCell.text());
      const href = a.attr('href') || '';
      const id = href.match(/\/archives\/(\d+)/)?.[1] || '';
      const fullUrl = href.startsWith('http') ? href : `https://game8.co${href}`;
      if (name && id) {
        classesList.push({ tier, name, id, url: fullUrl });
      }
    });
  });

  console.log(`[Class Scrapper] Discovered ${classesList.length} classes across all tiers.`);

  const records = [];
  for (const c of classesList) {
    const fileName = `${slugify(c.name)}_${c.id}.html`;
    const localPath = `raw_extracts/classes/${fileName}`;
    const { html, raw_source } = await fetchOrCache(c.url, localPath, 100);
    const parsed = parseClassPage(html, raw_source, c);
    records.push(parsed);
  }

  // Save extractions/classes.json
  const outputPath = path.resolve('extractions/classes.json');
  await fs.writeFile(outputPath, JSON.stringify(records, null, 2), 'utf-8');
  console.log(`[Class Scrapper] Saved ${records.length} class records to ${outputPath}`);

  return records;
}

if (process.argv[1] && process.argv[1].endsWith('class_scrapper.js')) {
  scrapeClasses().catch(err => {
    console.error('[Class Scrapper] Error:', err);
    process.exit(1);
  });
}
