import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { fetchOrCache } from './utils/downloader.js';
import { cleanText, parseNumber } from './utils/html_helpers.js';

/**
 * Equipment & Items Scraper for Fire Emblem: Fortune's Weave
 * Extracts:
 * - extractions/weapons.json
 * - extractions/spells.json
 * - extractions/items.json
 */

const WEAPON_CATEGORY_PAGES = [
  { name: 'swords', id: '621071', category: 'Sword', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/621071' },
  { name: 'spears', id: '621072', category: 'Spear', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/621072' },
  { name: 'axes', id: '621073', category: 'Axe', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/621073' },
  { name: 'bows', id: '621074', category: 'Bow', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/621074' },
  { name: 'gauntlets', id: '621076', category: 'Gauntlet', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/621076' },
];

const SPELL_CATEGORY_PAGES = [
  { name: 'black_magic', id: '621078', category: 'Black Magic', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/621078' },
  { name: 'white_magic', id: '621077', category: 'White Magic', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/621077' },
];

const SHIELD_PAGES = [
  { name: 'shields', id: '624945', category: 'Shield', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624945' },
];

const ITEM_CATEGORY_PAGES = [
  { name: 'consumables', id: '621538', category: 'Consumables', tableIdx: 1, url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/621538' },
  { name: 'gifts', id: '621535', category: 'Gifts', tableIdx: 2, url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/621535' },
  { name: 'ores', id: '621537', category: 'Ores', tableIdx: 1, url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/621537' },
  { name: 'vegetables', id: '621536', category: 'Vegetables', tableIdx: 1, url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/621536' },
  { name: 'fishes', id: '624948', category: 'Fishes', tableIdx: 1, url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624948' },
  { name: 'meats', id: '626105', category: 'Meats', tableIdx: 1, url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/626105' },
  { name: 'licenses', id: '624947', category: 'Exam Licenses', tableIdx: 1, url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624947' },
  { name: 'other_items', id: '624946', category: 'Other Items', tableIdx: 1, url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624946' },
  { name: 'equipment', id: '624944', category: 'Equipment', tableIdx: 1, url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/624944' },
];

const HUB_PAGES = {
  weapons: { id: '620255', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/620255', file: 'raw_extracts/weapons_spells/hub_620255.html' },
  items: { id: '621281', url: 'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/621281', file: 'raw_extracts/items/hub_621281.html' },
};

/**
 * Normalizes rank string to rank letter (e.g. "• Sword E" -> "E", "-" -> null)
 */
function normalizeRank(raw) {
  if (!raw) return null;
  const cleaned = cleanText(raw).replace(/^•\s*/, '').trim();
  if (!cleaned || cleaned === '-') return null;
  // Match single letter rank like "Sword E" -> "E"
  const rankMatch = cleaned.match(/\b([SABCDE])\b/i);
  return rankMatch ? rankMatch[1].toUpperCase() : cleaned;
}

/**
 * Parses weapons/spells table from category HTML
 */
function parseWeaponOrSpellTable(html, rawSource, category, isSpell = false) {
  const $ = cheerio.load(html);
  const rows = $('table').eq(2).find('tr');
  const results = [];

  for (let i = 1; i < rows.length; i++) {
    const tr = rows.eq(i);
    const cells = tr.find('th, td');
    if (cells.length >= 7) {
      const name = cleanText(cells.eq(0).text());
      const might = parseNumber(cells.eq(1).text());
      const durabilityOrUses = parseNumber(cells.eq(2).text());
      const rangeText = cleanText(cells.eq(3).text());
      const range = rangeText === '-' ? null : rangeText;
      const hit = parseNumber(cells.eq(4).text());
      const crit = parseNumber(cells.eq(5).text());
      const weight = parseNumber(cells.eq(6).text());
      const rank = normalizeRank(cells.eq(7).text());

      // Next row may be description
      let description = null;
      if (i + 1 < rows.length) {
        const nextTr = rows.eq(i + 1);
        const nextCells = nextTr.find('th, td');
        if (nextCells.length === 1) {
          const descRaw = cleanText(nextCells.eq(0).text());
          description = descRaw.replace(/^Description:\s*/i, '').trim();
          if (description === 'TBD' || description === 'TBA' || description === '-') {
            description = null;
          }
          i++; // Advance over description row
        }
      }

      if (isSpell) {
        results.push({
          name,
          category,
          rank,
          uses: durabilityOrUses,
          might,
          hit,
          crit,
          range,
          weight,
          effects: description,
          raw_source: rawSource
        });
      } else {
        results.push({
          name,
          category,
          might,
          hit,
          crit,
          weight,
          durability: durabilityOrUses,
          range,
          rank,
          special_effects: description,
          raw_source: rawSource
        });
      }
    }
  }

  return results;
}

/**
 * Parses shields from category page and items hub
 */
function parseShields(shieldsHtml, shieldsRawSource, itemsHubHtml, itemsHubRawSource) {
  const shieldsMap = new Map();

  // 1. From category page
  const $s = cheerio.load(shieldsHtml);
  $s('table').eq(1).find('tr').slice(1).each((_, tr) => {
    const cells = $s(tr).find('td, th');
    if (cells.length >= 2) {
      const name = cleanText(cells.eq(0).text());
      const desc = cleanText(cells.eq(1).text());
      if (name && name !== 'Item') {
        shieldsMap.set(name, {
          name,
          category: 'Shield',
          might: null,
          hit: null,
          crit: null,
          weight: null,
          durability: null,
          range: null,
          rank: null,
          special_effects: desc === 'TBA' || desc === 'TBD' ? null : desc,
          raw_source: shieldsRawSource
        });
      }
    }
  });

  // 2. Enrich/supplement from items hub Table 10 (Item | Effect | Weight)
  const $h = cheerio.load(itemsHubHtml);
  $h('table').eq(10).find('tr').slice(1).each((_, tr) => {
    const cells = $h(tr).find('td, th');
    if (cells.length >= 2) {
      const name = cleanText(cells.eq(0).text());
      const effect = cleanText(cells.eq(1).text());
      const weightVal = cells.length >= 3 ? parseNumber(cells.eq(2).text()) : null;
      if (name && name !== 'Item') {
        if (!shieldsMap.has(name)) {
          shieldsMap.set(name, {
            name,
            category: 'Shield',
            might: null,
            hit: null,
            crit: null,
            weight: weightVal,
            durability: null,
            range: null,
            rank: null,
            special_effects: effect === 'TBA' || effect === 'TBD' ? null : effect,
            raw_source: shieldsRawSource // canonical source
          });
        } else {
          const existing = shieldsMap.get(name);
          if (weightVal !== null && existing.weight === null) {
            existing.weight = weightVal;
          }
          if (!existing.special_effects && effect && effect !== 'TBA') {
            existing.special_effects = effect;
          }
        }
      }
    }
  });

  return Array.from(shieldsMap.values());
}

/**
 * Extracts "How to Get" content from an individual item HTML page
 */
function parseHowToGetFromPage(html) {
  const $ = cheerio.load(html);
  const howToGet = [];

  $('h2').each((_, h2) => {
    const text = cleanText($(h2).text());
    if (/how to get/i.test(text)) {
      let curr = $(h2).next();
      while (curr.length && !curr.is('h2')) {
        if (curr.is('h3')) {
          const h3Text = cleanText(curr.text());
          if (h3Text && !h3Text.includes('free account') && !h3Text.includes('Game8') && !h3Text.includes('Related Guides')) {
            howToGet.push(h3Text);
          }
        } else if (curr.is('p, ul, li')) {
          const pText = cleanText(curr.text());
          if (pText && !pText.includes('free account') && !pText.includes('Game8') && !pText.includes('Related Guides')) {
            howToGet.push(pText);
          }
        }
        curr = curr.next();
      }
    }
  });

  const joined = howToGet.filter(Boolean).join('; ').trim();
  return joined.length > 0 ? joined : null;
}

/**
 * Main scraper execution
 */
export async function scrapeGearAndItems() {
  console.log('=== [Gear & Items Scraper] Starting Extraction ===');

  // 1. Download / Cache Hub Pages
  console.log('[Downloader] Fetching hub pages...');
  const weaponsHub = await fetchOrCache(HUB_PAGES.weapons.url, HUB_PAGES.weapons.file, 200);
  const itemsHub = await fetchOrCache(HUB_PAGES.items.url, HUB_PAGES.items.file, 200);

  // 2. Scrape Weapons
  console.log('\n[Scraper] Extracting weapons...');
  const allWeapons = [];

  for (const page of WEAPON_CATEGORY_PAGES) {
    const localFile = `raw_extracts/weapons_spells/${page.name}_${page.id}.html`;
    const { html, raw_source } = await fetchOrCache(page.url, localFile, 200);
    const weapons = parseWeaponOrSpellTable(html, raw_source, page.category, false);
    allWeapons.push(...weapons);
    console.log(`  - ${page.category}s: extracted ${weapons.length} items`);
  }

  // 3. Scrape Shields
  console.log('[Scraper] Extracting shields...');
  const shieldPage = SHIELD_PAGES[0];
  const shieldLocal = `raw_extracts/weapons_spells/${shieldPage.name}_${shieldPage.id}.html`;
  const shieldRes = await fetchOrCache(shieldPage.url, shieldLocal, 200);
  const shields = parseShields(shieldRes.html, shieldRes.raw_source, itemsHub.html, itemsHub.raw_source);
  allWeapons.push(...shields);
  console.log(`  - Shields: extracted ${shields.length} items`);

  // 4. Scrape Spells
  console.log('\n[Scraper] Extracting spells...');
  const allSpells = [];

  for (const page of SPELL_CATEGORY_PAGES) {
    const localFile = `raw_extracts/weapons_spells/${page.name}_${page.id}.html`;
    const { html, raw_source } = await fetchOrCache(page.url, localFile, 200);
    const spells = parseWeaponOrSpellTable(html, raw_source, page.category, true);
    allSpells.push(...spells);
    console.log(`  - ${page.category}: extracted ${spells.length} spells`);
  }

  // 5. Scrape Items
  console.log('\n[Scraper] Extracting items...');
  const allItemsMap = new Map();

  // Helper to parse item rows from a table
  function collectItemsFromTable(html, rawSource, tableIdx, category) {
    const $ = cheerio.load(html);
    const rows = $('table').eq(tableIdx).find('tr');
    rows.slice(1).each((_, tr) => {
      const cells = $(tr).find('td, th');
      if (cells.length < 2) return;
      const name = cleanText(cells.eq(0).text());
      if (!name || name === 'Item' || name === 'Consumables') return;

      const a = cells.eq(0).find('a');
      let archiveId = null;
      let archiveUrl = null;
      if (a.length) {
        const href = a.attr('href');
        const match = href?.match(/\/archives\/(\d+)/);
        if (match) {
          archiveId = match[1];
          archiveUrl = href.startsWith('http') ? href : `https://game8.co${href}`;
        }
      }

      const effectRaw = cleanText(cells.eq(1).text());
      const effect = (effectRaw === 'TBA' || effectRaw === 'TBD' || effectRaw === '-') ? null : effectRaw;

      let likedBy = null;
      if (cells.length >= 3) {
        const likedText = cleanText(cells.eq(2).text());
        if (likedText) {
          const cleanedLiked = likedText.replace(/^Liked\s*by:\s*/i, '').trim();
          if (cleanedLiked) {
            likedBy = cleanedLiked.split(/\s{2,}|\n/).map(s => s.trim()).filter(Boolean);
            if (likedBy.length === 1 && likedBy[0].includes(' ')) {
              likedBy = likedBy[0].split(/\s+/).filter(Boolean);
            }
          }
        }
      }

      const key = `${category}:${name}`;
      if (!allItemsMap.has(key)) {
        allItemsMap.set(key, {
          name,
          category,
          effect,
          how_to_get: null,
          ...(likedBy ? { liked_by: likedBy } : {}),
          archive_id: archiveId,
          archive_url: archiveUrl,
          raw_source: rawSource
        });
      } else {
        const existing = allItemsMap.get(key);
        if (!existing.effect && effect) existing.effect = effect;
        if (likedBy && !existing.liked_by) existing.liked_by = likedBy;
        if (!existing.archive_url && archiveUrl) {
          existing.archive_url = archiveUrl;
          existing.archive_id = archiveId;
        }
      }
    });
  }

  // 5a. Collect from category pages
  for (const page of ITEM_CATEGORY_PAGES) {
    const localFile = page.category === 'Equipment'
      ? `raw_extracts/weapons_spells/${page.name}_${page.id}.html`
      : `raw_extracts/items/${page.name}_${page.id}.html`;
    const { html, raw_source } = await fetchOrCache(page.url, localFile, 200);
    collectItemsFromTable(html, raw_source, page.tableIdx, page.category);
  }

  // 5b. Supplement from Items Hub tables
  const hubTableMappings = [
    { tableIdx: 2, category: 'Consumables' },
    { tableIdx: 3, category: 'Gifts' },
    { tableIdx: 4, category: 'Fishes' },
    { tableIdx: 5, category: 'Vegetables' },
    { tableIdx: 6, category: 'Meats' },
    { tableIdx: 7, category: 'Ores' },
    { tableIdx: 8, category: 'Exam Licenses' },
    { tableIdx: 9, category: 'Equipment' },
    { tableIdx: 11, category: 'Other Items' }
  ];

  for (const mapping of hubTableMappings) {
    collectItemsFromTable(itemsHub.html, itemsHub.raw_source, mapping.tableIdx, mapping.category);
  }

  console.log(`  - Total unique items collected: ${allItemsMap.size}`);

  // 6. Enrich items with individual pages for "How to Get / Locations"
  console.log('\n[Enricher] Scanning for items with dedicated archive pages...');
  const itemsWithUrls = Array.from(allItemsMap.values()).filter(it => it.archive_url && it.archive_id);
  console.log(`  - Found ${itemsWithUrls.length} items with dedicated pages`);

  for (let idx = 0; idx < itemsWithUrls.length; idx++) {
    const item = itemsWithUrls[idx];
    const itemLocalFile = `raw_extracts/items/item_${item.archive_id}.html`;
    try {
      const res = await fetchOrCache(item.archive_url, itemLocalFile, 150);
      const howToGet = parseHowToGetFromPage(res.html);
      if (howToGet) {
        item.how_to_get = howToGet;
      }
      // Point raw_source to the specific item HTML
      item.raw_source = res.raw_source;
      if ((idx + 1) % 10 === 0 || idx + 1 === itemsWithUrls.length) {
        console.log(`    Enriched ${idx + 1}/${itemsWithUrls.length} items`);
      }
    } catch (err) {
      console.warn(`    Failed to fetch item page for ${item.name}: ${err.message}`);
    }
  }

  // Format final items array (clean internal helper fields)
  const finalItems = Array.from(allItemsMap.values()).map(it => {
    const { archive_id, archive_url, ...rest } = it;
    return rest;
  });

  // 7. Write outputs to extractions/
  await fs.mkdir('extractions', { recursive: true });

  const weaponsPath = path.resolve('extractions/weapons.json');
  const spellsPath = path.resolve('extractions/spells.json');
  const itemsPath = path.resolve('extractions/items.json');

  await fs.writeFile(weaponsPath, JSON.stringify(allWeapons, null, 2), 'utf-8');
  await fs.writeFile(spellsPath, JSON.stringify(allSpells, null, 2), 'utf-8');
  await fs.writeFile(itemsPath, JSON.stringify(finalItems, null, 2), 'utf-8');

  console.log('\n=== [Extraction Summary] ===');
  console.log(`✓ Weapons saved to: ${weaponsPath} (${allWeapons.length} records)`);
  console.log(`✓ Spells saved to: ${spellsPath} (${allSpells.length} records)`);
  console.log(`✓ Items saved to: ${itemsPath} (${finalItems.length} records)`);

  // Category breakdown for summary
  const weaponBreakdown = {};
  allWeapons.forEach(w => weaponBreakdown[w.category] = (weaponBreakdown[w.category] || 0) + 1);
  console.log('Weapon breakdown:', weaponBreakdown);

  const spellBreakdown = {};
  allSpells.forEach(s => spellBreakdown[s.category] = (spellBreakdown[s.category] || 0) + 1);
  console.log('Spell breakdown:', spellBreakdown);

  const itemBreakdown = {};
  finalItems.forEach(it => itemBreakdown[it.category] = (itemBreakdown[it.category] || 0) + 1);
  console.log('Item breakdown:', itemBreakdown);

  return {
    weapons: allWeapons,
    spells: allSpells,
    items: finalItems
  };
}

// Allow direct execution
if (process.argv[1] && process.argv[1].endsWith('gear_item_scrapper.js')) {
  scrapeGearAndItems().catch(err => {
    console.error('Fatal error in gear_item_scrapper:', err);
    process.exit(1);
  });
}
