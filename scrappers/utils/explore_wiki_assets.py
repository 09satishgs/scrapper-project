import urllib.request
import json
import urllib.parse

def search_cats(prefix):
    url = f'https://fireemblemwiki.org/w/api.php?action=query&list=allcategories&acprefix={urllib.parse.quote(prefix)}&aclimit=20&format=json'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        print(f"Categories for '{prefix}':", [c['*'] for c in data.get('query', {}).get('allcategories', [])])

def search_images(prefix):
    url = f'https://fireemblemwiki.org/w/api.php?action=query&list=allimages&aiprefix={urllib.parse.quote(prefix)}&ailimit=20&format=json'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        print(f"Images for '{prefix}':", [img['name'] for img in data.get('query', {}).get('allimages', [])])

search_cats('Crest')
search_cats('Fortune')
search_cats('Three Houses')
search_images('FE16')
search_images('FE18')
search_images('FEFW')
search_images('Crest')
search_images('Icon')
