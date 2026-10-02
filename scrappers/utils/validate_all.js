import fs from 'node:fs';

function validateJson(filePath, requiredFields = [], checkRawSource = true) {
  console.log(`\n=== Validating ${filePath} ===`);
  const content = fs.readFileSync(filePath, 'utf-8');
  const items = JSON.parse(content);
  console.log(`Loaded ${items.length} records.`);

  let errCount = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    for (const f of requiredFields) {
      if (item[f] === undefined || item[f] === null || item[f] === '') {
        console.error(`Record [${i}] (${item.name || item.id}) missing required field '${f}'`);
        errCount++;
      }
    }

    if (checkRawSource) {
      if (!item.raw_source) {
        console.error(`Record [${i}] (${item.name}) missing 'raw_source'`);
        errCount++;
      } else if (!fs.existsSync(item.raw_source)) {
        console.error(`Record [${i}] (${item.name}) raw_source file does not exist: ${item.raw_source}`);
        errCount++;
      }
    }

    // Check for any image tags or web URLs inside fields
    const serialized = JSON.stringify(item);
    if (serialized.includes('<img') || serialized.includes('data:image') || serialized.includes('.png') || serialized.includes('.jpg') || serialized.includes('.webp')) {
      console.warn(`Record [${i}] (${item.name}) contains image pattern!`);
      errCount++;
    }
  }

  console.log(`Validation result for ${filePath}: ${errCount} errors found.`);
  return { count: items.length, errCount };
}

console.log('--- STARTING OVERALL VALIDATION ---');
const cRes = validateJson('extractions/classes.json', ['id', 'name', 'tier', 'raw_source']);
const aRes = validateJson('extractions/abilities.json', ['id', 'name', 'category', 'effect', 'raw_source']);
const caRes = validateJson('extractions/combat_arts.json', ['id', 'name', 'art_type', 'raw_source']);

console.log('\n--- VALIDATION SUMMARY ---');
console.log(`Classes: ${cRes.count} records, ${cRes.errCount} errors`);
console.log(`Abilities: ${aRes.count} records, ${aRes.errCount} errors`);
console.log(`Combat & Blaze Arts: ${caRes.count} records, ${caRes.errCount} errors`);

// Print sample from each
console.log('\nSample Class (Paladin/Sentinel or similar):');
const classes = JSON.parse(fs.readFileSync('extractions/classes.json', 'utf-8'));
console.log(JSON.stringify(classes[3], null, 2));

console.log('\nSample Ability:');
const abs = JSON.parse(fs.readFileSync('extractions/abilities.json', 'utf-8'));
console.log(JSON.stringify(abs[0], null, 2));

console.log('\nSample Combat Art:');
const cas = JSON.parse(fs.readFileSync('extractions/combat_arts.json', 'utf-8'));
console.log(JSON.stringify(cas[0], null, 2));

console.log('\nSample Blaze Art:');
console.log(JSON.stringify(cas.find(a => a.art_type === 'Blaze Art'), null, 2));
