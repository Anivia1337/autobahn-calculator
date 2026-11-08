# Holt alle Autobahn-Abschnitte ohne Tempolimit aus OSM (Overpass) und schreibt
# data/strecken.json: {"stand": "YYYY-MM-DD", "wege": [[ref, bedingt, [lon,lat,...]], ...]}
# Aufruf: python -I daten.py   (dauert ~1 min, ~35 MB Download)
import json, pathlib, urllib.parse, urllib.request

ABFRAGE = ('[out:json][timeout:300];area["ISO3166-1"="DE"][admin_level=2]->.de;'
           'way(area.de)["highway"="motorway"]["maxspeed"~"^(none|DE:motorway)$"];out tags geom qt;')

anfrage = urllib.request.Request('https://overpass-api.de/api/interpreter',
                                 urllib.parse.urlencode({'data': ABFRAGE}).encode(),
                                 headers={'User-Agent': 'unlimited-autobahn/1.0'})
d = json.load(urllib.request.urlopen(anfrage, timeout=400))

wege = []
for e in d['elements']:
    t = e.get('tags', {})
    punkte = [round(v, 5) for p in e['geometry'] for v in (p['lon'], p['lat'])]
    wege.append([t.get('ref', ''), 1 if 'maxspeed:conditional' in t else 0, punkte])

ziel = pathlib.Path(__file__).with_name('data') / 'strecken.json'
ziel.write_text(json.dumps({'stand': d['osm3s']['timestamp_osm_base'][:10], 'wege': wege}, separators=(',', ':')))
print(len(wege), 'Wege ->', ziel)
