import fs from 'node:fs';

const rawCsvText = `Character,Level,HP,Str,Mag,Spd,Dex,Def,Res,Lck,Cha,Beginner,Specialty,Notes
Alexandra,1,23,6,5,10,7,5,6,9,11,,Wing Soldier,"Something weird is going on with Alexandra/Io autolevels, the current formula cannot handle these characters"
Anatolia,1,25,6,11,10,8,6,6,6,8,Diviner,Shaman,
Benditz,1,27,9,4,6,9,6,4,6,4,Soldier,Charioteer,
Bertrand,1,28,11,4,7,10,7,3,4,9,Gladiator,Brigand,
Bonaventure,1,25,7,10,7,8,6,8,5,7,Diviner,Shaman,
Buccar,1,29,12,4,5,6,8,3,6,6,Soldier,Armored Knight,
Cai,1,27,10,7,8,8,6,5,6,5,Ornius Rider,Light Cavalry,
Catania,1,25,8,6,9,9,5,7,6,8,Soldier,Wing Soldier,
Dadao,1,28,13,4,5,5,9,4,8,5,Gladiator,Brigand,
Dante,1,25,5,9,9,6,5,8,7,5,Diviner,Shaman,
Diego,1,25,9,4,8,9,5,3,7,5,Hunter,Rogue,
Dietrich,1,27,11,6,10,11,6,4,9,10,Gladiator,Myrmidon,
Esmeralda,1,28,12,4,6,5,7,3,7,6,Soldier,Armored Knight,
Fabio,1,25,6,10,7,6,4,8,6,5,Diviner,Shaman,
Fianna,1,22,4,11,5,6,4,8,4,7,Diviner,Priest,
Gaitz,1,27,10,3,7,7,6,3,5,7,Soldier,Light Cavalry,
Goliath,1,32,14,2,5,4,8,2,5,4,Soldier,Armored Knight,
Guzran,1,26,11,4,9,7,6,3,9,6,Gladiator,Myrmidon,
Halvin,1,24,7,5,8,9,5,5,7,6,Hunter,Archer,
Inyoni,1,26,12,6,6,5,6,4,6,5,Hunter,Archer,
Io,1,26,10,7,8,7,6,6,6,8,,Light Cavalry,"Something weird is going on with Alexandra/Io autolevels, the current formula cannot handle these characters"
Jasmine,1,28,9,4,5,7,8,3,7,7,Soldier,Armored Knight,
Jester,1,25,8,5,10,9,4,4,6,8,Gladiator,Myrmidon,
Kiroc,1,26,8,3,10,10,6,4,7,4,Hunter,Rogue,
Leda,1,25,8,6,12,8,6,6,5,10,Hunter,Rogue,
Lilian,1,24,7,5,8,8,5,4,5,5,Hunter,Archer,
Loretta,1,23,7,6,9,6,5,4,6,4,Gladiator,Wing Soldier,
Ludia,1,25,7,4,12,7,6,3,5,5,Gladiator,Myrmidon,
Lysander,1,26,8,5,6,7,7,5,7,6,Ornius Rider,Light Cavalry,
Majide,1,30,12,3,6,5,7,3,5,3,Gladiator,Brigand,
Mikaela,1,26,10,3,6,7,6,4,6,8,Gladiator,Brigand,
Mu,1,23,7,3,7,8,5,5,4,4,Gladiator,Pugilist,
Nezha,1,26,8,5,12,6,7,5,7,5,Gladiator,Myrmidon,
Ninae,1,28,8,5,6,8,6,9,7,6,Soldier,Light Cavalry,
Noctula,1,27,9,3,8,6,7,4,6,5,Gladiator,Pugilist,
Nuzzuo,1,26,9,3,10,8,6,5,6,5,Hunter,Rogue,
Nydine,1,26,8,7,9,7,5,6,6,6,Ornius Rider,Armored Ornius Rider,
Olympia,1,24,5,11,7,6,5,6,6,8,Diviner,Priest,
Orchel,1,22,15,9,4,3,12,12,5,10,Diviner,Priest,
Peppe,1,23,6,5,10,8,5,5,7,4,Hunter,Rogue,
Peter,1,25,9,3,6,10,5,4,5,4,Hunter,Archer,
Seteth,1,26,10,7,8,7,6,6,6,8,Soldier,Light Cavalry,
Sha Lan,1,23,6,9,5,6,6,8,8,7,Diviner,Priest,
Simon,1,28,11,4,6,7,7,3,10,4,Gladiator,Brigand,
Sirocco,1,26,8,8,9,8,6,7,8,8,Diviner,Myrmidon,
Sofia,1,23,5,11,5,6,5,9,6,5,Diviner,Priest,
Talimun,1,27,9,11,9,8,6,7,12,9,Diviner,Shaman,
Theodora,1,30,6,6,6,6,7,5,6,8,Soldier,Armored Knight,
Tialla,1,24,5,8,6,6,4,6,7,5,Diviner,Priest,
Tobias,1,28,14,4,5,5,8,3,6,5,Soldier,Armored Knight,
Ultand,1,24,7,9,6,5,6,5,8,9,Diviner,Priest,"Ultand joins on Cai's route at level 13 with 30 HP/11 Str/15 Mag/10 Spd/10 Dex/9 Def/11 Res/15 Lck/15 Cha, higher than her autoleveled stats on other routes"
Ursula,1,24,8,7,8,10,5,5,7,8,Hunter,Rogue,
Yang Jie,1,24,6,10,5,6,5,7,6,5,Diviner,Priest,
Zarcone,1,26,7,3,8,10,5,4,6,4,Gladiator,Brigand,`;

const charactersData = JSON.parse(fs.readFileSync('extractions/characters.json', 'utf-8'));
const charNameToObj = new Map();
for (const c of charactersData) {
  charNameToObj.set(c.name.toLowerCase(), c);
}

// Parse CSV manually handling quotes if any
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

const lines = rawCsvText.trim().split('\n').filter(Boolean);
const header = parseCsvLine(lines[0]);
console.log('CSV Header:', header);

const newBaseStatsList = [];
const updatedStatsBySlug = new Map();

for (let i = 1; i < lines.length; i++) {
  const cols = parseCsvLine(lines[i]);
  const charName = cols[0].trim();
  const cObj = charNameToObj.get(charName.toLowerCase());
  if (!cObj) {
    console.error('Warning: Character not found in characters.json:', charName);
    continue;
  }

  // Header: Character,Level,HP,Str,Mag,Spd,Dex,Def,Res,Lck,Cha,Beginner,Specialty,Notes
  // cols[2] = HP
  // cols[3] = Str
  // cols[4] = Mag
  // cols[5] = Spd
  // cols[6] = Dex
  // cols[7] = Def
  // cols[8] = Res
  // cols[9] = Lck
  // cols[10] = Cha

  const statsObj = {
    hp: parseInt(cols[2], 10),
    str: parseInt(cols[3], 10),
    mag: parseInt(cols[4], 10),
    dex: parseInt(cols[6], 10),
    spd: parseInt(cols[5], 10),
    lck: parseInt(cols[9], 10),
    def: parseInt(cols[7], 10),
    res: parseInt(cols[8], 10),
    cha: parseInt(cols[10], 10)
  };

  newBaseStatsList.push({
    character_id: cObj.id,
    slug: cObj.slug,
    name: cObj.name,
    base_stats: statsObj
  });

  updatedStatsBySlug.set(cObj.slug, statsObj);
}

console.log(`Parsed ${newBaseStatsList.length} character base stats records.`);

// Write extractions/character_base_stats.json
fs.writeFileSync('extractions/character_base_stats.json', JSON.stringify(newBaseStatsList, null, 2), 'utf-8');
console.log('✓ Successfully wrote extractions/character_base_stats.json');

// Update extractions/characters.json
for (const c of charactersData) {
  if (updatedStatsBySlug.has(c.slug)) {
    c.base_stats = updatedStatsBySlug.get(c.slug);
  } else {
    c.base_stats = null;
  }
}
fs.writeFileSync('extractions/characters.json', JSON.stringify(charactersData, null, 2), 'utf-8');
console.log('✓ Successfully updated extractions/characters.json (movement removed, non-sheet characters set to null)');
