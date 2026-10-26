"""
Fire Emblem: Fortune's Weave - Character Image Scraper & Standardizer
Fetches character portraits from https://fireemblemwiki.org via MediaWiki API,
standardizes dimensions with transparent padding, and saves them to assets/images/.

Output Naming Convention (dynamically derivable from characters.id):
  - assets/images/char__{id}__portrait.png (512x512 RGBA canvas)
  - assets/images/char__{id}__icon.png     (64x64 RGBA canvas)
"""

import os
import sys
import json
import urllib.request
import urllib.parse
from PIL import Image, ImageDraw, ImageFont

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

CHARACTERS_JSON_PATH = 'extractions/characters.json'
RAW_CACHE_DIR = 'raw_extracts/character_images'
OUTPUT_DIR = 'assets/images'

PORTRAIT_SIZE = (512, 512)
PORTRAIT_BOX = (472, 472)  # ~5% transparent margin (20px on each side)

ICON_SIZE = (64, 64)
ICON_BOX = (56, 56)        # 4px padding on each side

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) FEFW-PWA-Scraper/1.0'}

def slugify(text):
    if not text:
        return ''
    return text.lower().strip().replace('+', '_plus').replace(' ', '_').replace("'", '_')

def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

def download_file(url, target_path):
    if os.path.exists(target_path) and os.path.getsize(target_path) > 0:
        return target_path
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as resp:
        with open(target_path, 'wb') as f:
            f.write(resp.read())
    return target_path

def get_all_wiki_fefw_images():
    """Queries all FEFW images from Fire Emblem Wiki."""
    all_images = {}
    aicontinue = ''
    while True:
        url = 'https://fireemblemwiki.org/w/api.php?action=query&list=allimages&aiprefix=FEFW&ailimit=500&format=json'
        if aicontinue:
            url += f'&aicontinue={aicontinue}'
        data = fetch_json(url)
        for img in data['query']['allimages']:
            all_images[img['name'].lower()] = img['url']
        if 'continue' in data:
            aicontinue = data['continue']['aicontinue']
        else:
            break
    return all_images

def create_silhouette_portrait(name, slug):
    """Generates a clean, standardized Fire Emblem unit silhouette placeholder with monogram."""
    img = Image.new('RGBA', PORTRAIT_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Stylized crest / shield outline
    cx, cy = 256, 256
    badge_color = (45, 55, 72, 220)      # Slate dark
    border_color = (212, 175, 55, 230)    # Gold
    shadow_color = (20, 25, 35, 120)

    # Shield polygon
    shield_pts = [
        (120, 100), (392, 100),
        (392, 300), (256, 420),
        (120, 300)
    ]
    draw.polygon(shield_pts, fill=badge_color, outline=border_color, width=6)

    # Unit head silhouette inside shield
    # Head circle
    draw.ellipse([216, 140, 296, 220], fill=(220, 225, 230, 240))
    # Shoulders / bust
    draw.pieslice([166, 230, 346, 370], start=180, end=360, fill=(220, 225, 230, 240))

    # Initial letter
    initial = name[0].upper() if name else '?'
    try:
        font = ImageFont.truetype('arial.ttf', 44)
    except:
        font = ImageFont.load_default()

    draw.text((256, 330), initial, fill=(212, 175, 55, 255), anchor='mm', font=font)
    return img

def create_silhouette_icon(name, slug):
    """Generates a clean 64x64 icon placeholder matching unit silhouette."""
    img = Image.new('RGBA', ICON_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    badge_color = (45, 55, 72, 230)
    border_color = (212, 175, 55, 255)

    # Circular badge
    draw.ellipse([4, 4, 59, 59], fill=badge_color, outline=border_color, width=2)

    # Initial letter
    initial = name[0].upper() if name else '?'
    try:
        font = ImageFont.truetype('arial.ttf', 26)
    except:
        font = ImageFont.load_default()

    draw.text((32, 32), initial, fill=(255, 255, 255, 255), anchor='mm', font=font)
    return img

def process_character_images(src_img_path, char_id, char_name):
    """Standardizes character art into 512x512 portrait and 64x64 icon."""
    portrait_dest = os.path.join(OUTPUT_DIR, f'char__{char_id}__portrait.png')
    icon_dest = os.path.join(OUTPUT_DIR, f'char__{char_id}__icon.png')

    if src_img_path and os.path.exists(src_img_path):
        try:
            with Image.open(src_img_path) as raw:
                raw_rgba = raw.convert('RGBA')

                # 1. Generate 512x512 Portrait with ~5% transparent margin
                # Calculate scale factor to fit within PORTRAIT_BOX (472x472)
                w, h = raw_rgba.size
                scale = min(PORTRAIT_BOX[0] / w, PORTRAIT_BOX[1] / h)
                new_w = max(1, int(w * scale))
                new_h = max(1, int(h * scale))

                resized = raw_rgba.resize((new_w, new_h), Image.Resampling.LANCZOS)

                portrait_canvas = Image.new('RGBA', PORTRAIT_SIZE, (0, 0, 0, 0))
                # Center horizontally, anchor near bottom/center
                offset_x = (PORTRAIT_SIZE[0] - new_w) // 2
                offset_y = (PORTRAIT_SIZE[1] - new_h) // 2
                portrait_canvas.paste(resized, (offset_x, offset_y), resized)
                portrait_canvas.save(portrait_dest, 'PNG', optimize=True)

                # 2. Generate 64x64 Icon with focused bust/head crop
                # For character portraits, the head/face is typically in the top 50-65%
                crop_top = 0
                crop_bottom = int(h * 0.65) if h > w else h
                crop_left = 0
                crop_right = w

                # If portrait is very tall, focus upper square
                crop_height = crop_bottom - crop_top
                if crop_height > w:
                    crop_bottom = crop_top + w
                elif w > crop_height:
                    mid_x = w // 2
                    half_w = crop_height // 2
                    crop_left = max(0, mid_x - half_w)
                    crop_right = min(w, mid_x + half_w)

                head_crop = raw_rgba.crop((crop_left, crop_top, crop_right, crop_bottom))

                # Scale head crop to fit within ICON_BOX (56x56)
                hc_w, hc_h = head_crop.size
                icon_scale = min(ICON_BOX[0] / hc_w, ICON_BOX[1] / hc_h)
                new_ic_w = max(1, int(hc_w * icon_scale))
                new_ic_h = max(1, int(hc_h * icon_scale))

                resized_icon = head_crop.resize((new_ic_w, new_ic_h), Image.Resampling.LANCZOS)

                icon_canvas = Image.new('RGBA', ICON_SIZE, (0, 0, 0, 0))
                ic_offset_x = (ICON_SIZE[0] - new_ic_w) // 2
                ic_offset_y = (ICON_SIZE[1] - new_ic_h) // 2
                icon_canvas.paste(resized_icon, (ic_offset_x, ic_offset_y), resized_icon)
                icon_canvas.save(icon_dest, 'PNG', optimize=True)
                return True
        except Exception as e:
            print(f'  [Error processing {char_id}] {e}')

    # Fallback: Generate stylized placeholder
    p_img = create_silhouette_portrait(char_name, char_id)
    p_img.save(portrait_dest, 'PNG', optimize=True)

    ic_img = create_silhouette_icon(char_name, char_id)
    ic_img.save(icon_dest, 'PNG', optimize=True)
    return False

def main():
    print('====================================================')
    print('--- CHARACTER IMAGE SCRAPER & STANDARDIZER ---')
    print('====================================================')
    os.makedirs(RAW_CACHE_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    with open(CHARACTERS_JSON_PATH, 'r', encoding='utf-8') as f:
        characters = json.load(f)

    print(f'[Input] Loaded {len(characters)} characters from {CHARACTERS_JSON_PATH}')
    print('[Wiki] Querying all Fortune\'s Weave images from fireemblemwiki.org...')
    wiki_images = get_all_wiki_fefw_images()
    print(f'[Wiki] Found {len(wiki_images)} FEFW image assets on wiki.')

    # Special case additions (e.g. Seteth from Three Houses artwork on wiki)
    special_overrides = {
        'seteth': 'https://cdn.fireemblemwiki.org/5/5e/FETH_Seteth.png'
    }

    success_count = 0
    fallback_count = 0

    for c in characters:
        c_id = c['slug']
        c_name = c['name']
        name_clean = c_name.replace(' ', '_').lower()

        # Find best matching image on wiki
        matched_url = None

        if c_id in special_overrides:
            matched_url = special_overrides[c_id]
        else:
            # 1. Check portrait.png
            portrait_key = f'fefw_{name_clean}_portrait.png'
            full_key = f'fefw_{name_clean}.png'

            if portrait_key in wiki_images:
                matched_url = wiki_images[portrait_key]
            elif full_key in wiki_images:
                matched_url = wiki_images[full_key]
            else:
                # Fuzzy check
                for k, u in wiki_images.items():
                    if name_clean in k and ('portrait' in k or k.endswith('.png')):
                        matched_url = u
                        break

        raw_path = None
        if matched_url:
            ext = os.path.splitext(urllib.parse.urlparse(matched_url).path)[1] or '.png'
            cache_file = os.path.join(RAW_CACHE_DIR, f'{c_id}{ext}')
            try:
                download_file(matched_url, cache_file)
                raw_path = cache_file
            except Exception as e:
                print(f'[Download Error] {c_id}: {e}')

        # Standardize and save
        used_official = process_character_images(raw_path, c_id, c_name)
        if used_official:
            success_count += 1
            print(f'  [OK] {c_name.ljust(15)} -> char__{c_id}__portrait.png (512x512) & icon (64x64) [Wiki Art]')
        else:
            fallback_count += 1
            print(f'  [*]  {c_name.ljust(15)} -> char__{c_id}__portrait.png (512x512) & icon (64x64) [Silhouette]')

    print('\n====================================================')
    print('--- IMAGE GENERATION SUMMARY ---')
    print('====================================================')
    print(f'Total Characters Processed: {len(characters)}')
    print(f'Official Wiki Artwork:      {success_count}')
    print(f'Standardized Fallback Art:  {fallback_count}')
    print(f'Total Output Files:         {len(characters) * 2} files in {OUTPUT_DIR}')
    print('====================================================\n')

if __name__ == '__main__':
    main()
