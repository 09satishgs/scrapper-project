"""
misc_icon_scraper.py
Fetches, maps, and standardizes 64x64 RGBA icons for:
- Classes (class__{id}__icon.png)
- Items (item__{id}__icon.png)
- Weapons (weapon__{id}__icon.png)
- Spells (spell__{id}__icon.png)
- Crests (crest__{id}__icon.png)
- Abilities (ability__{id}__icon.png)
- Combat Arts (art__{id}__icon.png)

Sources images from fireemblemwiki.org (Fortune's Weave and Three Houses assets).
Adds transparent padding to standardize everything on a crisp 64x64 RGBA canvas.
"""

import os
import re
import sys
import json
import sqlite3
import hashlib
import requests
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding='utf-8')

ASSETS_DIR = 'assets/images'
CACHE_DIR = 'raw_extracts/misc_icons'
DB_PATH = 'db_builders/fefw.sqlite'
FW_FILES_PATH = 'raw_extracts/fw_wiki_files.json'
FE16_FILES_PATH = 'raw_extracts/fe16_wiki_files.json'
CREST_FILES_PATH = 'raw_extracts/crest_wiki_files.json'

os.makedirs(ASSETS_DIR, exist_ok=True)
os.makedirs(CACHE_DIR, exist_ok=True)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

def slugify(s):
    if not s:
        return ''
    return re.sub(r'[^a-z0-9]+', '_', str(s).replace('+', '_plus').lower()).strip('_')

def standardize_image(img, target_box=54, canvas_size=64):
    """
    Fits image proportionally within target_box (e.g. 54x54),
    then centers it on a transparent canvas_size x canvas_size RGBA image.
    Provides ~5px transparent padding around edges.
    """
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # Trim empty transparent borders if present to maximize sprite visibility
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
        
    orig_w, orig_h = img.size
    if orig_w == 0 or orig_h == 0:
        return Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    
    scale = min(target_box / orig_w, target_box / orig_h)
    new_w = max(1, int(round(orig_w * scale)))
    new_h = max(1, int(round(orig_h * scale)))
    
    resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    canvas = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    offset_x = (canvas_size - new_w) // 2
    offset_y = (canvas_size - new_h) // 2
    canvas.paste(resized, (offset_x, offset_y), resized)
    return canvas

def download_image(url):
    """Downloads an image with caching based on md5 of url."""
    if not url:
        return None
    url_hash = hashlib.md5(url.encode('utf-8')).hexdigest()
    cache_path = os.path.join(CACHE_DIR, f"{url_hash}.png")
    
    if os.path.exists(cache_path):
        try:
            return Image.open(cache_path).copy()
        except Exception:
            pass
            
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code == 200:
            img = Image.open(BytesIO(r.content))
            img.save(cache_path)
            return img.copy()
        else:
            print(f"Failed to fetch {url}: HTTP {r.status_code}")
    except Exception as e:
        print(f"Error fetching {url}: {e}")
    return None

def main():
    print("====================================================")
    print("--- STARTING MISC ICON SCRAPER & GENERATOR ---")
    print("====================================================")

    # 1. Load wiki mappings
    fw_files = json.load(open(FW_FILES_PATH, encoding='utf-8'))
    fe16_files = json.load(open(FE16_FILES_PATH, encoding='utf-8'))
    crest_files = json.load(open(CREST_FILES_PATH, encoding='utf-8'))

    # Build clean lookup maps
    # normalize key: remove "File:", "Is fe18 ", "Is fe16 ", ".png", lowercase, slugify
    def make_clean_key(title):
        t = title.replace('File:', '').replace('.png', '').strip()
        t = re.sub(r'^(Is fe18|Is fe16|FE18Rank|FE16Rank|FETH_Crest_of_|FETH_)\s*', '', t, flags=re.IGNORECASE)
        return slugify(t)

    fw_by_key = {make_clean_key(k): v for k, v in fw_files.items()}
    fe16_by_key = {make_clean_key(k): v for k, v in fe16_files.items()}

    # Connect to SQLite DB to ensure exact ID alignment
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Preload common key sprites
    print("[Preloading] Core FE18 and FE16 weapon and rank sprites...")
    rank_sprites = {}
    for key, title in [
        ('sword', 'File:FE18RankSword.png'),
        ('sword_gold', 'File:FE18RankSwordGold.png'),
        ('sword_purple', 'File:FE18RankSwordPurple.png'),
        ('spear', 'File:FE18RankSpear.png'),
        ('spear_gold', 'File:FE18RankSpearGold.png'),
        ('axe', 'File:FE18RankAxe.png'),
        ('axe_gold', 'File:FE18RankAxeGold.png'),
        ('axe_purple', 'File:FE18RankAxePurple.png'),
        ('bow', 'File:FE18RankBow.png'),
        ('bow_gold', 'File:FE18RankBowGold.png'),
        ('bow_purple', 'File:FE18RankBowPurple.png'),
        ('gauntlets', 'File:FE18RankGauntlets.png'),
        ('gauntlets_gold', 'File:FE18RankGauntletsGold.png'),
        ('black_magic', 'File:FE18RankBlackMagic.png'),
        ('black_magic_gold', 'File:FE18RankBlackMagicGold.png'),
        ('black_magic_purple', 'File:FE18RankBlackMagicPurple.png'),
        ('white_magic', 'File:FE18RankWhiteMagic.png'),
        ('white_magic_gold', 'File:FE18RankWhiteMagicGold.png'),
        ('white_magic_purple', 'File:FE18RankWhiteMagicPurple.png'),
        ('infantry', 'File:FE18RankInfantry.png'),
        ('infantry_gold', 'File:FE18RankInfantryGold.png'),
        ('cavalry', 'File:FE18RankRiding.png'),
        ('cavalry_gold', 'File:FE18RankRidingGold.png'),
        ('cavalry_purple', 'File:FE18RankRidingPurple.png'),
        ('heavy_armor', 'File:FE18RankHeavyArmor.png'),
        ('heavy_armor_gold', 'File:FE18RankHeavyArmorGold.png'),
        ('heavy_armor_purple', 'File:FE18RankHeavyArmorPurple.png'),
        ('flying', 'File:FE18RankFlying.png'),
        ('flying_gold', 'File:FE18RankFlyingGold.png'),
        ('flying_purple', 'File:FE18RankFlyingPurple.png'),
        ('authority', 'File:FE18RankAuthority.png'),
        ('authority_gold', 'File:FE18RankAuthorityGold.png'),
    ]:
        if title in fw_files:
            rank_sprites[key] = download_image(fw_files[title])

    # Category base sprites
    cat_sprites = {}
    for key, title in [
        ('sword_item', 'File:Is fe18 sword.png'),
        ('sword_item_purple', 'File:Is fe18 sword purple.png'),
        ('spear_item', 'File:Is fe18 spear.png'),
        ('axe_item', 'File:Is fe18 axe.png'),
        ('bow_item', 'File:Is fe18 bow.png'),
        ('gauntlet_item', 'File:Is fe18 gauntlets.png'),
        ('shield_item', 'File:Is fe18 shield.png'),
        ('black_magic_item', 'File:Is fe18 black magic.png'),
        ('white_magic_item', 'File:Is fe18 white magic.png'),
        ('vulnerary', 'File:Is fe18 vulnerary.png'),
        ('antitoxin', 'File:Is fe18 antitoxin.png'),
        ('fish', 'File:Is fe18 fish.png'),
        ('meat', 'File:Is fe18 meat.png'),
        ('meat_rare', 'File:Is fe18 meat rare.png'),
        ('plant', 'File:Is fe18 plant.png'),
        ('plant_rare', 'File:Is fe18 plant rare.png'),
        ('ore', 'File:Is fe18 ore.png'),
        ('ring', 'File:Is fe18 ring.png'),
        ('gift', 'File:Is fe18 gift.png'),
        ('red_jewel', 'File:Is fe18 red jewel.png'),
        ('dark_red_jewel', 'File:Is fe18 dark red jewel.png'),
        ('dark_obsidian', 'File:Is fe18 dark obsidian.png'),
        ('combat_art_sword', 'File:Is fe18 combat art sword.png'),
        ('combat_art_spear', 'File:Is fe18 combat art spear.png'),
        ('combat_art_axe', 'File:Is fe18 combat art axe.png'),
        ('combat_art_bow', 'File:Is fe18 combat art bow.png'),
        ('combat_art_gauntlets', 'File:Is fe18 combat art gauntlets.png'),
        ('combat_art_assist', 'File:Is fe18 combat art assist.png'),
        ('blaze_underworld', 'File:Is fe18 blaze art underworld.png'),
        ('blaze_automaton', 'File:Is fe18 blaze art automaton.png'),
        ('blaze_wells', 'File:Is fe18 blaze art celestial wells.png'),
        ('ability_general', 'File:Is fe18 general.png'),
    ]:
        if title in fw_files:
            cat_sprites[key] = download_image(fw_files[title])

    # -------------------------------------------------------------------------
    # 1. Crests (crest__{id}__icon.png)
    # -------------------------------------------------------------------------
    print("\n--- Processing Crests ---")
    cursor.execute("SELECT DISTINCT crest FROM characters WHERE crest IS NOT NULL AND crest != ''")
    c1 = cursor.fetchall()
    cursor.execute("SELECT DISTINCT crest FROM abilities WHERE crest IS NOT NULL AND crest != ''")
    c2 = cursor.fetchall()
    all_crests = set()
    for row in c1 + c2:
        for c in row[0].split(','):
            c = c.strip()
            if c:
                all_crests.add(c)

    crest_count = 0
    for crest_name in sorted(all_crests):
        c_slug = slugify(crest_name)
        out_name = f"crest__{c_slug}__icon.png"
        out_path = os.path.join(ASSETS_DIR, out_name)
        
        # Check crest_files
        img = None
        # Try direct match in crest_files
        if crest_name in crest_files:
            img = download_image(crest_files[crest_name])
        elif crest_name.replace('Diadem of the ', '').replace('Diadem of ', '') in crest_files:
            img = download_image(crest_files[crest_name.replace('Diadem of the ', '').replace('Diadem of ', '')])
            
        # Try fw_files for diadem sprites
        if not img:
            fw_title = f"File:Is fe18 {crest_name.lower()}.png"
            if fw_title in fw_files:
                img = download_image(fw_files[fw_title])
                
        # Try fe16 crests
        if not img:
            fe16_key = f"crest_of_{c_slug}"
            if fe16_key in fe16_by_key:
                img = download_image(fe16_by_key[fe16_key])

        # If found, standardize and save
        if img:
            std = standardize_image(img, target_box=54, canvas_size=64)
            std.save(out_path, format="PNG")
            crest_count += 1
            print(f"  [Crest] {crest_name} -> {out_name} (Wiki Match)")
        else:
            # Fallback high quality stylized crest seal
            canvas = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
            draw = ImageDraw.Draw(canvas)
            draw.ellipse([6, 6, 57, 57], outline=(218, 165, 32, 230), width=3)
            draw.ellipse([12, 12, 51, 51], outline=(184, 134, 11, 180), width=1)
            draw.text((24, 20), crest_name[0].upper(), fill=(255, 215, 0, 240))
            canvas.save(out_path, format="PNG")
            crest_count += 1
            print(f"  [Crest] {crest_name} -> {out_name} (Stylized Crest Seal)")

    print(f"Done processing {crest_count} crests.")

    # -------------------------------------------------------------------------
    # 2. Classes (class__{id}__icon.png)
    # -------------------------------------------------------------------------
    print("\n--- Processing Classes ---")
    cursor.execute("SELECT id, name, tier, type, usable_weapons FROM classes")
    classes_rows = cursor.fetchall()
    class_count = 0
    for cid, cname, ctier, ctype, cweaps_json in classes_rows:
        out_name = f"class__{cid}__icon.png"
        out_path = os.path.join(ASSETS_DIR, out_name)
        weaps = json.loads(cweaps_json) if cweaps_json else []

        img = None
        # Check if direct class icon exists in fw_files or fe16_files
        clean_cname = slugify(cname)
        if clean_cname in fw_by_key:
            img = download_image(fw_by_key[clean_cname])
        elif clean_cname in fe16_by_key:
            img = download_image(fe16_by_key[clean_cname])
            
        if not img:
            # Select appropriate FE18 rank icon based on tier and weapon
            primary_weap = weaps[0].lower() if weaps else 'infantry'
            if 'magic' in primary_weap:
                w_key = 'black_magic' if 'black' in primary_weap else 'white_magic'
            elif 'sword' in primary_weap:
                w_key = 'sword'
            elif 'spear' in primary_weap or 'lance' in primary_weap:
                w_key = 'spear'
            elif 'axe' in primary_weap:
                w_key = 'axe'
            elif 'bow' in primary_weap:
                w_key = 'bow'
            elif 'gauntlet' in primary_weap:
                w_key = 'gauntlets'
            else:
                w_key = 'cavalry' if 'cavalry' in (ctype or '').lower() else 'infantry'

            # Tier-based palette
            if ctier == 'Divine':
                img = rank_sprites.get(f"{w_key}_purple") or rank_sprites.get(f"{w_key}_gold") or rank_sprites.get(w_key)
            elif ctier == 'Master':
                img = rank_sprites.get(f"{w_key}_gold") or rank_sprites.get(w_key)
            elif ctier == 'Advanced':
                img = rank_sprites.get(f"{w_key}_purple") or rank_sprites.get(w_key)
            else:
                img = rank_sprites.get(w_key)

        if not img:
            img = rank_sprites.get('infantry')

        std = standardize_image(img, target_box=54, canvas_size=64)
        std.save(out_path, format="PNG")
        class_count += 1
        print(f"  [Class] {cname} ({ctier}) -> {out_name}")

    print(f"Done processing {class_count} classes.")

    # -------------------------------------------------------------------------
    # 3. Weapons (weapon__{id}__icon.png)
    # -------------------------------------------------------------------------
    print("\n--- Processing Weapons ---")
    cursor.execute("SELECT id, name, category, rank FROM weapons")
    weapon_rows = cursor.fetchall()
    weapon_count = 0
    for wid, wname, wcat, wrank in weapon_rows:
        out_name = f"weapon__{wid}__icon.png"
        out_path = os.path.join(ASSETS_DIR, out_name)
        w_slug = slugify(wname)

        img = None
        # Try direct match in FW or FE16
        if w_slug in fw_by_key:
            img = download_image(fw_by_key[w_slug])
        elif w_slug in fe16_by_key:
            img = download_image(fe16_by_key[w_slug])

        if not img:
            cat_l = (wcat or '').lower()
            if 'sword' in cat_l:
                img = cat_sprites.get('sword_item_purple') if wrank in ['A', 'S'] else cat_sprites.get('sword_item')
            elif 'spear' in cat_l or 'lance' in cat_l:
                img = cat_sprites.get('spear_item')
            elif 'axe' in cat_l:
                img = cat_sprites.get('axe_item')
            elif 'bow' in cat_l:
                img = cat_sprites.get('bow_item')
            elif 'gauntlet' in cat_l:
                img = cat_sprites.get('gauntlet_item')
            elif 'shield' in cat_l:
                img = cat_sprites.get('shield_item')

        if not img:
            img = cat_sprites.get('sword_item')

        std = standardize_image(img, target_box=54, canvas_size=64)
        std.save(out_path, format="PNG")
        weapon_count += 1
        print(f"  [Weapon] {wname} ({wcat}) -> {out_name}")

    print(f"Done processing {weapon_count} weapons.")

    # -------------------------------------------------------------------------
    # 4. Spells (spell__{id}__icon.png)
    # -------------------------------------------------------------------------
    print("\n--- Processing Spells ---")
    cursor.execute("SELECT id, name, category, rank FROM spells")
    spell_rows = cursor.fetchall()
    spell_count = 0
    for sid, sname, scat, srank in spell_rows:
        out_name = f"spell__{sid}__icon.png"
        out_path = os.path.join(ASSETS_DIR, out_name)
        s_slug = slugify(sname)

        img = None
        if s_slug in fw_by_key:
            img = download_image(fw_by_key[s_slug])
        elif s_slug in fe16_by_key:
            img = download_image(fe16_by_key[s_slug])

        if not img:
            scat_l = (scat or '').lower()
            if 'black' in scat_l:
                img = cat_sprites.get('black_magic_item') or rank_sprites.get('black_magic')
            else:
                img = cat_sprites.get('white_magic_item') or rank_sprites.get('white_magic')

        std = standardize_image(img, target_box=54, canvas_size=64)
        std.save(out_path, format="PNG")
        spell_count += 1
        print(f"  [Spell] {sname} ({scat}) -> {out_name}")

    print(f"Done processing {spell_count} spells.")

    # -------------------------------------------------------------------------
    # 5. Items (item__{id}__icon.png)
    # -------------------------------------------------------------------------
    print("\n--- Processing Items ---")
    cursor.execute("SELECT id, name, category FROM items")
    item_rows = cursor.fetchall()
    item_count = 0
    for iid, iname, icat in item_rows:
        out_name = f"item__{iid}__icon.png"
        out_path = os.path.join(ASSETS_DIR, out_name)
        i_slug = slugify(iname)

        img = None
        if i_slug in fw_by_key:
            img = download_image(fw_by_key[i_slug])
        elif i_slug in fe16_by_key:
            img = download_image(fe16_by_key[i_slug])

        if not img:
            icat_l = (icat or '').lower()
            if 'consumable' in icat_l:
                if 'antitoxin' in iname.lower():
                    img = cat_sprites.get('antitoxin')
                else:
                    img = cat_sprites.get('vulnerary')
            elif 'fish' in icat_l:
                img = cat_sprites.get('fish')
            elif 'meat' in icat_l:
                img = cat_sprites.get('meat_rare') if 'rare' in iname.lower() or 'bull' in iname.lower() else cat_sprites.get('meat')
            elif 'vegetable' in icat_l or 'plant' in icat_l:
                img = cat_sprites.get('plant_rare') if 'rare' in iname.lower() or 'special' in iname.lower() else cat_sprites.get('plant')
            elif 'ore' in icat_l:
                if 'obsidian' in iname.lower() or 'dark' in iname.lower():
                    img = cat_sprites.get('dark_obsidian')
                elif 'red' in iname.lower() or 'ruby' in iname.lower():
                    img = cat_sprites.get('red_jewel')
                else:
                    img = cat_sprites.get('ore')
            elif 'gift' in icat_l:
                img = cat_sprites.get('gift')
            elif 'equipment' in icat_l:
                if 'shield' in iname.lower():
                    img = cat_sprites.get('shield_item')
                elif 'ring' in iname.lower():
                    img = cat_sprites.get('ring')
                else:
                    img = cat_sprites.get('red_jewel')
            elif 'exam' in icat_l or 'license' in icat_l or 'seal' in iname.lower():
                img = rank_sprites.get('authority_gold') or rank_sprites.get('authority')
            else:
                img = cat_sprites.get('gift')

        if not img:
            img = cat_sprites.get('gift')

        std = standardize_image(img, target_box=54, canvas_size=64)
        std.save(out_path, format="PNG")
        item_count += 1
        if item_count <= 20 or item_count % 50 == 0:
            print(f"  [Item {item_count}/{len(item_rows)}] {iname} ({icat}) -> {out_name}")

    print(f"Done processing {item_count} items.")

    # -------------------------------------------------------------------------
    # 6. Combat Arts (art__{id}__icon.png)
    # -------------------------------------------------------------------------
    print("\n--- Processing Combat Arts ---")
    cursor.execute("SELECT id, name, art_type, weapon_type FROM combat_arts")
    art_rows = cursor.fetchall()
    art_count = 0
    for aid, aname, atype, wtype in art_rows:
        out_name = f"art__{aid}__icon.png"
        out_path = os.path.join(ASSETS_DIR, out_name)
        a_slug = slugify(aname)

        img = None
        if a_slug in fw_by_key:
            img = download_image(fw_by_key[a_slug])
        elif a_slug in fe16_by_key:
            img = download_image(fe16_by_key[a_slug])

        if not img:
            if atype == 'Blaze Art':
                if 'wells' in aname.lower() or 'celestial' in aname.lower():
                    img = cat_sprites.get('blaze_wells')
                elif 'automaton' in aname.lower() or 'construct' in aname.lower():
                    img = cat_sprites.get('blaze_automaton')
                else:
                    img = cat_sprites.get('blaze_underworld')
            else:
                wt_l = (wtype or '').lower()
                if 'sword' in wt_l:
                    img = cat_sprites.get('combat_art_sword')
                elif 'spear' in wt_l or 'lance' in wt_l:
                    img = cat_sprites.get('combat_art_spear')
                elif 'axe' in wt_l:
                    img = cat_sprites.get('combat_art_axe')
                elif 'bow' in wt_l:
                    img = cat_sprites.get('combat_art_bow')
                elif 'gauntlet' in wt_l:
                    img = cat_sprites.get('combat_art_gauntlets')
                else:
                    img = cat_sprites.get('combat_art_assist')

        if not img:
            img = cat_sprites.get('combat_art_sword')

        std = standardize_image(img, target_box=54, canvas_size=64)
        std.save(out_path, format="PNG")
        art_count += 1
        if art_count <= 20 or art_count % 40 == 0:
            print(f"  [Combat Art {art_count}/{len(art_rows)}] {aname} ({atype}) -> {out_name}")

    print(f"Done processing {art_count} combat arts.")

    # -------------------------------------------------------------------------
    # 7. Abilities (ability__{id}__icon.png)
    # -------------------------------------------------------------------------
    print("\n--- Processing Abilities ---")
    cursor.execute("SELECT id, name, category, crest FROM abilities")
    ability_rows = cursor.fetchall()
    ability_count = 0
    for ab_id, ab_name, ab_cat, ab_crest in ability_rows:
        out_name = f"ability__{ab_id}__icon.png"
        out_path = os.path.join(ASSETS_DIR, out_name)
        ab_slug = slugify(ab_name)

        img = None
        # Check direct wiki match
        if ab_slug in fw_by_key:
            img = download_image(fw_by_key[ab_slug])
        elif ab_slug in fe16_by_key:
            img = download_image(fe16_by_key[ab_slug])

        # If it's a crest/bloodmark ability, try crest icon
        if not img and ab_crest:
            c_slug = slugify(ab_crest)
            crest_icon_path = os.path.join(ASSETS_DIR, f"crest__{c_slug}__icon.png")
            if os.path.exists(crest_icon_path):
                img = Image.open(crest_icon_path)

        if not img:
            # Match by skill pattern (prowess, faire, blow, mastery, stance, etc.)
            ab_l = ab_name.lower()
            if 'sword' in ab_l:
                img = rank_sprites.get('sword')
            elif 'spear' in ab_l or 'lance' in ab_l:
                img = rank_sprites.get('spear')
            elif 'axe' in ab_l:
                img = rank_sprites.get('axe')
            elif 'bow' in ab_l:
                img = rank_sprites.get('bow')
            elif 'brawl' in ab_l or 'fist' in ab_l or 'gauntlet' in ab_l:
                img = rank_sprites.get('gauntlets')
            elif 'black magic' in ab_l or 'reason' in ab_l:
                img = rank_sprites.get('black_magic')
            elif 'white magic' in ab_l or 'faith' in ab_l:
                img = rank_sprites.get('white_magic')
            elif 'armor' in ab_l:
                img = rank_sprites.get('heavy_armor')
            elif 'riding' in ab_l or 'cavalry' in ab_l or 'steed' in ab_l:
                img = rank_sprites.get('cavalry')
            elif 'flying' in ab_l or 'flight' in ab_l or 'wing' in ab_l:
                img = rank_sprites.get('flying')
            elif 'authority' in ab_l or 'leader' in ab_l:
                img = rank_sprites.get('authority')
            elif ab_cat == 'Personal':
                img = cat_sprites.get('blaze_underworld') or cat_sprites.get('ability_general')
            elif ab_cat == 'Bloodmark':
                img = cat_sprites.get('dark_red_jewel')
            else:
                img = cat_sprites.get('ability_general')

        if not img:
            img = cat_sprites.get('ability_general')

        std = standardize_image(img, target_box=54, canvas_size=64)
        std.save(out_path, format="PNG")
        ability_count += 1
        if ability_count <= 20 or ability_count % 80 == 0:
            print(f"  [Ability {ability_count}/{len(ability_rows)}] {ab_name} ({ab_cat}) -> {out_name}")

    print(f"Done processing {ability_count} abilities.")

    print("\n====================================================")
    print("--- ALL ICONS GENERATED & STANDARDIZED SUCCESSFULLY! ---")
    print(f"  Crests:       {crest_count}")
    print(f"  Classes:      {class_count}")
    print(f"  Weapons:      {weapon_count}")
    print(f"  Spells:       {spell_count}")
    print(f"  Items:        {item_count}")
    print(f"  Combat Arts:  {art_count}")
    print(f"  Abilities:    {ability_count}")
    print(f"  Total icons:  {crest_count + class_count + weapon_count + spell_count + item_count + art_count + ability_count}")
    print("====================================================")

if __name__ == '__main__':
    main()
