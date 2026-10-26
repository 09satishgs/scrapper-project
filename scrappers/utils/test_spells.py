import sqlite3
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect('db_builders/fefw.sqlite')
cursor = conn.cursor()

print('=== GREEK SPELL IDS IN SPELLS TABLE ===')
cursor.execute("SELECT id, name, category, rank FROM spells WHERE id LIKE '%delta%' OR id LIKE '%theta%' OR id LIKE '%gamma%' OR id LIKE '%lambda%'")
for r in cursor.fetchall():
    print(f'  ID: {r[0]:<20} | Name: {r[1]:<15} | Category: {r[2]} ({r[3]})')

print('\n=== CHECKING FOR INVALID IDS IN CHARACTERS TABLE ===')
cursor.execute('SELECT id, name, spell_ids, combat_art_ids FROM characters')
rows = cursor.fetchall()

invalid_spells = 0
total_spells = 0
invalid_arts = 0
total_arts = 0

for cid, cname, s_json, a_json in rows:
    spells = json.loads(s_json) if s_json else []
    arts = json.loads(a_json) if a_json else []
    total_spells += len(spells)
    total_arts += len(arts)
    for s in spells:
        if 'object' in s or s == '':
            invalid_spells += 1
            print(f'  [FAIL] Invalid spell ID for {cid}: {s}')
    for a in arts:
        if 'object' in a or a == '':
            invalid_arts += 1
            print(f'  [FAIL] Invalid art ID for {cid}: {a}')

print(f'Total spell assignments: {total_spells}')
print(f'Invalid spell IDs:       {invalid_spells}')
print(f'Total combat art assignments: {total_arts}')
print(f'Invalid combat art IDs:       {invalid_arts}')

print('\n=== SAMPLE CHARACTER SPELLS & COMBAT ARTS ===')
for cid, cname, s_json, a_json in rows[:6]:
    spells = json.loads(s_json) if s_json else []
    arts = json.loads(a_json) if a_json else []
    print(f'{cname} ({cid}):')
    print(f'  Spells: {spells}')
    print(f'  Arts:   {arts}')

conn.close()
