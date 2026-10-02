import fs from 'node:fs';
import path from 'node:path';

function validateFile(fileName, expectedFields, numFields = []) {
  console.log(`\n--- Validating ${fileName} ---`);
  const filePath = path.resolve(`extractions/${fileName}`);
  const content = fs.readFileSync(filePath, 'utf-8');
  let data;
  try {
    data = JSON.parse(content);
    console.log(`✓ Valid JSON, ${data.length} records`);
  } catch (err) {
    console.error(`✗ Invalid JSON:`, err.message);
    return false;
  }

  let errors = 0;
  data.forEach((rec, idx) => {
    // Check raw_source
    if (!rec.raw_source || typeof rec.raw_source !== 'string') {
      console.error(`Record ${idx} (${rec.name}) missing raw_source`);
      errors++;
    } else {
      const srcPath = path.resolve(rec.raw_source);
      if (!fs.existsSync(srcPath)) {
        console.error(`Record ${idx} (${rec.name}) raw_source file not found: ${rec.raw_source}`);
        errors++;
      }
    }

    // Check expected fields
    for (const f of expectedFields) {
      if (!(f in rec)) {
        console.error(`Record ${idx} (${rec.name}) missing field "${f}"`);
        errors++;
      }
    }

    // Check numeric fields
    for (const f of numFields) {
      if (rec[f] !== null && typeof rec[f] !== 'number') {
        console.error(`Record ${idx} (${rec.name}) field "${f}" is not number or null: ${typeof rec[f]} (${rec[f]})`);
        errors++;
      }
    }

    // Check no image html or tags
    for (const [key, val] of Object.entries(rec)) {
      if (typeof val === 'string' && (val.includes('<img') || val.includes('.png') || val.includes('.jpg'))) {
        console.error(`Record ${idx} (${rec.name}) field "${key}" contains image reference: ${val}`);
        errors++;
      }
    }
  });

  if (errors === 0) {
    console.log(`✓ All ${data.length} records passed validation!`);
  } else {
    console.error(`✗ Found ${errors} validation errors`);
  }
  return errors === 0;
}

const weaponsOk = validateFile('weapons.json', ['name', 'category', 'might', 'hit', 'crit', 'weight', 'durability', 'range', 'rank', 'special_effects', 'raw_source'], ['might', 'hit', 'crit', 'weight', 'durability']);
const spellsOk = validateFile('spells.json', ['name', 'category', 'rank', 'uses', 'might', 'hit', 'crit', 'range', 'effects', 'raw_source'], ['uses', 'might', 'hit', 'crit', 'weight']);
const itemsOk = validateFile('items.json', ['name', 'category', 'effect', 'how_to_get', 'raw_source'], []);

if (!weaponsOk || !spellsOk || !itemsOk) {
  process.exit(1);
} else {
  console.log('\nALL EXTRACTIONS FULLY VALIDATED SUCCESSFULLY!');
}
