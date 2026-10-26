"""
Audit and verification script for generated character images in assets/images/.
Verifies that all 63 characters in the database have standardized 512x512 portraits
and 64x64 icons with valid RGBA transparency.
"""

import os
import json
from PIL import Image

CHARACTERS_JSON = 'extractions/characters.json'
IMAGES_DIR = 'assets/images'

with open(CHARACTERS_JSON, 'r', encoding='utf-8') as f:
    characters = json.load(f)

print('====================================================')
print('--- CHARACTER ASSETS VERIFICATION AUDIT ---')
print('====================================================')
print(f'Total Target Characters: {len(characters)}')

missing_portraits = []
missing_icons = []
invalid_dims = []
invalid_modes = []

for c in characters:
    c_id = c['slug']
    c_name = c['name']

    portrait_file = os.path.join(IMAGES_DIR, f'char__{c_id}__portrait.png')
    icon_file = os.path.join(IMAGES_DIR, f'char__{c_id}__icon.png')

    # 1. Verify Portrait
    if not os.path.exists(portrait_file):
        missing_portraits.append(c_id)
    else:
        with Image.open(portrait_file) as img:
            if img.size != (512, 512):
                invalid_dims.append((portrait_file, img.size, (512, 512)))
            if img.mode != 'RGBA':
                invalid_modes.append((portrait_file, img.mode))

    # 2. Verify Icon
    if not os.path.exists(icon_file):
        missing_icons.append(c_id)
    else:
        with Image.open(icon_file) as img:
            if img.size != (64, 64):
                invalid_dims.append((icon_file, img.size, (64, 64)))
            if img.mode != 'RGBA':
                invalid_modes.append((icon_file, img.mode))

print('\n--- AUDIT RESULTS ---')
print(f'Total Expected Files: {len(characters) * 2}')
actual_files = [f for f in os.listdir(IMAGES_DIR) if f.startswith('char__') and f.endswith('.png')]
print(f'Actual Assets Found:  {len(actual_files)}')
print(f'Missing Portraits:    {len(missing_portraits)}')
print(f'Missing Icons:        {len(missing_icons)}')
print(f'Dimension Errors:     {len(invalid_dims)}')
print(f'Color Mode Errors:    {len(invalid_modes)}')

assert len(missing_portraits) == 0, f'Missing portraits: {missing_portraits}'
assert len(missing_icons) == 0, f'Missing icons: {missing_icons}'
assert len(invalid_dims) == 0, f'Invalid dimensions: {invalid_dims}'
assert len(invalid_modes) == 0, f'Invalid color modes: {invalid_modes}'

print('\n--- SAMPLE INSPECTIONS ---')
for sample_id in ['cai', 'theodora', 'esmeralda', 'hong_hua', 'dietrich', 'seteth']:
    p_path = os.path.join(IMAGES_DIR, f'char__{sample_id}__portrait.png')
    i_path = os.path.join(IMAGES_DIR, f'char__{sample_id}__icon.png')
    with Image.open(p_path) as p, Image.open(i_path) as i:
        print(f'  {sample_id}:')
        print(f'    Portrait: {p.size}, mode={p.mode}, {os.path.getsize(p_path) // 1024} KB')
        print(f'    Icon:     {i.size}, mode={i.mode}, {os.path.getsize(i_path) // 1024} KB')

print('\n====================================================')
print('ALL 126 CHARACTER IMAGE ASSETS 100% VALID')
print('====================================================')
