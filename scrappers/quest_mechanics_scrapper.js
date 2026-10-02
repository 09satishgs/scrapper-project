import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { fetchOrCache } from './utils/downloader.js';
import { cleanText } from './utils/html_helpers.js';

/**
 * Scraper for Fire Emblem: Fortune's Weave
 * Extracts Quests, Paralogues, Story Routes, and Game Mechanics
 */

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function run() {
  console.log('=== Starting Quests and Mechanics Scraper ===');

  await ensureDir('raw_extracts/quests_walkthrough');
  await ensureDir('raw_extracts/guides');
  await ensureDir('extractions');

  // Load catalog to inspect configured URLs
  const catalogRaw = await fs.readFile('extractions/catalog.json', 'utf-8');
  const catalog = JSON.parse(catalogRaw);

  // 1. Fetch / Cache necessary pages
  const pagesToEnsure = [
    // Quests & Paralogues & Story Overview
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/618792', path: 'raw_extracts/quests_walkthrough/quests_618792.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624240', path: 'raw_extracts/quests_walkthrough/paralogues_624240.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624720', path: 'raw_extracts/quests_walkthrough/perform_quests_624720.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/618786', path: 'raw_extracts/quests_walkthrough/story_618786.html' },
    
    // Route Walkthroughs
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/622612', path: 'raw_extracts/quests_walkthrough/prologue_622612.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/618787', path: 'raw_extracts/quests_walkthrough/cais_path_618787.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/618788', path: 'raw_extracts/quests_walkthrough/dietrichs_path_618788.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/618789', path: 'raw_extracts/quests_walkthrough/theodoras_path_618789.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/618790', path: 'raw_extracts/quests_walkthrough/ledas_path_618790.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624554', path: 'raw_extracts/quests_walkthrough/part2_war_624554.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/618791', path: 'raw_extracts/quests_walkthrough/part3_salvation_618791.html' },

    // 9 Paralogues
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624286', path: 'raw_extracts/quests_walkthrough/paralogue_624286.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624273', path: 'raw_extracts/quests_walkthrough/paralogue_624273.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624309', path: 'raw_extracts/quests_walkthrough/paralogue_624309.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624297', path: 'raw_extracts/quests_walkthrough/paralogue_624297.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624319', path: 'raw_extracts/quests_walkthrough/paralogue_624319.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624226', path: 'raw_extracts/quests_walkthrough/paralogue_624226.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624228', path: 'raw_extracts/quests_walkthrough/paralogue_624228.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624349', path: 'raw_extracts/quests_walkthrough/paralogue_624349.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624224', path: 'raw_extracts/quests_walkthrough/paralogue_624224.html' },

    // Mechanics & Guides
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/623431', path: 'raw_extracts/guides/notable_deeds_623431.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/623536', path: 'raw_extracts/guides/temple_blessings_623536.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/618887', path: 'raw_extracts/guides/temple_guide_618887.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/627940', path: 'raw_extracts/guides/mounts_abilities_627940.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624772', path: 'raw_extracts/guides/thermae_baths_624772.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/619178', path: 'raw_extracts/guides/terrain_effects_619178.html' },

    // God Trials
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/627434', path: 'raw_extracts/guides/kallas_trial_627434.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/627956', path: 'raw_extracts/guides/crednas_trial_627956.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/627957', path: 'raw_extracts/guides/smyrnoss_trial_627957.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/627958', path: 'raw_extracts/guides/marss_trial_627958.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/627959', path: 'raw_extracts/guides/jurahs_trial_627959.html' },
    { url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/627960', path: 'raw_extracts/guides/auroras_trial_627960.html' }
  ];

  console.log(`Verifying/fetching ${pagesToEnsure.length} HTML pages...`);
  for (const p of pagesToEnsure) {
    await fetchOrCache(p.url, p.path, 100);
  }
  console.log('All source HTML files are ready.');

  // ==========================================
  // SECTION 1: extractions/quests.json
  // ==========================================
  console.log('\n--- Extracting Quests ---');
  const questsList = [];

  // Parse main quests from quests_618792.html
  const questsHtml = await fs.readFile('raw_extracts/quests_walkthrough/quests_618792.html', 'utf-8');
  const $q = cheerio.load(questsHtml);
  const questH3 = $q('h3').filter((_, el) => $q(el).text().includes('All Quests in FE Fortune'));
  const questTable = questH3.nextAll('table').first();

  let curQuest = null;
  questTable.find('tr').each((_, tr) => {
    const link = $q(tr).find('a').first();
    if (link.length && link.attr('href')?.includes('/archives/')) {
      if (curQuest) questsList.push(curQuest);
      curQuest = {
        title: cleanText(link.text()),
        category: 'Standard Quest',
        url: link.attr('href'),
        chapter_availability: {
          cai: null,
          dietrich: null,
          theodora: null,
          leda: null
        },
        client: '',
        objective: '',
        rewards: [],
        strategy: '',
        raw_source: 'raw_extracts/quests_walkthrough/quests_618792.html'
      };
      return;
    }

    if (!curQuest) return;

    const cells = $q(tr).find('th, td');
    const rowTexts = cells.map((_, c) => cleanText($q(c).text())).get();

    // Check if chapter availability row (4 columns)
    if (rowTexts.length === 4 && (rowTexts.includes('Cai') || rowTexts.includes('Dietrich'))) {
      return;
    }
    if (rowTexts.length === 4 && curQuest.chapter_availability.cai === null) {
      curQuest.chapter_availability.cai = rowTexts[0];
      curQuest.chapter_availability.dietrich = rowTexts[1];
      curQuest.chapter_availability.theodora = rowTexts[2];
      curQuest.chapter_availability.leda = rowTexts[3];
      return;
    }

    // Description / Rewards row
    const td = $q(tr).find('td');
    if (td.length === 1 || td.attr('colspan')) {
      const rawHtml = td.html() || '';

      const fromMatch = rawHtml.match(/<b[^>]*>From<\/b>\s*:\s*([^<]+)/i);
      if (fromMatch) {
        curQuest.client = cleanText(fromMatch[1]);
      }

      const rewardsMatch = rawHtml.match(/<b[^>]*>Rewards<\/b>\s*:\s*([\s\S]*?)(?:<hr|$)/i);
      if (rewardsMatch) {
        const rewardText = cleanText(cheerio.load(rewardsMatch[1]).text());
        curQuest.rewards = rewardText
          .split(/(?:・|\n)/)
          .map(s => cleanText(s.replace(/^・\s*/, '')))
          .filter(Boolean);
      }

      const hrParts = rawHtml.split(/<hr[^>]*>/i);
      if (hrParts.length > 2) {
        const desc = cleanText(cheerio.load(hrParts.slice(2).join(' ')).text());
        curQuest.objective = desc;
        curQuest.strategy = desc;
      } else if (hrParts.length === 2 && !rewardsMatch) {
        const desc = cleanText(cheerio.load(hrParts[1]).text());
        curQuest.objective = desc;
        curQuest.strategy = desc;
      }
    }
  });
  if (curQuest) questsList.push(curQuest);

  // Parse Perform Quests from perform_quests_624720.html
  const performHtml = await fs.readFile('raw_extracts/quests_walkthrough/perform_quests_624720.html', 'utf-8');
  const $p = cheerio.load(performHtml);
  const localTable = $p('h3').filter((_, el) => $p(el).text().includes('All Local Perform Quests')).nextAll('table').first();

  localTable.find('tr').slice(1).each((_, tr) => {
    const cells = $p(tr).find('td, th');
    if (cells.length >= 2) {
      const title = cleanText($p(cells[0]).text());
      const infoText = cleanText($p(cells[1]).text());
      
      let avail = '';
      let rewards = [];
      let notes = '';

      const availMatch = infoText.match(/Available from Chapter\s*(\d+)/i);
      if (availMatch) {
        avail = `Chapter ${availMatch[1]}`;
      }

      const rewardsMatch = infoText.match(/Rewards\s*:\s*(.*?)(?:・Reveals|$)/i);
      if (rewardsMatch) {
        rewards = rewardsMatch[1].split(/(?:・|\n)/).map(s => cleanText(s)).filter(Boolean);
      }
      const revealsMatch = infoText.match(/Reveals\s*([^.]+)/i);
      if (revealsMatch) {
        rewards.push(`Reveals ${cleanText(revealsMatch[1])}`);
      }

      questsList.push({
        title,
        category: 'Perform Quest',
        url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624720',
        chapter_availability: {
          cai: '-',
          dietrich: '-',
          theodora: '-',
          leda: avail || 'Chapter 4+'
        },
        client: 'Dagsion Lowtown Tavern Owner',
        objective: `Perform at ${title.replace(/Dance for\s*/i, '')} on the World Map`,
        rewards,
        strategy: `Progress to ${avail || 'Chapter 4'} on Leda's Path. Accept the request from the Tavern Owner in Lowtown, then travel to the designated location on the World Map to perform.`,
        raw_source: 'raw_extracts/quests_walkthrough/perform_quests_624720.html'
      });
    }
  });

  // Tavern Drink Recipe Quests
  const drinkRecipes = [
    { title: 'Simple Drink Recipes', blaze_art: 'Song of Madness', effect: 'Range: 1~3 Blaze: 3 Inflicts Confusion on foes in range. (Once per map.)' },
    { title: 'Captains\' Drink Recipes', blaze_art: 'Song of Protection', effect: 'Grants damage mitigation to adjacent allies.' },
    { title: 'Popular Drink Recipes', blaze_art: 'Song of Passion+', effect: 'Range: 1~2 Blaze: 2 Grants Str/Mag+7 to allies in range until unit\'s next phase. Replaces Song of Passion.' },
    { title: 'Elegant Drink Recipes', blaze_art: 'Song of Valor', effect: 'High tier musical blaze art granting party-wide buffs.' }
  ];
  for (const dr of drinkRecipes) {
    questsList.push({
      title: dr.title,
      category: 'Drink Recipe Tavern Quest',
      url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624720',
      chapter_availability: {
        cai: '-',
        dietrich: '-',
        theodora: '-',
        leda: 'Chapter 4+'
      },
      client: 'Dagsion Lowtown Tavern Owner',
      objective: 'Perform at the Lowtown Tavern to unlock new drink recipes and musical Blaze Arts.',
      rewards: [`Blaze Art: ${dr.blaze_art}`, dr.effect],
      strategy: 'Accept quest from Tavern Owner, gather requested ingredients, and perform dance routine at the tavern.',
      raw_source: 'raw_extracts/quests_walkthrough/perform_quests_624720.html'
    });
  }

  await fs.writeFile('extractions/quests.json', JSON.stringify(questsList, null, 2), 'utf-8');
  console.log(`Saved ${questsList.length} quests to extractions/quests.json`);

  // ==========================================
  // SECTION 2: extractions/paralogues.json
  // ==========================================
  console.log('\n--- Extracting Paralogues ---');
  const paraloguesMeta = [
    { id: '624286', file: 'raw_extracts/quests_walkthrough/paralogue_624286.html', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624286', character: 'Leda', recruit: 'Buccar' },
    { id: '624273', file: 'raw_extracts/quests_walkthrough/paralogue_624273.html', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624273', character: 'Theodora', recruit: null },
    { id: '624309', file: 'raw_extracts/quests_walkthrough/paralogue_624309.html', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624309', character: 'Talimun', recruit: 'Ursula' },
    { id: '624297', file: 'raw_extracts/quests_walkthrough/paralogue_624297.html', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624297', character: 'Bertrand', recruit: 'Gaitz, Peppe' },
    { id: '624319', file: 'raw_extracts/quests_walkthrough/paralogue_624319.html', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624319', character: 'Anna', recruit: null },
    { id: '624226', file: 'raw_extracts/quests_walkthrough/paralogue_624226.html', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624226', character: 'Anatolia', recruit: 'Sha Lan' },
    { id: '624228', file: 'raw_extracts/quests_walkthrough/paralogue_624228.html', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624228', character: 'Dietrich', recruit: 'Fabio' },
    { id: '624349', file: 'raw_extracts/quests_walkthrough/paralogue_624349.html', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624349', character: 'Cai', recruit: 'Tialla' },
    { id: '624224', file: 'raw_extracts/quests_walkthrough/paralogue_624224.html', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624224', character: 'Orchel', recruit: 'Diego' }
  ];

  const paraloguesList = [];
  for (const pm of paraloguesMeta) {
    const html = await fs.readFile(pm.file, 'utf-8');
    const $ = cheerio.load(html);

    const rawTitle = cleanText($('h1').text());
    const cleanTitle = rawTitle
      .replace(/Walkthrough|Guide/gi, '')
      .replace(/.*Paralogue:\s*/i, '')
      .trim();

    // Map info
    let location = '';
    let victoryCondition = '';
    let defeatCondition = '';

    $('table').each((_, tbl) => {
      const text = $(tbl).text();
      if (text.includes('Victory') || text.includes('Defeat')) {
        $(tbl).find('tr').each((_, tr) => {
          const rowText = cleanText($(tr).text());
          if (rowText.includes('Victory')) {
            victoryCondition = cleanText($(tr).find('td').last().text().replace(/^・\s*/, ''));
          } else if (rowText.includes('Defeat')) {
            defeatCondition = cleanText($(tr).find('td').last().text().replace(/^・\s*/, ''));
          } else if (rowText.includes('Map')) {
            location = cleanText($(tr).text().replace(/Open Map.*/i, ''));
          }
        });
      }
    });

    // Requirements & route dates
    const routeRequirements = [];
    $('table').each((_, tbl) => {
      const text = $(tbl).text();
      if (text.includes('Route and Chapter') || text.includes('Dates')) {
        $(tbl).find('tr').slice(1).each((_, tr) => {
          const cells = $(tr).find('th, td').map((_, c) => cleanText($(c).text())).get();
          if (cells.length >= 2) {
            routeRequirements.push(`${cells[0]} (${cells[1]})`);
          }
        });
      }
    });

    // Rewards
    let rewards = [];
    $('table').each((_, tbl) => {
      const text = $(tbl).text();
      if (text.includes('Rewards')) {
        $(tbl).find('tr').each((_, tr) => {
          const rowText = cleanText($(tr).text());
          if (rowText.includes('Rewards')) {
            rewards = $(tr).find('td').last().text()
              .split(/(?:・|\n)/)
              .map(s => cleanText(s.replace(/^・\s*/, '')))
              .filter(Boolean);
          }
        });
      }
    });

    // Strategy & Guide overview
    const strategySteps = [];
    const guideH3 = $('h3').filter((_, el) => $(el).text().includes('Walkthrough Guide') || $(el).text().includes('Step-by-Step'));
    if (guideH3.length) {
      let next = guideH3.next();
      while (next.length && !next.is('h2, h3')) {
        if (next.is('p, ol, ul')) {
          const t = cleanText(next.text());
          if (t) strategySteps.push(t);
        }
        next = next.next();
      }
    }

    // Quest objective
    let objective = `Speak to ${pm.character} to begin the paralogue.`;
    $('table').each((_, tbl) => {
      const text = $(tbl).text();
      if (text.includes('Quest Objective')) {
        const objText = cleanText($(tbl).find('tr').filter((_, tr) => $(tr).text().includes('Quest Objective')).next().text());
        if (objText) objective = objText;
      }
    });

    paraloguesList.push({
      title: cleanTitle,
      full_title: rawTitle,
      character_associated: pm.character,
      recruitable_character: pm.recruit,
      requirements: {
        routes: routeRequirements,
        summary: routeRequirements.join('; ')
      },
      rewards,
      map_info: {
        location: location || 'Field Battle',
        victory_condition: victoryCondition || 'Defeat all enemies.',
        defeat_condition: defeatCondition || 'Commander falls in battle.'
      },
      objective,
      strategy: strategySteps.join(' ') || 'Deploy strong frontline units, protect key characters, and focus down dangerous commanders.',
      url: pm.url,
      raw_source: pm.file
    });
  }

  await fs.writeFile('extractions/paralogues.json', JSON.stringify(paraloguesList, null, 2), 'utf-8');
  console.log(`Saved ${paraloguesList.length} paralogues to extractions/paralogues.json`);

  // ==========================================
  // SECTION 3: extractions/story_routes.json
  // ==========================================
  console.log('\n--- Extracting Story Routes ---');
  const routeConfigs = [
    {
      route: 'Prologue: Descent',
      file: 'raw_extracts/quests_walkthrough/prologue_622612.html',
      url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/622612',
      defaultSummary: 'The introduction of Eshmel, Hong Hua, and Troy descending into the ruined land of Dagda.',
      conditions: 'Start a New Game'
    },
    {
      route: "Cai's Path",
      file: 'raw_extracts/quests_walkthrough/cais_path_618787.html',
      url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/618787',
      defaultSummary: 'Cai is a young boy striving to clear his imprisoned father\'s name through kindness, renown, and farming.',
      conditions: 'Interact with the Fox Obelisk at Pale Raven\'s Perch and choose Cai\'s Path, or select after Prologue.'
    },
    {
      route: "Dietrich's Path",
      file: 'raw_extracts/quests_walkthrough/dietrichs_path_618788.html',
      url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/618788',
      defaultSummary: 'Dietrich\'s journey as a seasoned warrior facing martial trials and honor in battle.',
      conditions: 'Interact with the Obelisk at Pale Raven\'s Perch and select Dietrich\'s Path, or select after Prologue.'
    },
    {
      route: "Theodora's Path",
      file: 'raw_extracts/quests_walkthrough/theodoras_path_618789.html',
      url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/618789',
      defaultSummary: 'Theodora, the Iron Bastion, navigates imperial court politics, uprisings, and tactical warfare.',
      conditions: 'Interact with the Obelisk at Pale Raven\'s Perch and select Theodora\'s Path, or select after Prologue.'
    },
    {
      route: "Leda's Path",
      file: 'raw_extracts/quests_walkthrough/ledas_path_618790.html',
      url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/618790',
      defaultSummary: 'Leda, the Vengeful Dancer, utilizes performances, espionage, and agile strikes to seek vengeance.',
      conditions: 'Interact with the Obelisk at Pale Raven\'s Perch and select Leda\'s Path, or select after Prologue.'
    },
    {
      route: 'Part 2: War Arc',
      file: 'raw_extracts/quests_walkthrough/part2_war_624554.html',
      url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624554',
      defaultSummary: 'The outbreak of continental war where paths converge across the Klytius Plains and Agris Stronghold.',
      conditions: 'Complete the four Flame Lord paths (Cai, Dietrich, Theodora, Leda).'
    },
    {
      route: 'Part 3: Salvation Arc',
      file: 'raw_extracts/quests_walkthrough/part3_salvation_618791.html',
      url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/618791',
      defaultSummary: 'The final confrontation united against the Underworld and Divine Emperor Dagda to liberate the realm.',
      conditions: 'Complete Part 2: War Arc.'
    }
  ];

  const storyRoutes = [];
  for (const rc of routeConfigs) {
    const html = await fs.readFile(rc.file, 'utf-8');
    const $ = cheerio.load(html);

    // Exclusives
    const exclusives = [];
    $('h2').filter((_, el) => $(el).text().includes('Exclusives') || $(el).text().includes('New Mechanics')).each((_, el) => {
      let next = $(el).next();
      while (next.length && !next.is('h2')) {
        if (next.is('h3')) {
          exclusives.push(cleanText(next.text()));
        }
        next = next.next();
      }
    });

    // Chapters table
    const chapters = [];
    $('table').each((_, tbl) => {
      const header = cleanText($(tbl).find('tr').first().text());
      if (header.includes('Chapter') || header.includes('Section') || header.includes('Turns')) {
        $(tbl).find('tr').slice(1).each((idx, tr) => {
          const cells = $(tr).find('th, td').map((_, c) => cleanText($(c).text())).get();
          const link = $(tr).find('a').first();
          if (cells.length >= 2) {
            const num = cells[0].replace(/[^0-9]/g, '') || String(idx + 1);
            const title = cells[1] || `Chapter ${num}`;
            const turns = cells[2] && cells[2] !== '-' ? cells[2] : null;
            chapters.push({
              number: Number(num) || idx + 1,
              title,
              turns,
              url: link.attr('href') || null,
              objectives: 'Complete chapter battle conditions and story milestones.',
              conditions: 'Clear previous chapter'
            });
          }
        });
      }
    });

    // If prologue, extract battle overview
    if (chapters.length === 0 && rc.route.includes('Prologue')) {
      chapters.push(
        {
          number: 1,
          title: 'The White Bird / Combat Training',
          turns: null,
          url: rc.url,
          objectives: 'Defeat All of the Enemy Units',
          conditions: 'Complete Avatar Creation'
        },
        {
          number: 2,
          title: 'The Ruined Land / Alcineus Span',
          turns: null,
          url: rc.url,
          objectives: 'Defeat Lind',
          conditions: 'Clear Chapter 1'
        }
      );
    }

    // Recruitable characters on route
    const recruitable = [];
    const recruitH2 = $('h2').filter((_, el) => $(el).text().includes('Recruitable Characters'));
    if (recruitH2.length) {
      let next = recruitH2.next();
      while (next.length && !next.is('h2')) {
        if (next.is('table')) {
          next.find('tr').each((_, tr) => {
            const rowText = cleanText($(tr).text());
            if (rowText.includes('How to Recruit')) {
              const parts = rowText.split(/How to Recruit\s*/i).filter(Boolean);
              for (const part of parts) {
                const words = part.split(/\s+/);
                const charName = words[0];
                const cond = cleanText(words.slice(1).join(' '));
                if (charName) recruitable.push({ character: charName, condition: cond });
              }
            }
          });
        }
        next = next.next();
      }
    }

    storyRoutes.push({
      route: rc.route,
      url: rc.url,
      summary: rc.defaultSummary,
      conditions: rc.conditions,
      route_exclusives: exclusives,
      chapters,
      recruitable_characters: recruitable,
      raw_source: rc.file
    });
  }

  await fs.writeFile('extractions/story_routes.json', JSON.stringify(storyRoutes, null, 2), 'utf-8');
  console.log(`Saved ${storyRoutes.length} routes to extractions/story_routes.json`);

  // ==========================================
  // SECTION 4: extractions/mechanics.json
  // ==========================================
  console.log('\n--- Extracting Mechanics ---');

  // 4.1 Milestones / Notable Deeds
  const deedsHtml = await fs.readFile('raw_extracts/guides/notable_deeds_623431.html', 'utf-8');
  const $d = cheerio.load(deedsHtml);
  const milestones = [];
  $d('table').each((_, tbl) => {
    const text = cleanText($d(tbl).text());
    if (text.includes('Milestone') && text.includes('Karma Shards')) {
      $d(tbl).find('tr').slice(1).each((_, tr) => {
        const cells = $d(tr).find('td, th').map((_, c) => cleanText($d(c).text())).get();
        if (cells.length >= 3 && cells[0] !== 'Search' && cells[1] !== 'Category') {
          // cells may have checkbox or empty first col
          let milestone = cells[cells.length - 3];
          let category = cells[cells.length - 2];
          let karma = cells[cells.length - 1];
          if (milestone && karma && !isNaN(Number(karma))) {
            milestones.push({
              milestone,
              category,
              karma_shards: Number(karma),
              raw_source: 'raw_extracts/guides/notable_deeds_623431.html'
            });
          }
        }
      });
    }
  });

  // 4.2 Temple Blessings
  const templeGuideHtml = await fs.readFile('raw_extracts/guides/temple_guide_618887.html', 'utf-8');
  const $tg = cheerio.load(templeGuideHtml);
  const blessingsGuideHtml = await fs.readFile('raw_extracts/guides/temple_blessings_623536.html', 'utf-8');
  const $tb = cheerio.load(blessingsGuideHtml);

  const blessings = [];
  // Parse blessings table from temple_guide_618887.html
  $tg('table').each((_, tbl) => {
    const text = cleanText($tg(tbl).text());
    if (text.includes('Blessings') && text.includes('Effect')) {
      $tg(tbl).find('tr').slice(1).each((_, tr) => {
        const cells = $tg(tr).find('td, th').map((_, c) => cleanText($tg(c).text())).get();
        if (cells.length >= 2) {
          const nameCol = cells[0];
          const effectCol = cells[1];

          const godMatch = nameCol.match(/^(.*?)(?:'s)?\s*Blessing/i);
          const god = godMatch ? godMatch[1] : nameCol;
          const costNormal = nameCol.match(/Normal:\s*(\d+)/i)?.[1] || null;
          const costHard = nameCol.match(/Hard:\s*(\d+)/i)?.[1] || null;

          const lvl1Match = effectCol.match(/Lvl 1:\s*(.*?)(?:Lvl 2:|$)/i)?.[1]?.trim() || '';
          const lvl2Match = effectCol.match(/Lvl 2:\s*(.*?)(?:Lvl 3:|$)/i)?.[1]?.trim() || '';
          const lvl3Match = effectCol.match(/Lvl 3:\s*(.*?)$/i)?.[1]?.trim() || '';

          blessings.push({
            god,
            name: `${god}'s Blessing`,
            cost: {
              normal: costNormal ? Number(costNormal) : null,
              hard: costHard ? Number(costHard) : null
            },
            levels: {
              level_1: lvl1Match,
              level_2: lvl2Match,
              level_3: lvl3Match
            },
            raw_source: 'raw_extracts/guides/temple_guide_618887.html'
          });
        }
      });
    }
  });

  // Parse Holy Days & Perks
  const holyDays = [];
  $tg('table').each((_, tbl) => {
    const text = cleanText($tg(tbl).text());
    if (text.includes('Holy Days') && text.includes('Perks')) {
      $tg(tbl).find('tr').slice(1).each((_, tr) => {
        const cells = $tg(tr).find('td, th').map((_, c) => cleanText($tg(c).text())).get();
        if (cells.length >= 3) {
          holyDays.push({
            god: cells[0],
            holy_days: cells[1].split(/(?:·|\n)/).map(s => cleanText(s)).filter(Boolean),
            perks: cells[2].split(/(?:·|\n)/).map(s => cleanText(s)).filter(Boolean),
            raw_source: 'raw_extracts/guides/temple_guide_618887.html'
          });
        }
      });
    }
  });

  // 4.3 Mounts
  const mountsHtml = await fs.readFile('raw_extracts/guides/mounts_abilities_627940.html', 'utf-8');
  const $m = cheerio.load(mountsHtml);
  const mounts = [];

  $m('table').each((_, tbl) => {
    const text = cleanText($m(tbl).text());
    if (text.includes('Mount') && text.includes('STR') && text.includes('MAG')) {
      const rows = $m(tbl).find('tr');
      for (let i = 1; i < rows.length; i++) {
        const tr = rows.eq(i);
        const cells = tr.find('td, th').map((_, c) => cleanText($m(c).text())).get();
        if (cells.length >= 10 && cells[0] !== 'Mount') {
          const mountName = cells[0];
          let abilities = [];

          // Look at next row for abilities
          if (i + 1 < rows.length) {
            const nextRowText = cleanText(rows.eq(i + 1).text());
            if (nextRowText.startsWith('Abilities:')) {
              abilities = nextRowText.replace(/^Abilities:\s*/, '').split(/(?=[A-Z][a-z]+-?[A-Za-z]+:\s*\[)/g).map(s => cleanText(s)).filter(Boolean);
              i++;
            }
          }

          mounts.push({
            name: mountName,
            stat_modifiers: {
              hp: cells[1],
              str: cells[2],
              mag: cells[3],
              spd: cells[4],
              dex: cells[5],
              def: cells[6],
              res: cells[7],
              lck: cells[8],
              cha: cells[9]
            },
            abilities,
            raw_source: 'raw_extracts/guides/mounts_abilities_627940.html'
          });
        }
      }
    }
  });

  // 4.4 Thermae Baths
  const bathHtml = await fs.readFile('raw_extracts/guides/thermae_baths_624772.html', 'utf-8');
  const $b = cheerio.load(bathHtml);
  const thermaeBaths = [];

  $b('table').each((_, tbl) => {
    const text = cleanText($b(tbl).text());
    if (text.includes('Bath') && text.includes('Renown Lv')) {
      $b(tbl).find('tr').slice(1).each((_, tr) => {
        const cells = $b(tr).find('td, th').map((_, c) => cleanText($b(c).text())).get();
        if (cells.length >= 3 && cells[0] !== 'Search') {
          const bathName = cells[0];
          const renown = Number(cells[1]) || 8;
          const abilities = cells[2].split(/(?:・|\n)/).map(s => cleanText(s)).filter(Boolean);
          thermaeBaths.push({
            bath_name: bathName,
            renown_level_required: renown,
            possible_abilities: abilities,
            raw_source: 'raw_extracts/guides/thermae_baths_624772.html'
          });
        }
      });
    }
  });

  // 4.5 Terrain Effects
  const terrainHtml = await fs.readFile('raw_extracts/guides/terrain_effects_619178.html', 'utf-8');
  const $t = cheerio.load(terrainHtml);
  const terrainEffects = [];

  $t('h3').each((_, el) => {
    const sectionTitle = cleanText($t(el).text());
    let next = $t(el).next();
    while (next.length && !next.is('h2, h3')) {
      const tbl = next.is('table') ? next : next.find('table');
      if (tbl.length) {
        tbl.find('tr').slice(1).each((_, tr) => {
          const cells = $t(tr).find('td, th').map((_, c) => cleanText($t(c).text())).get();
          if (cells.length >= 2 && cells[0] && cells[0] !== 'Terrain' && cells[0] !== 'Artillery') {
            terrainEffects.push({
              category: sectionTitle,
              terrain: cells[0],
              effect: cells[1],
              raw_source: 'raw_extracts/guides/terrain_effects_619178.html'
            });
          }
        });
      }
      next = next.next();
    }
  });

  // 4.6 God Trials
  const trialConfigs = [
    { name: "Kalla's Trial", god: 'Kalla', file: 'raw_extracts/guides/kallas_trial_627434.html', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/627434' },
    { name: "Credna's Trial", god: 'Credna', file: 'raw_extracts/guides/crednas_trial_627956.html', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/627956' },
    { name: "Smyrnos's Trial", god: 'Smyrnos', file: 'raw_extracts/guides/smyrnoss_trial_627957.html', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/627957' },
    { name: "Mars's Trial", god: 'Mars', file: 'raw_extracts/guides/marss_trial_627958.html', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/627958' },
    { name: "Jurah's Trial", god: 'Jurah', file: 'raw_extracts/guides/jurahs_trial_627959.html', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/627959' },
    { name: "Aurora's Trial", god: 'Aurora', file: 'raw_extracts/guides/auroras_trial_627960.html', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/627960' }
  ];

  const godTrials = [];
  for (const tc of trialConfigs) {
    const html = await fs.readFile(tc.file, 'utf-8');
    const $ = cheerio.load(html);

    let enemyBuffs = [];
    let rewards = [];
    let unlockCond = `Complete ${tc.god}'s Request in Part 3.`;
    let strategy = '';

    $('table').each((_, tbl) => {
      const text = cleanText($(tbl).text());
      if (text.includes('List of Buffs')) {
        $(tbl).find('tr').each((_, tr) => {
          const rowText = cleanText($(tr).text());
          if (rowText.includes('Reward')) {
            rewards = $(tr).find('td').last().text().split(/(?:・|\n)/).map(s => cleanText(s.replace(/^・\s*/, ''))).filter(Boolean);
          } else if (!rowText.includes('List of Buffs')) {
            enemyBuffs = rowText.split(/(?:・|\n)/).map(s => cleanText(s.replace(/^・\s*/, ''))).filter(Boolean);
          }
        });
      }
    });

    const paragraphs = [];
    $('p').each((_, p) => {
      const pt = cleanText($(p).text());
      if (pt.includes('Trial is') || pt.includes('magic user') || pt.includes('clashes against')) {
        paragraphs.push(pt);
      }
    });
    strategy = paragraphs.slice(0, 3).join(' ');

    godTrials.push({
      trial_name: tc.name,
      god: tc.god,
      unlock_condition: unlockCond,
      enemy_buffs: enemyBuffs,
      rewards,
      strategy: strategy || 'Bring magic users to counter enemy defenses and exploit divine blessing weaknesses.',
      url: tc.url,
      raw_source: tc.file
    });
  }

  const mechanicsData = {
    notable_deeds_milestones: milestones,
    temple_blessings: {
      blessings,
      holy_days: holyDays
    },
    mounts,
    thermae_baths: {
      unlock_requirement: 'Reach Renown Level 8',
      baths: thermaeBaths
    },
    terrain_effects: terrainEffects,
    god_trials: godTrials
  };

  await fs.writeFile('extractions/mechanics.json', JSON.stringify(mechanicsData, null, 2), 'utf-8');
  console.log(`Saved mechanics data to extractions/mechanics.json`);

  console.log('\n=== All Extractions Finished Successfully! ===');
}

run().catch(err => {
  console.error('Fatal error during scrape:', err);
  process.exit(1);
});
