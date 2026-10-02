import * as cheerio from 'cheerio';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchOrCache } from './utils/downloader.js';
import { cleanText } from './utils/html_helpers.js';

const HUB_URL = 'https://game8.co/games/Fire-Emblem-Fortunes-Weave';
const HUB_RAW_PATH = 'raw_extracts/hub.html';

export async function crawlCatalog() {
  console.log(`[Crawler] Fetching hub page: ${HUB_URL}`);
  const { html, raw_source } = await fetchOrCache(HUB_URL, HUB_RAW_PATH, 0);
  const $ = cheerio.load(html);

  const catalog = {
    hub_source: raw_source,
    characters: [],
    classes: [],
    weapons_spells: [],
    items: [],
    abilities_arts: [],
    quests_walkthrough: [],
    guides: []
  };

  const seenUrls = new Set();

  function addEntry(list, name, href, extra = {}) {
    if (!href || href.startsWith('#')) return;
    const fullUrl = href.startsWith('http') ? href : `https://game8.co${href}`;
    if (!fullUrl.includes('/Fire-Emblem-Fortunes-Weave/archives/')) return;
    if (seenUrls.has(fullUrl)) return;
    seenUrls.add(fullUrl);

    const archiveId = fullUrl.match(/\/archives\/(\d+)/)?.[1] || '';
    list.push({
      id: archiveId,
      name: cleanText(name),
      url: fullUrl,
      ...extra
    });
  }

  // Iterate over sections in the main article body
  const main = $('div.p-archiveBody__main');

  main.find('h2, h3').each((_, headingElem) => {
    const headingText = cleanText($(headingElem).text());

    // Gather siblings until next heading
    let curr = $(headingElem).next();
    while (curr.length && !curr.is('h2, h3')) {
      if (curr.is('table, ul, div, p')) {
        curr.find('a').each((_, a) => {
          const href = $(a).attr('href');
          const text = $(a).text();
          if (!href) return;

          if (headingText.includes('Playable Characters') || headingText.includes('Other Characters') || headingText === 'Characters') {
            addEntry(catalog.characters, text, href, { section: headingText });
          } else if (headingText.includes('Classes')) {
            addEntry(catalog.classes, text, href, { section: headingText });
          } else if (headingText.includes('Weapons and Spells')) {
            addEntry(catalog.weapons_spells, text, href, { section: headingText });
          } else if (headingText.includes('Items')) {
            addEntry(catalog.items, text, href, { section: headingText });
          } else if (headingText.includes('Abilities') || headingText.includes('Combat Arts')) {
            addEntry(catalog.abilities_arts, text, href, { section: headingText });
          } else if (headingText.includes('Walkthrough') || headingText.includes('Quests') || headingText.includes('Routes')) {
            addEntry(catalog.quests_walkthrough, text, href, { section: headingText });
          } else if (headingText.includes('Guides') || headingText.includes('Tips and Tricks')) {
            addEntry(catalog.guides, text, href, { section: headingText });
          }
        });
      }
      curr = curr.next();
    }
  });

  // Also extract any table of contents / index links
  main.find('table.a-table a').each((_, a) => {
    const href = $(a).attr('href');
    const text = $(a).text();
    if (!href) return;
    const fullUrl = href.startsWith('http') ? href : `https://game8.co${href}`;
    if (!fullUrl.includes('/Fire-Emblem-Fortunes-Weave/archives/')) return;
    if (seenUrls.has(fullUrl)) return;

    // Categorize by keywords if not seen
    const lower = text.toLowerCase();
    if (lower.includes('route') || lower.includes('chapter') || lower.includes('paralogue') || lower.includes('quest')) {
      addEntry(catalog.quests_walkthrough, text, href, { section: 'Table of Contents' });
    } else if (lower.includes('sword') || lower.includes('axe') || lower.includes('spear') || lower.includes('bow') || lower.includes('magic')) {
      addEntry(catalog.weapons_spells, text, href, { section: 'Table of Contents' });
    } else if (lower.includes('item') || lower.includes('gift') || lower.includes('ore') || lower.includes('fish')) {
      addEntry(catalog.items, text, href, { section: 'Table of Contents' });
    } else {
      addEntry(catalog.guides, text, href, { section: 'Table of Contents' });
    }
  });

  const catalogPath = path.resolve('extractions/catalog.json');
  await fs.writeFile(catalogPath, JSON.stringify(catalog, null, 2), 'utf-8');
  console.log(`[Crawler] Catalog generated at ${catalogPath}`);
  console.log(`Summary:`);
  console.log(`- Characters: ${catalog.characters.length}`);
  console.log(`- Classes: ${catalog.classes.length}`);
  console.log(`- Weapons & Spells: ${catalog.weapons_spells.length}`);
  console.log(`- Items: ${catalog.items.length}`);
  console.log(`- Abilities & Arts: ${catalog.abilities_arts.length}`);
  console.log(`- Quests & Walkthrough: ${catalog.quests_walkthrough.length}`);
  console.log(`- Guides & Mechanics: ${catalog.guides.length}`);

  return catalog;
}

if (process.argv[1] && process.argv[1].endsWith('index_crawler.js')) {
  crawlCatalog().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
