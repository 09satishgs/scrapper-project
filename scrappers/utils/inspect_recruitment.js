import { fetchOrCache } from './downloader.js';
import * as cheerio from 'cheerio';

async function checkRecruitment() {
  const { html, raw_source } = await fetchOrCache(
    'https://game8.co/games/Fire-Emblem-Fortunes-Weave/archives/620957',
    'raw_extracts/guides/recruitment_requirements_620957.html',
    0
  );
  console.log('Downloaded', raw_source, 'size:', html.length);
  const $ = cheerio.load(html);
  console.log('Title:', $('h1').text().trim());

  $('h2, h3').each((i, el) => {
    console.log($(el).prop('tagName'), ':', $(el).text().trim().replace(/\s+/g, ' '));
  });

  $('table').each((i, tbl) => {
    console.log(`\nTable ${i}`);
    const headers = [];
    $(tbl).find('tr').first().find('th, td').each((_, c) => headers.push($(c).text().trim().replace(/\s+/g, ' ')));
    console.log('  Headers:', headers.join(' | '));
    const sampleRows = [];
    $(tbl).find('tr').slice(1, 4).each((_, tr) => {
      const row = [];
      $(tr).find('th, td').each((_, c) => row.push($(c).text().trim().replace(/\s+/g, ' ')));
      sampleRows.push(row.join(' | '));
    });
    console.log('  Sample rows:\n    ' + sampleRows.join('\n    '));
  });
}

checkRecruitment().catch(console.error);
