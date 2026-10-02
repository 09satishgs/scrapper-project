import fs from 'node:fs';

const files = [
  'extractions/quests.json',
  'extractions/paralogues.json',
  'extractions/story_routes.json',
  'extractions/mechanics.json'
];

let totalErrors = 0;

for (const file of files) {
  console.log(`\nChecking ${file}...`);
  if (!fs.existsSync(file)) {
    console.error(`ERROR: File does not exist: ${file}`);
    totalErrors++;
    continue;
  }

  const raw = fs.readFileSync(file, 'utf-8');
  let data;
  try {
    data = JSON.parse(raw);
    console.log(`  Valid JSON! File size: ${(raw.length / 1024).toFixed(1)} KB`);
  } catch (err) {
    console.error(`  Invalid JSON: ${err.message}`);
    totalErrors++;
    continue;
  }

  // Check raw_sources
  function checkRawSources(obj, path = '') {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach((item, idx) => checkRawSources(item, `${path}[${idx}]`));
    } else {
      if (obj.raw_source) {
        if (!fs.existsSync(obj.raw_source)) {
          console.error(`  ERROR: Invalid raw_source at ${path}: ${obj.raw_source}`);
          totalErrors++;
        }
      }
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') {
          // Check for img tags
          if (v.includes('<img') || v.includes('.png') || v.includes('.jpg') || v.includes('.webp') || v.includes('.gif')) {
            console.warn(`  WARNING: Possible image reference in ${path}.${k}: ${v.slice(0, 50)}`);
          }
          // Check for uncleaned html tags
          if (/<[a-z][\s\S]*>/i.test(v)) {
            console.warn(`  WARNING: Uncleaned HTML in ${path}.${k}: ${v.slice(0, 50)}`);
          }
        } else if (typeof v === 'object') {
          checkRawSources(v, `${path}.${k}`);
        }
      }
    }
  }

  checkRawSources(data);

  if (file === 'extractions/quests.json') {
    console.log(`  Quests count: ${data.length}`);
    const sample = data[0];
    console.log('  Required fields present:', {
      title: !!sample.title,
      chapter: !!sample.chapter_availability,
      client: !!sample.client,
      objective: !!sample.objective,
      rewards: Array.isArray(sample.rewards),
      strategy: !!sample.strategy,
      raw_source: !!sample.raw_source
    });
  }

  if (file === 'extractions/paralogues.json') {
    console.log(`  Paralogues count: ${data.length}`);
    const sample = data[0];
    console.log('  Required fields present:', {
      title: !!sample.title,
      character: !!sample.character_associated,
      requirements: !!sample.requirements,
      rewards: Array.isArray(sample.rewards),
      map_info: !!sample.map_info && !!sample.map_info.location && !!sample.map_info.victory_condition,
      raw_source: !!sample.raw_source
    });
  }

  if (file === 'extractions/story_routes.json') {
    console.log(`  Routes count: ${data.length}`);
    const sample = data[1]; // Cai
    console.log('  Required fields present:', {
      route: !!sample.route,
      conditions: !!sample.conditions,
      chapters: sample.chapters.length,
      chapter_fields: !!sample.chapters[0].title && !!sample.chapters[0].objectives && !!sample.chapters[0].conditions,
      raw_source: !!sample.raw_source
    });
  }

  if (file === 'extractions/mechanics.json') {
    console.log('  Mechanics sections:', Object.keys(data));
    console.log(`    Milestones: ${data.notable_deeds_milestones?.length}`);
    console.log(`    Temple Blessings: ${data.temple_blessings?.blessings?.length}`);
    console.log(`    Mounts: ${data.mounts?.length}`);
    console.log(`    Thermae Baths: ${data.thermae_baths?.baths?.length}`);
    console.log(`    Terrain Effects: ${data.terrain_effects?.length}`);
    console.log(`    God Trials: ${data.god_trials?.length}`);
  }
}

console.log(`\nValidation complete. Total fatal errors: ${totalErrors}`);
