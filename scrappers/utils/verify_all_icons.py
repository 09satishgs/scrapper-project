"""
verify_all_icons.py
Comprehensive auditor for all Fortune's Weave database image assets in assets/images/.
Verifies 100% presence, exact dimensions (64x64 for icons, 512x512 for portraits),
and RGBA color mode across characters, classes, weapons, spells, items, crests,
combat arts, and abilities.
"""

import os
import re
import sys
import json
import sqlite3
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')

DB_PATH = 'db_builders/fefw.sqlite'
ASSETS_DIR = 'assets/images'

def slugify(s):
    if not s:
        return ''
    return re.sub(r'[^a-z0-9]+', '_', str(s).replace('+', '_plus').lower()).strip('_')

def check_file(filename, expected_w, expected_h):
    path = os.path.join(ASSETS_DIR, filename)
    if not os.path.exists(path):
        return False, f"Missing file: {filename}"
    try:
        with Image.open(path) as img:
            if img.size != (expected_w, expected_h):
                return False, f"Bad size {img.size}, expected ({expected_w}, {expected_h}) for {filename}"
            if img.mode != 'RGBA':
                return False, f"Bad mode {img.mode}, expected RGBA for {filename}"
        return True, "OK"
    except Exception as e:
        return False, f"Corrupted file {filename}: {e}"

def main():
    print("====================================================")
    print("--- FULL ASSETS AUDIT & VERIFICATION ---")
    print("====================================================")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    total_expected = 0
    total_passed = 0
    failures = []

    # 1. Characters (portrait 512x512, icon 64x64)
    cursor.execute("SELECT id, name FROM characters")
    chars = cursor.fetchall()
    char_passed = 0
    for cid, cname in chars:
        total_expected += 2
        p_ok, p_msg = check_file(f"char__{cid}__portrait.png", 512, 512)
        i_ok, i_msg = check_file(f"char__{cid}__icon.png", 64, 64)
        if p_ok and i_ok:
            char_passed += 1
            total_passed += 2
        else:
            if not p_ok: failures.append(p_msg)
            if not i_ok: failures.append(i_msg)
    print(f"Characters (Portraits & Icons): {char_passed}/{len(chars)} passed ({char_passed * 2} files)")

    # 2. Classes (64x64)
    cursor.execute("SELECT id, name FROM classes")
    classes = cursor.fetchall()
    class_passed = 0
    for cid, cname in classes:
        total_expected += 1
        ok, msg = check_file(f"class__{cid}__icon.png", 64, 64)
        if ok:
            class_passed += 1
            total_passed += 1
        else:
            failures.append(msg)
    print(f"Classes: {class_passed}/{len(classes)} passed")

    # 3. Weapons (64x64)
    cursor.execute("SELECT id, name FROM weapons")
    weapons = cursor.fetchall()
    weap_passed = 0
    for wid, wname in weapons:
        total_expected += 1
        ok, msg = check_file(f"weapon__{wid}__icon.png", 64, 64)
        if ok:
            weap_passed += 1
            total_passed += 1
        else:
            failures.append(msg)
    print(f"Weapons: {weap_passed}/{len(weapons)} passed")

    # 4. Spells (64x64)
    cursor.execute("SELECT id, name FROM spells")
    spells = cursor.fetchall()
    spell_passed = 0
    for sid, sname in spells:
        total_expected += 1
        ok, msg = check_file(f"spell__{sid}__icon.png", 64, 64)
        if ok:
            spell_passed += 1
            total_passed += 1
        else:
            failures.append(msg)
    print(f"Spells: {spell_passed}/{len(spells)} passed")

    # 5. Items (64x64)
    cursor.execute("SELECT id, name FROM items")
    items = cursor.fetchall()
    item_passed = 0
    for iid, iname in items:
        total_expected += 1
        ok, msg = check_file(f"item__{iid}__icon.png", 64, 64)
        if ok:
            item_passed += 1
            total_passed += 1
        else:
            failures.append(msg)
    print(f"Items: {item_passed}/{len(items)} passed")

    # 6. Crests (64x64)
    cursor.execute("SELECT DISTINCT crest FROM characters WHERE crest IS NOT NULL AND crest != ''")
    c1 = cursor.fetchall()
    cursor.execute("SELECT DISTINCT crest FROM abilities WHERE crest IS NOT NULL AND crest != ''")
    c2 = cursor.fetchall()
    all_crests = set()
    for row in c1 + c2:
        for c in row[0].split(','):
            c = c.strip()
            if c: all_crests.add(c)
    crest_passed = 0
    for cname in all_crests:
        c_slug = slugify(cname)
        total_expected += 1
        ok, msg = check_file(f"crest__{c_slug}__icon.png", 64, 64)
        if ok:
            crest_passed += 1
            total_passed += 1
        else:
            failures.append(msg)
    print(f"Crests: {crest_passed}/{len(all_crests)} passed")

    # 7. Combat Arts (64x64)
    cursor.execute("SELECT id, name FROM combat_arts")
    arts = cursor.fetchall()
    art_passed = 0
    for aid, aname in arts:
        total_expected += 1
        ok, msg = check_file(f"art__{aid}__icon.png", 64, 64)
        if ok:
            art_passed += 1
            total_passed += 1
        else:
            failures.append(msg)
    print(f"Combat Arts: {art_passed}/{len(arts)} passed")

    # 8. Abilities (64x64)
    cursor.execute("SELECT id, name FROM abilities")
    abilities = cursor.fetchall()
    ab_passed = 0
    for ab_id, ab_name in abilities:
        total_expected += 1
        ok, msg = check_file(f"ability__{ab_id}__icon.png", 64, 64)
        if ok:
            ab_passed += 1
            total_passed += 1
        else:
            failures.append(msg)
    print(f"Abilities: {ab_passed}/{len(abilities)} passed")

    print("\n----------------------------------------------------")
    print(f"Total Database Entities Checked: {total_expected}")
    print(f"Total Passing Image Files:        {total_passed}")
    pass_pct = (total_passed / total_expected * 100) if total_expected > 0 else 0
    print(f"Success Rate:                     {pass_pct:.2f}%")
    if failures:
        print(f"Failures ({len(failures)}):")
        for f in failures[:10]:
            print("  -", f)
    else:
        print("ALL IMAGES VERIFIED PERFECTLY! ZERO ERRORS OR MISSING FILES.")
    print("----------------------------------------------------")

if __name__ == '__main__':
    main()
