import fs from 'node:fs';
import path from 'node:path';

const files = fs.readdirSync('extractions').filter(f => f.endsWith('.json') && f !== 'catalog.json');
console.log('--- FINAL DATASET INTEGRITY AUDIT ---');

let totalRecords = 0;
let totalRawSources = 0;
let missingSources = 0;
let imageTagsFound = 0;

for (const file of files) {
  const filePath = path.join('extractions', file);
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);
  
  let recordCount = 0;

  function scan(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach(scan);
    } else {
      recordCount++;
      if (obj.raw_source) {
        totalRawSources++;
        if (!fs.existsSync(obj.raw_source)) {
          console.error(`[AUDIT ERROR] Missing raw_source in ${file}: ${obj.raw_source}`);
          missingSources++;
        }
      }
      for (const val of Object.values(obj)) {
        if (typeof val === 'string' && (val.includes('<img') || val.includes('data:image'))) {
          imageTagsFound++;
        }
        if (typeof val === 'object') {
          scan(val);
        }
      }
    }
  }

  if (Array.isArray(data)) {
    recordCount = data.length;
    data.forEach(scan);
  } else {
    scan(data);
  }

  const stat = fs.statSync(filePath);
  const sizeKb = (stat.size / 1024).toFixed(1).padStart(7);
  console.log(`${file.padEnd(28)} | Size: ${sizeKb} KB | Records: ${String(recordCount).padStart(5)}`);
  totalRecords += recordCount;
}

console.log('------------------------------------------------------------');
console.log(`Total Extractions JSON Files: ${files.length}`);
console.log(`Total Verified 'raw_source' Links: ${totalRawSources}`);
console.log(`Missing Raw Source Files on Disk: ${missingSources}`);
console.log(`Image Tags Detected: ${imageTagsFound}`);
console.log('------------------------------------------------------------');
