# Unlimited Autobahn

A map of every German Autobahn section without a speed limit, plus a route
planner. It shows how much of a trip has no limit and how long the trip takes
at the speed you choose.

## Features

- **Map:** every motorway way tagged `maxspeed=none` in OpenStreetMap, in both
  directions. Sections that have a limit only at certain times or in wet
  weather (`maxspeed:conditional`) are shown in amber.
- **Route planner:** enter a place or address for start and destination (with
  suggestions as you type), or click them on the map. The unlimited parts of
  the route are highlighted.
- **Speed slider (130–300 km/h):** your speed on the unlimited sections.
- **Share slider (0–100 %):** how much of the unlimited distance you can
  actually drive at that speed. The rest is counted at the recommended
  130 km/h.
- **Results:** total distance, unlimited distance and share, your travel time
  compared with 130 km/h throughout, and a list of the unlimited stretches
  with their position along the route (e.g. `A 9 · km 403–457`).

## How it works

Everything runs in the browser. There's no server part beyond static files.

| Part | Source |
|---|---|
| Unlimited sections | OpenStreetMap via Overpass, pre-built into `data/strecken.json` |
| Map tiles | `tile.openstreetmap.org` |
| Routing | OSRM demo server (`router.project-osrm.org`) |
| Place search | Photon (`photon.komoot.io`) |
| Map library | Leaflet 1.9.4, vendored in `vendor/` (BSD-2-Clause) |

Each piece of the OSRM route is checked against the unlimited sections, which
are indexed in a 0.01° grid. A piece counts as unlimited if it lies within 30 m
of a section and runs within 40° of its direction, so the opposite
carriageway doesn't count.

The time for unlimited pieces is `share × distance / speed` plus
`(1 − share) × distance / 130 km/h`. Every other piece keeps the duration OSRM
gives it.

## Files

```
index.html          page
stil.css            styles (light and dark)
app.js              map, route matching and calculation
daten.py            rebuilds data/strecken.json from Overpass
data/strecken.json  unlimited sections (~5 MB, ~43,000 OSM ways)
vendor/             Leaflet
.htaccess           CSP, caching, compression
```

## Updating the data

The section data is not refreshed automatically. To rebuild it:

```bash
python -I daten.py
```

This takes about a minute and downloads about 35 MB from Overpass. The output
format is:

```json
{"stand": "YYYY-MM-DD", "wege": [["A 7", 0, [lon, lat, lon, lat, ...]], ...]}
```

## Hosting

The page is served at `/autobahn`, with no trailing slash, through a rewrite
rule in the webroot `.htaccess` plus `DirectorySlash Off` in this folder. For
that reason all asset paths are absolute (`/autobahn/...`).

The Content Security Policy allows exactly the three external hosts listed
above. `Referrer-Policy` is `strict-origin-when-cross-origin` instead of
`no-referrer`, because the OSM tile servers reject requests without a referer.

## Limitations

- OSM can lag behind new signs or roadworks. Always follow what is posted on
  the road.
- Travel times on the limited parts are OSRM estimates and don't include
  traffic.
- The route is whatever OSRM picks. The planner doesn't look for the route
  with the most unlimited distance.
- The public OSRM and Photon servers are meant for light use only.

## Attribution

Map data © OpenStreetMap contributors, licensed under the
[ODbL](https://opendatacommons.org/licenses/odbl/). Routing by
[OSRM](https://project-osrm.org/), search by
[Photon](https://photon.komoot.io/).
