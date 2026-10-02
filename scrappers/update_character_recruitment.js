import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { fetchOrCache } from './utils/downloader.js';
import { cleanText } from './utils/html_helpers.js';

const RECRUITMENT_URL = 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/620957';
const RECRUITMENT_RAW_PATH = 'raw_extracts/guides/recruitment_requirements_620957.html';
const CHARACTERS_JSON_PATH = 'extractions/characters.json';

/**
 * Parses route cell HTML into structured recruitment condition object
 */
export function parseRouteCell(cellHtml) {
  if (!cellHtml) return null;
  const textWithBreaks = cellHtml.replace(/<br\s*[\/]?>/gi, '\n');
  const clean = cleanText(cheerio.load(textWithBreaks).text());
  if (!clean || clean === '-' || clean === 'null' || clean === '—') {
    return null;
  }

  const lines = clean.split(/(?:・|\n)/).map(l => l.trim().replace(/^・\s*/, '')).filter(Boolean);
  if (lines.length === 0) return null;

  let chapter = null;
  let support = null;
  let renown = null;
  let otherParts = [];

  for (const line of lines) {
    const supportMatch = line.match(/Support\s*(?:Lv\.?|Level)?\s*(\d+)/i);
    const renownMatch = line.match(/(\d+)\s*Renown/i) || line.match(/Renown\s*(?:Lv\.?|Level)?\s*(\d+)/i);
    const chapterMatch = line.match(/(?:Part\s+[IVX0-9]+|Prologue)[^,\n]*/i) || line.match(/Chapter\s+\d+/i);

    if (supportMatch) {
      support = parseInt(supportMatch[1], 10);
    } else if (renownMatch) {
      renown = parseInt(renownMatch[1], 10);
    } else if (chapterMatch && !chapter) {
      chapter = line.trim();
    } else {
      otherParts.push(line.trim());
    }
  }

  if (!chapter && lines.length > 0) {
    chapter = lines[0];
  }

  let other = otherParts.length > 0 ? otherParts.join('; ') : null;
  if (!other && support === null && renown === null) {
    other = "Joins Automatically";
  }

  return {
    chapter: chapter ? chapter.replace(/^・\s*/, '').trim() : null,
    support,
    renown,
    other
  };
}

/**
 * Extracts structured recruitment rules from 620957 guide page
 */
export async function scrapeRecruitmentRules() {
  console.log(`[Scraper] Fetching recruitment page: ${RECRUITMENT_URL}`);
  const { html, raw_source } = await fetchOrCache(RECRUITMENT_URL, RECRUITMENT_RAW_PATH, 100);
  const $ = cheerio.load(html);

  const recruitmentMap = new Map();

  // Table 1: Standard Playable Characters (49 characters)
  $('table').eq(1).find('tr').slice(1).each((_, tr) => {
    const cells = $(tr).find('th, td');
    const charName = cleanText(cells.eq(0).text());
    if (!charName) return;

    const cai = parseRouteCell(cells.eq(1).html());
    const dietrich = parseRouteCell(cells.eq(2).html());
    const theodora = parseRouteCell(cells.eq(3).html());
    const leda = parseRouteCell(cells.eq(4).html());

    recruitmentMap.set(charName.toLowerCase(), {
      cai,
      dietrich,
      theodora,
      leda
    });
  });

  // Table 3: Timeskip Recruits (Part 2 & Part 3)
  $('table').eq(3).find('tr').slice(1).each((_, tr) => {
    const cells = $(tr).find('th, td');
    const rawName = cleanText(cells.eq(0).text().replace(/Show spoiler/gi, ''));
    const avail = cleanText(cells.eq(1).text());
    const cond = cleanText(cells.eq(2).text());

    const routeObj = {
      chapter: avail || null,
      support: null,
      renown: null,
      other: cond || "Joins Automatically"
    };

    recruitmentMap.set(rawName.toLowerCase(), {
      cai: { ...routeObj },
      dietrich: { ...routeObj },
      theodora: { ...routeObj },
      leda: { ...routeObj }
    });
  });

  // Main Flame Lords Defaults
  const flameLords = [
    { name: 'cai', mainRoute: 'cai' },
    { name: 'dietrich', mainRoute: 'dietrich' },
    { name: 'theodora', mainRoute: 'theodora' },
    { name: 'leda', mainRoute: 'leda' }
  ];

  for (const lord of flameLords) {
    const routes = {
      cai: { chapter: "Part 2 Chapter 1", support: null, renown: null, other: "Joins in Part 2 War Arc" },
      dietrich: { chapter: "Part 2 Chapter 1", support: null, renown: null, other: "Joins in Part 2 War Arc" },
      theodora: { chapter: "Part 2 Chapter 1", support: null, renown: null, other: "Joins in Part 2 War Arc" },
      leda: { chapter: "Part 2 Chapter 1", support: null, renown: null, other: "Joins in Part 2 War Arc" }
    };
    routes[lord.mainRoute] = {
      chapter: "Part I Chapter 1",
      support: null,
      renown: null,
      other: "Joins Automatically (Main Character)"
    };
    recruitmentMap.set(lord.name, routes);
  }

  return { recruitmentMap, raw_source };
}

/**
 * Updates extractions/characters.json with structured recruitment data
 */
export async function updateCharactersRecruitment() {
  const { recruitmentMap, raw_source } = await scrapeRecruitmentRules();
  
  const charactersRaw = await fs.readFile(CHARACTERS_JSON_PATH, 'utf-8');
  const characters = JSON.parse(charactersRaw);

  let updatedCount = 0;

  for (const char of characters) {
    const key = char.name.toLowerCase();
    const mapped = recruitmentMap.get(key);

    if (mapped) {
      char.recruitment = mapped;
      updatedCount++;
    } else {
      console.warn(`[Warning] No recruitment data mapped for: ${char.name}`);
    }
  }

  await fs.writeFile(CHARACTERS_JSON_PATH, JSON.stringify(characters, null, 2), 'utf-8');
  console.log(`[Success] Updated recruitment field for ${updatedCount}/${characters.length} characters in ${CHARACTERS_JSON_PATH}`);
}

// Direct execution
if (process.argv[1] && process.argv[1].endsWith('update_character_recruitment.js')) {
  updateCharactersRecruitment().catch(err => {
    console.error('[Error]', err);
    process.exit(1);
  });
}
