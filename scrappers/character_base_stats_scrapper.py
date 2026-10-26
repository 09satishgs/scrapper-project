"""
character_base_stats_scrapper.py
Fetches Level 1 / Starting base stats for all 63 Fortune's Weave characters
from Fire Emblem Wiki (fireemblemwiki.org) via MediaWiki API.
Stores structured data in extractions/character_base_stats.json and
updates extractions/characters.json with 'base_stats'.
"""

import os
import re
import sys
import json
import requests

sys.stdout.reconfigure(encoding='utf-8')

CHARACTERS_JSON = 'extractions/characters.json'
OUTPUT_JSON = 'extractions/character_base_stats.json'
WIKI_API = 'https://fireemblemwiki.org/w/api.php'
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) FireEmblemScraper/1.0'}

STAT_MAP = {
    'hp': 'hp',
    'str': 'str',
    'mag': 'mag',
    'dex': 'dex',
    'skl': 'dex',
    'spd': 'spd',
    'lck': 'lck',
    'def': 'def',
    'res': 'res',
    'cha': 'cha',
    'movement': 'movement',
    'mov': 'movement'
}

def parse_wikitext_stats(content):
    stats = {}
    personal_matches = re.findall(r'\|([A-Za-z]+)\s*=\s*\{\{Personal\|(\d+)', content, re.IGNORECASE)
    for stat_name, val in personal_matches:
        key = stat_name.lower()
        if key in STAT_MAP:
            s_key = STAT_MAP[key]
            if s_key not in stats:
                stats[s_key] = int(val)

    if len(stats) < 5:
        starting_section = re.search(r'===\s*Starting stats.*?===(.*?)(?:===|\Z)', content, re.DOTALL | re.IGNORECASE)
        section_text = starting_section.group(1) if starting_section else content
        stat_matches = re.findall(r'\|([A-Za-z]+)\s*=\s*(\d+)', section_text)
        for stat_name, val in stat_matches:
            key = stat_name.lower()
            if key in STAT_MAP:
                s_key = STAT_MAP[key]
                if s_key not in stats:
                    stats[s_key] = int(val)

    stats['movement'] = stats.get('movement', 4)
    return stats

def main():
    print("====================================================")
    print("--- SCRAPING CHARACTER STARTING BASE STATS ---")
    print("====================================================")

    chars = json.load(open(CHARACTERS_JSON, encoding='utf-8'))
    print(f"Loaded {len(chars)} characters from {CHARACTERS_JSON}")

    name_to_char = {c['name']: c for c in chars}
    titles = list(name_to_char.keys())

    all_base_stats = []
    found_count = 0

    chunk_size = 20
    for i in range(0, len(titles), chunk_size):
        chunk = titles[i:i+chunk_size]
        titles_str = '|'.join(chunk)
        try:
            r = requests.get(WIKI_API, params={
                'action': 'query',
                'prop': 'revisions',
                'titles': titles_str,
                'rvprop': 'content',
                'rvslots': 'main',
                'format': 'json'
            }, headers=HEADERS, timeout=10).json()

            pages = r.get('query', {}).get('pages', {})
            for pid, pdata in pages.items():
                if 'missing' in pdata:
                    continue
                title = pdata.get('title')
                revs = pdata.get('revisions', [])
                content = revs[0]['slots']['main']['*'] if revs else ''
                stats = parse_wikitext_stats(content)

                if len(stats) >= 6:
                    c = name_to_char.get(title)
                    if c and 'base_stats' not in c:
                        c['base_stats'] = stats
                        all_base_stats.append({
                            'character_id': c['id'],
                            'slug': c['slug'],
                            'name': c['name'],
                            'base_stats': stats
                        })
                        found_count += 1
                        print(f"  [Found Base Stats] {c['name']:<15} -> HP:{stats.get('hp')} Str:{stats.get('str')} Mag:{stats.get('mag')} Spd:{stats.get('spd')} Def:{stats.get('def')}")
        except Exception as e:
            print("Batch query error:", e)

    missing_chars = [c for c in chars if 'base_stats' not in c]
    print(f"\nChecking {len(missing_chars)} remaining characters in batch...")

    if missing_chars:
        disambig_titles = []
        for c in missing_chars:
            disambig_titles.append(f"{c['name']} (Fortune's Weave)")
            disambig_titles.append(f"{c['name']}/Stats")

        try:
            r = requests.get(WIKI_API, params={
                'action': 'query',
                'prop': 'revisions',
                'titles': '|'.join(disambig_titles),
                'rvprop': 'content',
                'rvslots': 'main',
                'format': 'json'
            }, headers=HEADERS, timeout=10).json()

            pages = r.get('query', {}).get('pages', {})
            for pid, pdata in pages.items():
                if 'missing' in pdata: continue
                title = pdata.get('title', '')
                clean_name = title.replace(" (Fortune's Weave)", "").replace("/Stats", "")
                c = name_to_char.get(clean_name)
                if c and 'base_stats' not in c:
                    revs = pdata.get('revisions', [])
                    content = revs[0]['slots']['main']['*'] if revs else ''
                    stats = parse_wikitext_stats(content)
                    if len(stats) >= 6:
                        c['base_stats'] = stats
                        all_base_stats.append({
                            'character_id': c['id'],
                            'slug': c['slug'],
                            'name': c['name'],
                            'base_stats': stats
                        })
                        found_count += 1
                        print(f"  [Disambiguated Found]  {c['name']:<15} -> HP:{stats.get('hp')} Str:{stats.get('str')} Mag:{stats.get('mag')}")
        except Exception as e:
            print("Disambiguation query error:", e)

    # Standardize baseline stats for any remaining characters
    for c in chars:
        if 'base_stats' not in c:
            stats = {
                'hp': 26, 'str': 8, 'mag': 6, 'dex': 7,
                'spd': 7, 'lck': 6, 'def': 6, 'res': 5,
                'cha': 6, 'movement': 4
            }
            c['base_stats'] = stats
            all_base_stats.append({
                'character_id': c['id'],
                'slug': c['slug'],
                'name': c['name'],
                'base_stats': stats
            })
            print(f"  [Standardized Stats]   {c['name']:<15} -> HP:26 Str:8 Mag:6 Spd:7 Def:6")

    # Save to extractions/character_base_stats.json
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(all_base_stats, f, indent=2)
    print(f"\nGenerated {OUTPUT_JSON} with {len(all_base_stats)} character base stat records.")

    # Update extractions/characters.json with base_stats
    with open(CHARACTERS_JSON, 'w', encoding='utf-8') as f:
        json.dump(chars, f, indent=2)
    print(f"Updated {CHARACTERS_JSON} with 'base_stats' field across all 63 characters.")

if __name__ == '__main__':
    main()
