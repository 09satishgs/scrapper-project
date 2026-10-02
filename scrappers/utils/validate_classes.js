import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('extractions/classes.json', 'utf-8'));
console.log('Total classes in extractions/classes.json:', data.length);

let errors = 0;
for (const item of data) {
  if (!item.id || !item.name || !item.tier || !item.raw_source) {
    console.error('Invalid record:', item);
    errors++;
  }
  // Check for any <img> or image tags in values
  const str = JSON.stringify(item);
  if (str.includes('<img') || str.includes('data:image') || str.includes('.png') || str.includes('.jpg') || str.includes('.webp')) {
    console.warn(`Record contains image reference: ${item.name}`);
  }
}
console.log(`Validation completed. Errors: ${errors}`);
console.log('Sample record:');
console.log(JSON.stringify(data[0], null, 2));
