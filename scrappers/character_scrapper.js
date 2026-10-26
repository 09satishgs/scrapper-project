import * as cheerio from 'cheerio';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchOrCache } from './utils/downloader.js';
import { cleanText, parseNumber, slugify } from './utils/html_helpers.js';
import { scrapeRecruitmentRules } from './update_character_recruitment.js';

const CATALOG_PATH = 'extractions/catalog.json';
const OUTPUT_DIR = 'extractions';

/**
 * Finds all elements between headingElem and the next stopSelector (default 'h2')
 */
function getSectionElements($, headingElem, stopSelector = 'h2') {
  const elements = [];
  let curr = $(headingElem).next();
  while (curr.length && !curr.is(stopSelector)) {
    elements.push(curr);
    curr = curr.next();
  }
  return elements;
}

/**
 * Finds a table matching a predicate within the siblings/children under a heading
 */
function findTableInSection($, headingElem, predicate, stopSelector = 'h2') {
  let curr = $(headingElem).next();
  while (curr.length && !curr.is(stopSelector)) {
    if (curr.is('table') && (!predicate || predicate(curr))) {
      return curr;
    }
    const nested = curr.find('table');
    for (let i = 0; i < nested.length; i++) {
      const t = nested.eq(i);
      if (!predicate || predicate(t)) {
        return t;
      }
    }
    curr = curr.next();
  }
  return null;
}

/**
 * Parses individual class tier card/row
 */
function parseClassRow($, tr) {
  const tds = tr.find('td');
  if (tds.length === 0) return null;
  const nameCell = tds.eq(0);
  const className = cleanText(nameCell.find('a').text()) || cleanText(nameCell.text());
  const detailsCell = tds.eq(1);
  const abilitiesCell = tds.eq(2);

  const typeMatch = detailsCell.text().match(/Type:\s*([A-Za-z]+)/i);
  const primarySkillMatch = detailsCell.text().match(/Primary Skill:\s*(.*?)(?:Secondary Skill:|Usable Weapons:|$)/i);
  const secondarySkillMatch = detailsCell.text().match(/Secondary Skill:\s*(.*?)(?:Usable Weapons:|$)/i);

  const usableWeapons = detailsCell.find('span.js-discription-tooltip img, template.js-tooltip-content')
    .map((_, el) => $(el).attr('alt') || cleanText($(el).text())).get().filter(Boolean);

  const classAbilities = abilitiesCell.find('div.align')
    .map((_, el) => cleanText($(el).text()).replace(/^・/, '')).get().filter(Boolean);

  return {
    class_name: className,
    type: typeMatch ? cleanText(typeMatch[1]) : null,
    primary_skill: primarySkillMatch ? cleanText(primarySkillMatch[1]) : null,
    secondary_skill: secondarySkillMatch ? cleanText(secondarySkillMatch[1]) : null,
    usable_weapons: Array.from(new Set(usableWeapons)),
    abilities: classAbilities
  };
}

/**
 * Parses a single character HTML page into the 5 target schema models
 */
export function parseCharacter(html, rawSource, meta = {}) {
  const $ = cheerio.load(html);

  // 1. Character Name & ID
  let name = meta.name || '';
  const h1Text = $('h1').text().trim();
  const h1Match = h1Text.match(/How to Recruit (.+)/i);
  if (h1Match) {
    name = h1Match[1].trim();
  } else if (!name) {
    name = $('div.c-mainTitle h1, h1').first().text().trim();
  }
  const id = meta.id || rawSource.match(/_(\d+)\.html$/)?.[1] || '';
  const slug = meta.slug || slugify(name);

  // 2. Character Profile (Faction, Voice Actors, Birthday, Likes, Dislikes, Interests)
  let faction = null;
  let voice_actors = { en: null, jp: null };
  let birthday = null;
  let likes = [];
  let dislikes = [];
  let interests = [];

  const charInfoH = $('h2, h3').filter((_, el) => cleanText($(el).text()) === 'Character Info');
  if (charInfoH.length) {
    const table = findTableInSection($, charInfoH.first(), null, 'h2, h3');
    if (table) {
      table.find('tr').each((_, tr) => {
        const ths = $(tr).find('th').map((_, el) => cleanText($(el).text())).get();
        const nextTr = $(tr).next('tr');
        const tds = nextTr.find('td').map((_, el) => cleanText($(el).text())).get();

        ths.forEach((th, i) => {
          const val = tds[i] || '';
          const thLower = th.toLowerCase();
          if (thLower.includes('faction') || thLower.includes('affiliation')) {
            faction = val;
          } else if (thLower.includes('voice')) {
            const enMatch = val.match(/EN\s*VO:\s*(.*?)(?:JP\s*VO:|$)/i);
            const jpMatch = val.match(/JP\s*VO:\s*(.*)/i);
            voice_actors.en = enMatch ? cleanText(enMatch[1]) : null;
            voice_actors.jp = jpMatch ? cleanText(jpMatch[1]) : null;
          } else if (thLower === 'likes') {
            likes = val.split(/,\s*/).map(cleanText).filter(s => s && s.toLowerCase() !== 'none');
          } else if (thLower === 'dislikes') {
            dislikes = val.split(/,\s*/).map(cleanText).filter(s => s && s.toLowerCase() !== 'none');
          } else if (thLower === 'interests') {
            interests = val.split(/,\s*/).map(cleanText).filter(s => s && s.toLowerCase() !== 'none');
          } else if (thLower.includes('birthday')) {
            birthday = val;
          }
        });
      });
    }
  }

  // Look for Birthday in any table if not found yet
  if (!birthday) {
    $('th').each((_, el) => {
      const txt = cleanText($(el).text());
      if (txt.toLowerCase().includes('birthday')) {
        const td = $(el).next('td');
        if (td.length) {
          birthday = cleanText(td.text());
        }
      }
    });
  }

  // Crest / Bloodmarks
  const bloodmarks = [];
  const bloodmarkH = $('h2, h3').filter((_, el) => {
    const t = cleanText($(el).text()).toLowerCase();
    return t === 'bloodmarks' || t === 'bloodmark' || t === 'crests' || t === 'crest';
  });
  if (bloodmarkH.length) {
    const table = findTableInSection($, bloodmarkH.first(), null, 'h2, h3');
    if (table) {
      table.find('tr').slice(1).each((_, tr) => {
        const bName = cleanText($(tr).find('td').first().text());
        if (bName && !bloodmarks.includes(bName)) {
          bloodmarks.push(bName);
        }
      });
    }
  }

  // Unique Exploration Talent
  let unique_exploration_talent = null;
  const uetH = $('h2').filter((_, el) => cleanText($(el).text()).includes('Unique Exploration Talent'));
  if (uetH.length) {
    let talentName = '';
    const details = [];
    let currentSection = null;

    uetH.nextUntil('h2').each((_, el) => {
      if ($(el).is('h3, h4')) {
        const title = cleanText($(el).text());
        if (!talentName) talentName = title;
        currentSection = { title, description: '' };
        details.push(currentSection);
      } else if ($(el).is('p') && currentSection) {
        const pText = cleanText($(el).text());
        if (pText && !pText.includes('Walkthrough') && !pText.includes('Guide')) {
          currentSection.description = currentSection.description ? `${currentSection.description} ${pText}` : pText;
        }
      }
    });

    if (details.length > 0) {
      unique_exploration_talent = {
        name: talentName,
        details
      };
    }
  }

  // Recruitment
  let recruitment = {
    method: null,
    chapter_path: null,
    details: []
  };
  const recruitH = $('h2').filter((_, el) => cleanText($(el).text()).includes('How to Recruit'));
  if (recruitH.length) {
    recruitH.nextUntil('h2').each((_, el) => {
      if ($(el).is('h3, h4')) {
        const title = cleanText($(el).text());
        if (!recruitment.method) recruitment.method = title;
      } else if ($(el).is('table')) {
        $(el).find('tr').each((_, tr) => {
          const cells = $(tr).find('th, td').map((_, c) => cleanText($(c).text())).get();
          if (cells.length >= 2) {
            recruitment.chapter_path = cells[0];
            recruitment.details.push(cells.join(': '));
          }
        });
      } else if ($(el).is('p')) {
        const text = cleanText($(el).text());
        if (text && !text.includes('Walkthrough Guide') && !text.includes('List of All')) {
          recruitment.details.push(text);
          if (!recruitment.chapter_path) {
            const chMatch = text.match(/(Prologue|Part \d+(?: Chapter \d+)?|Chapter \d+|Future Timeline)/i);
            if (chMatch) recruitment.chapter_path = chMatch[1];
          }
        }
      }
    });
  }

  // 3. Best Classes & Tier List
  let overall_tier = null;
  let strengths = [];
  const tierH = $('h2, h3').filter((_, el) => cleanText($(el).text()) === 'Tier List Ranking');
  if (tierH.length) {
    const tierTable = findTableInSection($, tierH.first(), null, 'h2, h3');
    if (tierTable) {
      tierTable.find('tr').each((_, tr) => {
        const th = cleanText($(tr).find('th').text());
        const td = $(tr).find('td');
        if (th.includes('Overall Tier')) {
          const imgAlt = td.find('img').attr('alt');
          overall_tier = cleanText(td.text()) || (imgAlt ? cleanText(imgAlt) : null);
        } else if (th.includes('Strengths')) {
          const nextTr = $(tr).next('tr');
          const txt = cleanText(nextTr.text()) || cleanText(td.text());
          if (txt) {
            strengths = txt.split(/[・•\n]+/).map(cleanText).filter(Boolean);
          }
        }
      });
    }
  }

  const best_classes = {
    beginner: null,
    specialty: null,
    advanced: null,
    master: null,
    divine: null,
    recommended: []
  };

  const bestClassesH = $('h2, h3').filter((_, el) => cleanText($(el).text()) === 'Best Classes');
  if (bestClassesH.length) {
    const classTable = findTableInSection($, bestClassesH.first(), null, 'h2, h3');
    if (classTable) {
      classTable.find('tr').each((_, tr) => {
        const th = cleanText($(tr).find('th').text()).toLowerCase();
        const nextTr = $(tr).next('tr');
        if (th.includes('beginner')) {
          best_classes.beginner = parseClassRow($, nextTr);
        } else if (th.includes('specialty')) {
          best_classes.specialty = parseClassRow($, nextTr);
        } else if (th.includes('advanced')) {
          best_classes.advanced = parseClassRow($, nextTr);
        } else if (th.includes('master')) {
          best_classes.master = parseClassRow($, nextTr);
        } else if (th.includes('divine')) {
          best_classes.divine = parseClassRow($, nextTr);
        } else if (th.includes('recommended')) {
          const recText = cleanText(nextTr.text());
          best_classes.recommended = recText.split(/▼|->|,/).map(cleanText).filter(Boolean);
        }
      });
    }
  }

  // 4. Growth Rates & Skills
  const growths = {
    hp: null, str: null, mag: null, dex: null, spd: null, lck: null, def: null, res: null, cha: null
  };
  const growthH = $('h2, h3').filter((_, el) => cleanText($(el).text()) === 'Growth Rates');
  if (growthH.length) {
    const gTable = findTableInSection($, growthH.first(), null, 'h2, h3');
    if (gTable) {
      gTable.find('tr').slice(1).each((_, tr) => {
        const stat = cleanText($(tr).find('th, td').first().text()).toLowerCase();
        const val = parseNumber($(tr).find('td').last().text());
        if (stat in growths) {
          growths[stat] = val;
        }
      });
    }
  }

  let preferred_skills = [];
  let non_ideal_skills = [];
  const skillH = $('h2, h3').filter((_, el) => cleanText($(el).text()) === 'Skill Preferences');
  if (skillH.length) {
    const sTable = findTableInSection($, skillH.first(), null, 'h2, h3');
    if (sTable) {
      sTable.find('tr').each((_, tr) => {
        const th = cleanText($(tr).find('th').text()).toLowerCase();
        const td = $(tr).find('td');
        const items = td.find('div.align').map((_, d) => cleanText($(d).text())).get().filter(Boolean);
        const list = items.length > 0 ? items : cleanText(td.text()).split(/,\s*/).map(cleanText).filter(Boolean);

        if (th.includes('preferred')) {
          preferred_skills = list;
        } else if (th.includes('non-ideal')) {
          non_ideal_skills = list;
        }
      });
    }
  }

  // 5. Gifts
  let really_liked_gifts = [];
  let liked_gifts = [];
  let disliked_gifts = [];
  const giftH = $('h2, h3').filter((_, el) => cleanText($(el).text()).includes('Preferred Gifts') || cleanText($(el).text()).includes('Best Gifts'));
  if (giftH.length) {
    const giftTable = findTableInSection($, giftH.first(), null, 'h2');
    if (giftTable) {
      giftTable.find('tr').each((_, tr) => {
        const th = cleanText($(tr).find('th').text()).toLowerCase();
        const td = $(tr).find('td');
        const giftNames = td.find('a').map((_, a) => cleanText($(a).text())).get().filter(Boolean);
        const list = giftNames.length > 0 ? giftNames : cleanText(td.text()).split(/,\s*/).map(cleanText).filter(Boolean);

        if (th.includes('really liked') || th.includes('loved')) {
          for (const g of list) {
            if (!really_liked_gifts.includes(g)) really_liked_gifts.push(g);
          }
        } else if (th.includes('disliked')) {
          for (const g of list) {
            if (!disliked_gifts.includes(g)) disliked_gifts.push(g);
          }
        } else if (th.includes('liked')) {
          for (const g of list) {
            if (!liked_gifts.includes(g)) liked_gifts.push(g);
          }
        }
      });
    }
  }

  // 6. Bird Time Answers
  const bird_time = [];
  const birdH = $('h2, h3').filter((_, el) => cleanText($(el).text()).includes('Bird Time Answers'));
  if (birdH.length) {
    const birdTable = findTableInSection($, birdH.first(), (t) => {
      const ths = t.find('th').map((_, th) => cleanText($(th).text()).toLowerCase()).get();
      return ths.some(h => h.includes('remark') || h.includes('topic') || h.includes('answer'));
    }, 'h2');

    if (birdTable) {
      birdTable.find('tr').slice(1).each((_, tr) => {
        const tds = $(tr).find('td');
        if (tds.length >= 2) {
          const topic = cleanText(tds.eq(0).text());
          const best_answer = cleanText(tds.eq(1).text());
          if (topic && best_answer) {
            bird_time.push({ topic, best_answer });
          }
        }
      });
    }
  }

  // 7. Abilities and Combat Arts
  let personal_ability = null;
  const paH = $('h3, h4').filter((_, el) => cleanText($(el).text()) === 'Personal Ability');
  if (paH.length) {
    const paTable = findTableInSection($, paH.first(), null, 'h2, h3');
    if (paTable) {
      const tr = paTable.find('tr').first();
      const abName = cleanText(tr.find('th, td').first().text());
      const abEffect = cleanText(tr.find('td').last().text());
      if (abName) personal_ability = { name: abName, effect: abEffect };
    }
  }

  const level_up_abilities = [];
  const lvlAbH = $('h3, h4').filter((_, el) => cleanText($(el).text()).includes('Learned By Leveling'));
  if (lvlAbH.length) {
    const table = findTableInSection($, lvlAbH.first(), null, 'h2, h3');
    if (table) {
      table.find('tr').slice(1).each((_, tr) => {
        const tds = $(tr).find('td');
        if (tds.length >= 3) {
          const rawLv = cleanText(tds.eq(2).text());
          level_up_abilities.push({
            name: cleanText(tds.eq(0).text()),
            effect: cleanText(tds.eq(1).text()),
            level: parseNumber(rawLv) !== null ? parseNumber(rawLv) : rawLv
          });
        }
      });
    }
  }

  const skill_level_abilities = [];
  const skAbH = $('h3, h4').filter((_, el) => {
    const t = cleanText($(el).text());
    return t.includes('Learned By Skill') || t.includes('Learned by Skill') || t.includes('All Learned Skill Abilities');
  });
  if (skAbH.length) {
    const table = findTableInSection($, skAbH.first(), null, 'h2, h3');
    if (table) {
      table.find('tr').slice(1).each((_, tr) => {
        const tds = $(tr).find('td');
        if (tds.length >= 2) {
          skill_level_abilities.push({
            name: cleanText(tds.eq(0).text()),
            effect: cleanText(tds.eq(1).text())
          });
        }
      });
    }
  }

  const blaze_arts = [];
  const baH = $('h3, h4').filter((_, el) => cleanText($(el).text()) === 'Blaze Arts');
  if (baH.length) {
    const baTable = findTableInSection($, baH.first(), null, 'h2, h3');
    if (baTable) {
      baTable.find('tr').slice(1).each((_, tr) => {
        const artName = cleanText($(tr).find('td').first().text());
        const effectText = cleanText($(tr).find('td').last().text());
        if (artName) {
          const rangeMatch = effectText.match(/Range:\s*([0-9-]+)/i);
          const blazeMatch = effectText.match(/Blaze:\s*(\d+)/i);
          const learnedMatch = effectText.match(/Learned at:\s*(.*)/i);
          blaze_arts.push({
            name: artName,
            effect: effectText,
            range: rangeMatch ? rangeMatch[1] : null,
            blaze_cost: blazeMatch ? parseNumber(blazeMatch[1]) : null,
            learned_at: learnedMatch ? cleanText(learnedMatch[1]) : null
          });
        }
      });
    }
  }

  const magic_spells = [];
  const msH = $('h3, h4').filter((_, el) => cleanText($(el).text()) === 'Magic Spell List');
  if (msH.length) {
    const msTable = findTableInSection($, msH.first(), null, 'h2, h3');
    if (msTable) {
      msTable.find('tr').slice(1).each((_, tr) => {
        const level = cleanText($(tr).find('th, td').first().text());
        const black = cleanText($(tr).find('td').eq(0).text()).split('・').map(cleanText).filter(Boolean);
        const white = cleanText($(tr).find('td').eq(1).text()).split('・').map(cleanText).filter(Boolean);
        if (level) {
          magic_spells.push({
            skill_level: level,
            black_magic: black,
            white_magic: white
          });
        }
      });
    }
  }

  const combat_arts = [];
  const caH = $('h3, h4').filter((_, el) => cleanText($(el).text()) === 'Combat Arts');
  if (caH.length) {
    const caTable = findTableInSection($, caH.first(), null, 'h2, h3');
    if (caTable) {
      const rows = caTable.find('tr');
      for (let i = 1; i < rows.length; i++) {
        const tr = rows.eq(i);
        const tds = tr.find('td');
        if (tds.length >= 5) {
          const artName = cleanText(tds.eq(0).text());
          const might = parseNumber(tds.eq(1).text());
          const hit = parseNumber(tds.eq(2).text());
          const crit = parseNumber(tds.eq(3).text());
          const range = cleanText(tds.eq(4).text());
          const cost = parseNumber(tds.eq(5).text());

          let effect = '';
          const nextTr = rows.eq(i + 1);
          if (nextTr.length && nextTr.find('td').length === 1) {
            effect = cleanText(nextTr.text()).replace(/^Effect:\s*/i, '');
            i++;
          }

          combat_arts.push({
            name: artName,
            might,
            hit,
            crit,
            range,
            cost,
            effect
          });
        }
      }
    }
  }

  // Assemble Models
  return {
    character: {
      id,
      name,
      slug,
      url: meta.url || `https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/${id}`,
      faction,
      crest_bloodmark: bloodmarks,
      voice_actors,
      birthday,
      likes,
      dislikes,
      interests,
      unique_exploration_talent,
      recruitment,
      abilities_and_combat_arts: {
        personal_ability,
        level_up_abilities,
        skill_level_abilities,
        blaze_arts,
        magic_spells,
        combat_arts
      },
      raw_source: rawSource
    },
    growths: {
      character_id: id,
      name,
      growths,
      preferred_skills,
      non_ideal_skills,
      raw_source: rawSource
    },
    best_classes: {
      character_id: id,
      name,
      overall_tier,
      strengths,
      best_classes,
      raw_source: rawSource
    },
    gifts: {
      character_id: id,
      name,
      birthday,
      really_liked: really_liked_gifts,
      liked: liked_gifts,
      disliked: disliked_gifts,
      raw_source: rawSource
    },
    bird_time: {
      character_id: id,
      name,
      bird_time_answers: bird_time,
      raw_source: rawSource
    }
  };
}

/**
 * Main Scraper Execution
 */
export async function scrapeAllCharacters() {
  console.log(`[Character Scraper] Reading catalog from ${CATALOG_PATH}...`);
  const catalogContent = await fs.readFile(CATALOG_PATH, 'utf-8');
  const catalog = JSON.parse(catalogContent);

  const characterList = catalog.characters || [];
  console.log(`[Character Scraper] Found ${characterList.length} characters in catalog.`);
  const { recruitmentMap } = await scrapeRecruitmentRules();

  const allCharacters = [];
  const allGrowths = [];
  const allBestClasses = [];
  const allGifts = [];
  const allBirdTime = [];

  let count = 0;
  for (const c of characterList) {
    count++;
    const slug = slugify(c.name);
    const localPath = `raw_extracts/characters/${slug}_${c.id}.html`;

    console.log(`[${count}/${characterList.length}] Processing ${c.name} (${c.id})...`);
    
    // Fetch or read from cache (delay 250ms on fetch to be polite)
    const { html, raw_source } = await fetchOrCache(c.url, localPath, 250);

    const parsed = parseCharacter(html, raw_source, {
      id: c.id,
      name: c.name,
      slug,
      url: c.url
    });

    const mappedRecruit = recruitmentMap.get(c.name.toLowerCase());
    if (mappedRecruit) {
      parsed.character.recruitment = mappedRecruit;
    }

    allCharacters.push(parsed.character);
    allGrowths.push(parsed.growths);
    allBestClasses.push(parsed.best_classes);
    allGifts.push(parsed.gifts);
    allBirdTime.push(parsed.bird_time);
  }

  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Write outputs
  console.log('[Character Scraper] Writing JSON output files...');

  const filesToWrite = [
    { filename: 'characters.json', data: allCharacters },
    { filename: 'character_growths.json', data: allGrowths },
    { filename: 'character_best_classes.json', data: allBestClasses },
    { filename: 'character_gifts.json', data: allGifts },
    { filename: 'character_bird_time.json', data: allBirdTime }
  ];

  for (const item of filesToWrite) {
    const fullPath = path.join(OUTPUT_DIR, item.filename);
    await fs.writeFile(fullPath, JSON.stringify(item.data, null, 2), 'utf-8');
    console.log(`[Character Scraper] Generated ${fullPath} (${item.data.length} records)`);
  }

  console.log('\n[Character Scraper] Scraping and extraction complete!');
  return {
    total: characterList.length,
    characters: allCharacters.length,
    growths: allGrowths.length,
    best_classes: allBestClasses.length,
    gifts: allGifts.length,
    bird_time: allBirdTime.length
  };
}

// Execute directly if run as main script
if (process.argv[1] && process.argv[1].endsWith('character_scrapper.js')) {
  scrapeAllCharacters().catch((err) => {
    console.error('[Character Scraper] Error during scraping:', err);
    process.exit(1);
  });
}
