import fs from 'node:fs';

const rawMountsData = [
  {
    mount: 'Wild Ornius',
    family: 'Ornius',
    added_hp: '', added_str: '', added_mag: '', added_dex: '3', added_spd: '2', added_lck: '', added_def: '', added_res: '', added_bld: '',
    growth_hp: '', growth_str: '', growth_mag: '', growth_dex: '0.15', growth_spd: '0.1', growth_lck: '', growth_def: '', growth_res: '', growth_bld: '',
    abilities: [
      "Paired Run\nBond 3: Movement +1\nBond 5: Movement +2",
      "Paired Stealth\nBond 3: Favourable terrain: Avoid +10\nBond 5: Favourable terrain: Avoid +10, Shield +3"
    ],
    obtain: 'Elissa Pass; Sparrow’s Thoroughfare; Mount Ouranos; Faro Forest',
    notes: null
  },
  {
    mount: 'White Ornius',
    family: 'Ornius',
    added_hp: 'Unknown', added_str: 'Unknown', added_mag: 'Unknown', added_dex: 'Unknown', added_spd: 'Unknown', added_lck: 'Unknown', added_def: 'Unknown', added_res: 'Unknown', added_bld: 'Unknown',
    growth_hp: '', growth_str: '', growth_mag: '', growth_dex: '0.05', growth_spd: '0.05', growth_lck: '', growth_def: '', growth_res: '0.15', growth_bld: '',
    abilities: [
      "Paired Purify\nBond 3: Player-phase start: 50% poison removal\nBond 5: Player-phase start: remove poison"
    ],
    obtain: 'Faro Forest (rare)',
    notes: 'Growths supplied by the player report; the compiled guide leaves them undocumented.'
  },
  {
    mount: 'Meganius',
    family: 'Ornius',
    added_hp: '', added_str: '1', added_mag: '', added_dex: '1', added_spd: '', added_lck: '', added_def: '3', added_res: '', added_bld: '',
    growth_hp: '', growth_str: '0.05', growth_mag: '', growth_dex: '0.05', growth_spd: '', growth_lck: '', growth_def: '0.15', growth_res: '', growth_bld: '',
    abilities: [
      "Paired Run\nBond 3: Movement +1\nBond 5: Movement +2",
      "Paired Bulk\nBond 3: Build +2\nBond 5: Build +4"
    ],
    obtain: 'Sparrow’s Thoroughfare; Mount Ouranos; Axion Gorge',
    notes: null
  },
  {
    mount: 'Red Meganius',
    family: 'Ornius',
    added_hp: '', added_str: '3', added_mag: '', added_dex: '1', added_spd: '', added_lck: '', added_def: '1', added_res: '', added_bld: '',
    growth_hp: '', growth_str: '0.15', growth_mag: '', growth_dex: '0.05', growth_spd: '', growth_lck: '', growth_def: '0.05', growth_res: '', growth_bld: '',
    abilities: [
      "Paired Run\nBond 3: Movement +1\nBond 5: Movement +2",
      "Paired Protection\nBond 3: Receive 70% of critical-hit damage\nBond 5: Receive 50% of critical-hit damage"
    ],
    obtain: 'Axion Gorge (rare)',
    notes: null
  },
  {
    mount: 'Magonius',
    family: 'Ornius',
    added_hp: '', added_str: '', added_mag: '3', added_dex: '2', added_spd: '', added_lck: '', added_def: '', added_res: '', added_bld: '',
    growth_hp: '', growth_str: '', growth_mag: '0.15', growth_dex: '0.1', growth_spd: '', growth_lck: '', growth_def: '', growth_res: '', growth_bld: '',
    abilities: [
      "Paired Run\nBond 3: Movement +1\nBond 5: Movement +2",
      "Paired Magic-Focus\nBond 3: Unknown\nBond 5: Unknown"
    ],
    obtain: 'Headsman’s Rock',
    notes: null
  },
  {
    mount: 'Black Magonius',
    family: 'Ornius',
    added_hp: '', added_str: '', added_mag: '2', added_dex: '1', added_spd: '2', added_lck: '', added_def: '', added_res: '', added_bld: '',
    growth_hp: '', growth_str: '', growth_mag: '0.1', growth_dex: '0.05', growth_spd: '0.1', growth_lck: '', growth_def: '', growth_res: '', growth_bld: '',
    abilities: [
      "Paired Magic-Sight\nBond 3: Magic equipped: Critical +5\nBond 5: Magic equipped: Critical +10",
      "Canto\nBond 3: After combat: move 1 space\nBond 5: After combat: move 2 spaces"
    ],
    obtain: 'Headsman’s Rock (rare)',
    notes: null
  },
  {
    mount: 'Wild Horse',
    family: 'Horse',
    added_hp: '', added_str: '', added_mag: '', added_dex: '3', added_spd: '1', added_lck: '', added_def: '1', added_res: '', added_bld: '',
    growth_hp: '', growth_str: '0.05', growth_mag: '', growth_dex: '', growth_spd: '0.05', growth_lck: '0.05', growth_def: '', growth_res: '0.05', growth_bld: '0.05',
    abilities: [
      "Paired Run\nBond 3: Movement +1\nBond 5: Movement +2",
      "Paired Alertness\nBond 3: Dodge +5\nBond 5: Dodge +10"
    ],
    obtain: 'Sunlit Pass; Oleance Plains; Daimos Plateau; Sunfall Path',
    notes: null
  },
  {
    mount: 'Monoceros',
    family: 'Horse',
    added_hp: '', added_str: '', added_mag: '', added_dex: '1', added_spd: '1', added_lck: '3', added_def: '', added_res: '', added_bld: '',
    growth_hp: '', growth_str: '0.05', growth_mag: '', growth_dex: '', growth_spd: '0.05', growth_lck: '0.05', growth_def: '', growth_res: '', growth_bld: '0.1',
    abilities: [
      "Paired Healing\nBond 3: Post-combat healing; amount Unknown\nBond 5: Post-combat healing; amount Unknown",
      "Paired Miracle\nBond 3: Luck +3\nBond 5: Luck +5"
    ],
    obtain: 'Oleance Plains (rare)',
    notes: null
  },
  {
    mount: 'Ferghanan Horse',
    family: 'Horse',
    added_hp: '', added_str: '2', added_mag: '', added_dex: '1', added_spd: '', added_lck: '', added_def: '2', added_res: '', added_bld: '',
    growth_hp: '', growth_str: '0.05', growth_mag: '0.05', growth_dex: '', growth_spd: '0.05', growth_lck: '', growth_def: '', growth_res: '0.1', growth_bld: '',
    abilities: [
      "Paired Arts-Focus\nBond 3: Combat Art Hit +10\nBond 5: Combat Art Hit +15",
      "Canto\nBond 3: After combat: move 1 space\nBond 5: After combat: move 2 spaces",
      "Paired Fierce-Arts\nBond 3: Combat Art Attack +2\nBond 5: Combat Art Attack +4"
    ],
    obtain: 'Sunfall Path (rare)',
    notes: null
  },
  {
    mount: 'Rocinan',
    family: 'Horse',
    added_hp: '', added_str: '', added_mag: '', added_dex: '3', added_spd: '1', added_lck: '', added_def: '2', added_res: '', added_bld: '',
    growth_hp: '', growth_str: '0.05', growth_mag: '', growth_dex: '', growth_spd: '0.05', growth_lck: '0.05', growth_def: '', growth_res: '0.1', growth_bld: '0.05',
    abilities: [
      "Paired Run\nBond 3: Movement +1\nBond 5: Movement +2"
    ],
    obtain: 'Io’s unique mount; acquisition requirements Unknown',
    notes: 'Unique · six reported reward points'
  },
  {
    mount: 'Wild Pegasus',
    family: 'Pegasus',
    added_hp: 'Unknown', added_str: 'Unknown', added_mag: 'Unknown', added_dex: 'Unknown', added_spd: 'Unknown', added_lck: 'Unknown', added_def: 'Unknown', added_res: 'Unknown', added_bld: 'Unknown',
    growth_hp: 'Unknown', growth_str: 'Unknown', growth_mag: 'Unknown', growth_dex: 'Unknown', growth_spd: 'Unknown', growth_lck: 'Unknown', growth_def: 'Unknown', growth_res: 'Unknown', growth_bld: 'Unknown',
    abilities: [
      "Paired Streak\nBond 3: Flying movement +1\nBond 5: Flying movement +2",
      "Paired Mage-Kill\nBond 3: Against a magic user: Attack +3\nBond 5: Against a magic user: Attack +5"
    ],
    obtain: 'Valley of Black Wings; Raptor’s Throat; Pegasi’s Peak',
    notes: null
  },
  {
    mount: 'Falicorn',
    family: 'Pegasus',
    added_hp: '', added_str: '1', added_mag: '', added_dex: '1', added_spd: '3', added_lck: '', added_def: '', added_res: '', added_bld: '',
    growth_hp: '', growth_str: '', growth_mag: '0.05', growth_dex: '', growth_spd: '0.05', growth_lck: '0.15', growth_def: '', growth_res: '', growth_bld: '',
    abilities: [
      "Paired Streak\nBond 3: Flying movement +1\nBond 5: Flying movement +2",
      "Paired Tempest\nBond 3: Against bows: Avoid +10\nBond 5: Against bows: Avoid +15",
      "Canto\nBond 3: After combat: move 1 space\nBond 5: After combat: move 2 spaces"
    ],
    obtain: 'Raptor’s Throat; Pegasi’s Peak (rare)',
    notes: 'Discrepancy: another report adds Build +1; not included in the totals above.'
  },
  {
    mount: 'Dark Pegasus',
    family: 'Pegasus',
    added_hp: '', added_str: '', added_mag: '3', added_dex: '', added_spd: '2', added_lck: '', added_def: '', added_res: '', added_bld: '',
    growth_hp: '', growth_str: '', growth_mag: '', growth_dex: '0.15', growth_spd: '', growth_lck: '0.1', growth_def: '', growth_res: '', growth_bld: '',
    abilities: [
      "Paired Streak\nBond 3: Flying movement +1\nBond 5: Flying movement +2",
      "Paired Magic Speed\nBond 3: Magic-based activation chance: Avoid +10\nBond 5: Magic-based activation chance: Avoid +20"
    ],
    obtain: 'Valley of Black Wings (rare)',
    notes: null
  },
  {
    mount: 'Bucephalus',
    family: 'Pegasus',
    added_hp: '', added_str: '1', added_mag: '', added_dex: '', added_spd: '3', added_lck: '', added_def: '', added_res: '2', added_bld: '',
    growth_hp: '', growth_str: '', growth_mag: '0.05', growth_dex: '', growth_spd: '', growth_lck: '0.15', growth_def: '', growth_res: '', growth_bld: '0.1',
    abilities: [
      "Paired Streak\nBond 3: Flying movement +1\nBond 5: Flying movement +2"
    ],
    obtain: 'Alexandra’s unique mount; acquisition requirements Unknown',
    notes: 'Unique · six reported reward points'
  },
  {
    mount: 'Wild Bau',
    family: 'Bau',
    added_hp: '', added_str: '2', added_mag: '', added_dex: '2', added_spd: '1', added_lck: '', added_def: '', added_res: '', added_bld: '',
    growth_hp: '', growth_str: '', growth_mag: '0.1', growth_dex: '', growth_spd: '0.1', growth_lck: '0.05', growth_def: '', growth_res: '', growth_bld: '',
    abilities: [
      "Paired Streak\nBond 3: Flying movement +1\nBond 5: Flying movement +2",
      "Paired Fierce-Arts\nBond 3: Combat Art Attack +2\nBond 5: Combat Art Attack +4"
    ],
    obtain: 'Bau-Caller’s Cape; Warrior’s Road; Valley of Sedden; Velatori Valley; Yashiro Fort',
    notes: 'Growth bonuses · Estimated'
  },
  {
    mount: 'Elephant',
    family: 'Elephant',
    added_hp: 'Unknown', added_str: 'Unknown', added_mag: 'Unknown', added_dex: 'Unknown', added_spd: 'Unknown', added_lck: 'Unknown', added_def: 'Unknown', added_res: 'Unknown', added_bld: 'Unknown',
    growth_hp: 'Unknown', growth_str: 'Unknown', growth_mag: 'Unknown', growth_dex: 'Unknown', growth_spd: 'Unknown', growth_lck: 'Unknown', growth_def: 'Unknown', growth_res: 'Unknown', growth_bld: 'Unknown',
    abilities: [],
    obtain: 'Unknown',
    notes: 'Coverage is incomplete, especially Elephant.'
  }
];

const rawMountedClasses = [
  { class_name: 'Ornius Rider', tier: 'Beginner', movement: 4, movement_type: 'Cavalry', mount_type: 'Ornius' },
  { class_name: 'Armored Ornius Rider', tier: 'Specialty', movement: 4, movement_type: 'Cavalry', mount_type: 'Ornius' },
  { class_name: 'Light Cavalry', tier: 'Specialty', movement: 4, movement_type: 'Cavalry', mount_type: 'Horse' },
  { class_name: 'Charioteer', tier: 'Specialty', movement: 4, movement_type: 'Cavalry', mount_type: 'Horse' },
  { class_name: 'Wing Soldier', tier: 'Specialty', movement: 4, movement_type: 'Flier', mount_type: 'Pegasus', alternate_names: ['Winged Soldier'] },
  { class_name: 'Bardinger', tier: 'Advanced', movement: 4, movement_type: 'Cavalry', mount_type: 'Horse' },
  { class_name: 'Caladrius', tier: 'Advanced', movement: 4, movement_type: 'Cavalry', mount_type: 'Ornius' },
  { class_name: 'Cataphract', tier: 'Advanced', movement: 4, movement_type: 'Cavalry, Heavy Armor', mount_type: 'Horse' },
  { class_name: 'Dragoon', tier: 'Advanced', movement: 4, movement_type: 'Flier', mount_type: 'Bau' },
  { class_name: 'Elephant Rider', tier: 'Advanced', movement: 4, movement_type: 'Cavalry', mount_type: 'Elephant' },
  { class_name: 'Forest Knight', tier: 'Advanced', movement: 4, movement_type: 'Cavalry', mount_type: 'Horse' },
  { class_name: 'Troubadour', tier: 'Advanced', movement: 4, movement_type: 'Cavalry', mount_type: 'Horse' },
  { class_name: 'Bau Lord', tier: 'Master', movement: 4, movement_type: 'Flier', mount_type: 'Bau' },
  { class_name: 'Bow Knight', tier: 'Master', movement: 4, movement_type: 'Cavalry', mount_type: 'Horse' },
  { class_name: 'Celestial Trooper', tier: 'Master', movement: 4, movement_type: 'Flier', mount_type: 'Pegasus' },
  { class_name: 'Great Knight', tier: 'Master', movement: 4, movement_type: 'Cavalry, Heavy Armor', mount_type: 'Horse' },
  { class_name: 'High Savant', tier: 'Master', movement: 4, movement_type: 'Cavalry', mount_type: 'Horse' },
  { class_name: 'Orichaldia', tier: 'Master', movement: 4, movement_type: 'Cavalry', mount_type: 'Ornius' },
  { class_name: 'Valkyrium', tier: 'Master', movement: 4, movement_type: 'Cavalry', mount_type: 'Horse' },
  { class_name: 'The Cavalier', tier: 'Divine', movement: 4, movement_type: 'Cavalry', mount_type: 'Horse' }
];

function slugify(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseStat(val) {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim();
  if (s === '' || s.toLowerCase() === 'unknown' || s === '-' || s === '--') return null;
  const num = parseInt(s, 10);
  return isNaN(num) ? null : num;
}

function parseGrowth(val) {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim();
  if (s === '' || s.toLowerCase() === 'unknown' || s === '-' || s === '--') return null;
  const num = parseFloat(s);
  if (isNaN(num)) return null;
  // If decimal between 0 and 1, convert to percentage integer (e.g. 0.15 -> 15)
  if (num > 0 && num <= 1) {
    return Math.round(num * 100);
  }
  return Math.round(num);
}

function parseAbilityBlock(rawStr) {
  if (!rawStr || typeof rawStr !== 'string') return null;
  const lines = rawStr.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const name = lines[0];
  let bond3 = null;
  let bond5 = null;
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('Bond 3:')) {
      bond3 = l.replace(/^Bond 3:\s*/, '').trim();
    } else if (l.startsWith('Bond 5:')) {
      bond5 = l.replace(/^Bond 5:\s*/, '').trim();
    }
  }
  return {
    name,
    bond_3: bond3,
    bond_5: bond5,
    full_text: rawStr
  };
}

const normalizedMounts = rawMountsData.map(m => {
  const parsedAbilities = m.abilities
    .map(parseAbilityBlock)
    .filter(Boolean);

  return {
    id: slugify(m.mount),
    name: m.mount,
    type: m.family,
    stat_hp: parseStat(m.added_hp),
    stat_str: parseStat(m.added_str),
    stat_def: parseStat(m.added_def),
    stat_mag: parseStat(m.added_mag),
    stat_res: parseStat(m.added_res),
    stat_dex: parseStat(m.added_dex),
    stat_spd: parseStat(m.added_spd),
    stat_lck: parseStat(m.added_lck),
    stat_bld: parseStat(m.added_bld),
    growth_hp: parseGrowth(m.growth_hp),
    growth_str: parseGrowth(m.growth_str),
    growth_def: parseGrowth(m.growth_def),
    growth_mag: parseGrowth(m.growth_mag),
    growth_res: parseGrowth(m.growth_res),
    growth_dex: parseGrowth(m.growth_dex),
    growth_spd: parseGrowth(m.growth_spd),
    growth_lck: parseGrowth(m.growth_lck),
    growth_bld: parseGrowth(m.growth_bld),
    abilities: parsedAbilities,
    obtain: m.obtain === 'Unknown' ? null : (m.obtain || null),
    notes: m.notes || null
  };
});

const normalizedMountedClasses = rawMountedClasses.map(mc => ({
  class_id: slugify(mc.class_name),
  class_name: mc.class_name,
  tier: mc.tier,
  movement_type: mc.movement_type,
  mount_type: mc.mount_type
}));

fs.writeFileSync('extractions/mounts.json', JSON.stringify(normalizedMounts, null, 2), 'utf-8');
console.log(`Generated extractions/mounts.json (${normalizedMounts.length} records)`);

fs.writeFileSync('extractions/mounted_classes.json', JSON.stringify(normalizedMountedClasses, null, 2), 'utf-8');
console.log(`Generated extractions/mounted_classes.json (${normalizedMountedClasses.length} records)`);
