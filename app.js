'use strict';

// Unlimited Autobahn: OSM-Abschnitte mit maxspeed=none zeichnen, Route per
// OSRM holen und jedes Routenstueck gegen die Abschnitte abgleichen.

const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
const PHOTON = 'https://photon.komoot.io/api/';
const KY = 110574;          // Meter pro Breitengrad
const TREFFER_M = 30;       // max. Abstand Routenstueck <-> Abschnitt
const RICHTUNG_COS = 0.77;  // ~40 Grad, damit die Gegenfahrbahn nicht zaehlt
const RICHT = 130;          // Richtgeschwindigkeit

const $ = (id) => document.getElementById(id);
const karte = L.map('karte', { preferCanvas: true }).setView([51.1, 10.4], 6);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap',
}).addTo(karte);

// --- Abschnitte laden und in ein Raster legen (Zelle = 0.01 Grad) ---------
let seg = null;     // x1,y1,x2,y2 je Segment, in Grad
let segWeg = null;  // Index des OSM-Wegs je Segment
let wege = [];
const raster = new Map();
const zelle = (x, y) => Math.floor(x * 100) * 100000 + Math.floor(y * 100);

const geladen = fetch('/autobahn/data/strecken.json').then((r) => r.json()).then((d) => {
  wege = d.wege;
  const s = [], sw = [], linienFrei = [], linienBedingt = [];
  wege.forEach(([, bedingt, p], w) => {
    const ll = [];
    for (let i = 0; i < p.length; i += 2) ll.push([p[i + 1], p[i]]);
    (bedingt ? linienBedingt : linienFrei).push(ll);
    for (let i = 0; i + 3 < p.length; i += 2) {
      const n = sw.length;
      s.push(p[i], p[i + 1], p[i + 2], p[i + 3]);
      sw.push(w);
      for (let cx = Math.floor(Math.min(p[i], p[i + 2]) * 100); cx <= Math.floor(Math.max(p[i], p[i + 2]) * 100); cx++) {
        for (let cy = Math.floor(Math.min(p[i + 1], p[i + 3]) * 100); cy <= Math.floor(Math.max(p[i + 1], p[i + 3]) * 100); cy++) {
          const k = cx * 100000 + cy;
          (raster.get(k) || raster.set(k, []).get(k)).push(n);
        }
      }
    }
  });
  seg = Float64Array.from(s);
  segWeg = Uint32Array.from(sw);
  L.polyline(linienFrei, { color: '#107c10', weight: 3, opacity: 0.85, interactive: false }).addTo(karte);
  L.polyline(linienBedingt, { color: '#e3a400', weight: 3, opacity: 0.9, interactive: false }).addTo(karte);
  $('stand').textContent = `${wege.length.toLocaleString('en')} OSM sections, data as of ${d.stand}.`;
}).catch(() => { $('stand').textContent = 'Could not load the sections.'; });

// Liegt das Routenstueck (Mitte mx,my, Richtung rx,ry in m) auf einem Abschnitt?
// Gibt den Weg-Index zurueck oder -1.
function abschnitt(mx, my, rx, ry) {
  const kx = Math.cos(my * Math.PI / 180) * 111320;
  const rl = Math.hypot(rx, ry) || 1;
  let best = -1, bestD = TREFFER_M;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (const n of raster.get(zelle(mx, my) + dx * 100000 + dy) || []) {
        const i = n * 4;
        const ax = (seg[i] - mx) * kx, ay = (seg[i + 1] - my) * KY;
        const vx = (seg[i + 2] - seg[i]) * kx, vy = (seg[i + 3] - seg[i + 1]) * KY;
        const l = vx * vx + vy * vy;
        if (!l || (vx * rx + vy * ry) / (Math.sqrt(l) * rl) < RICHTUNG_COS) continue;
        const t = Math.max(0, Math.min(1, -(ax * vx + ay * vy) / l));
        const d = Math.hypot(ax + t * vx, ay + t * vy);
        if (d < bestD) { bestD = d; best = segWeg[n]; }
      }
    }
  }
  return best;
}

// --- Orte suchen -------------------------------------------------------------
const orte = new Map(); // Vorschlagstext -> [lat, lon]

const ortName = (p) => [p.name, p.street && `${p.street} ${p.housenumber || ''}`.trim(), p.city, p.country]
  .filter((x, i, a) => x && a.indexOf(x) === i).join(', ');

async function suchen(q, limit) {
  const r = await fetch(`${PHOTON}?q=${encodeURIComponent(q)}&limit=${limit}&lat=51&lon=10`);
  const d = await r.json();
  return d.features.map((f) => {
    const name = ortName(f.properties);
    orte.set(name, [f.geometry.coordinates[1], f.geometry.coordinates[0]]);
    return name;
  });
}

let tippTimer;
for (const feld of [$('von'), $('nach')]) {
  feld.addEventListener('input', () => {
    clearTimeout(tippTimer);
    const q = feld.value.trim();
    if (q.length < 3 || orte.has(q)) return;
    tippTimer = setTimeout(async () => {
      try {
        const namen = await suchen(q, 6);
        $('vorschlaege').replaceChildren(...namen.map((n) => new Option(n)));
      } catch { /* Vorschlaege sind optional */ }
    }, 300);
  });
}

async function koordinaten(text) {
  const m = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) return [+m[1], +m[2]];
  if (orte.has(text)) return orte.get(text);
  const [erster] = await suchen(text, 1);
  if (!erster) throw new Error(`Nothing found for "${text}".`);
  return orte.get(erster);
}

// Klick in die Karte fuellt "From", danach "To".
karte.on('click', (e) => {
  const ziel = $('von').value && !$('nach').value ? $('nach') : $('von');
  if (ziel === $('von') && $('von').value && $('nach').value) $('nach').value = '';
  ziel.value = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
});

// --- Route berechnen ---------------------------------------------------------
let ebene = null;
let analyse = null; // { gesamt, frei, restZeit, liste }

$('formular').addEventListener('submit', async (e) => {
  e.preventDefault();
  const knopf = e.submitter;
  knopf.disabled = true;
  $('status').textContent = 'Calculating…';
  try {
    await geladen;
    if (!seg) throw new Error('Sections are not loaded.');
    const [a, b] = await Promise.all([koordinaten($('von').value), koordinaten($('nach').value)]);
    const r = await fetch(`${OSRM}${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson&annotations=distance,duration`);
    const d = await r.json();
    if (d.code !== 'Ok') throw new Error('No route found.');
    auswerten(d.routes[0]);
    $('status').textContent = '';
  } catch (err) {
    $('status').textContent = err.message || 'Something went wrong.';
  } finally {
    knopf.disabled = false;
  }
});

function auswerten(route) {
  const c = route.geometry.coordinates;
  const { distance: dist, duration: dauer } = route.legs[0].annotation;
  let frei = 0, restZeit = 0;
  const teile = [];          // Linienstuecke fuer die Karte
  const liste = [];          // zusammenhaengende Strecken fuer die Liste
  let lauf = null, luecke = 0, bisher = 0;

  for (let i = 0; i < dist.length; bisher += dist[i++]) {
    const [x1, y1] = c[i], [x2, y2] = c[i + 1];
    const kx = Math.cos(y1 * Math.PI / 180) * 111320;
    const w = abschnitt((x1 + x2) / 2, (y1 + y2) / 2, (x2 - x1) * kx, (y2 - y1) * KY);
    if (w < 0) {
      restZeit += dauer[i];
      luecke += dist[i];
      if (lauf && luecke > 1000) lauf = null; // kurze Unterbrechungen (Bruecken, Baustellen) zusammenfassen
      continue;
    }
    frei += dist[i];
    if (!lauf) {
      lauf = { ref: wege[w][0], m: 0, ab: bisher };
      liste.push(lauf);
      teile.push([]);
    } else if (luecke > 0) {
      teile.push([]);
    }
    luecke = 0;
    lauf.m += dist[i];
    lauf.bis = bisher + dist[i];
    const t = teile[teile.length - 1];
    if (!t.length) t.push([y1, x1]);
    t.push([y2, x2]);
    if (!lauf.ref) lauf.ref = wege[w][0];
  }

  if (ebene) ebene.remove();
  const linie = c.map(([x, y]) => [y, x]);
  ebene = L.layerGroup([
    L.polyline(linie, { color: '#0f6cbd', weight: 6, opacity: 0.85 }),
    L.polyline(teile, { color: '#0b5a0b', weight: 4, opacity: 1 }),
    L.circleMarker(linie[0], { radius: 7, color: '#0f6cbd', fillColor: '#fff', fillOpacity: 1, weight: 3 }),
    L.circleMarker(linie[linie.length - 1], { radius: 7, color: '#fff', fillColor: '#0f6cbd', fillOpacity: 1, weight: 3 }),
  ]).addTo(karte);
  karte.fitBounds(linie, { padding: [30, 30] });

  analyse = { gesamt: route.distance, frei, restZeit, liste: liste.filter((l) => l.m >= 1000) };
  zeigen();
}

// --- Anzeige -----------------------------------------------------------------
const km = (m) => `${(m / 1000).toLocaleString('en', { maximumFractionDigits: m < 10000 ? 1 : 0 })} km`;
const zeit = (s) => {
  const min = Math.round(s / 60);
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
};

function zeigen() {
  const v = +$('v').value, anteil = +$('a').value / 100;
  $('v-wert').textContent = `${v} km/h`;
  $('a-wert').textContent = `${$('a').value} %`;
  if (!analyse) return;

  const { gesamt, frei, restZeit, liste } = analyse;
  const bei = (geschw) => frei * anteil / (geschw / 3.6) + frei * (1 - anteil) / (RICHT / 3.6);
  const deine = restZeit + bei(v);
  const normal = restZeit + bei(RICHT);

  $('ergebnis').hidden = false;
  $('r-strecke').textContent = km(gesamt);
  $('r-frei').textContent = `${km(frei)} · ${Math.round(frei / gesamt * 100)} %`;
  $('r-zeit').textContent = zeit(deine);
  $('r-130').textContent = zeit(normal);
  const gespart = Math.round((normal - deine) / 60);
  $('r-gewinn').textContent = frei
    ? `${gespart} min saved by driving ${v} km/h on ${Math.round(anteil * 100)} % of the unlimited ${km(frei)}.`
    : 'This route has no unlimited sections.';
  $('r-liste').replaceChildren(...liste.map((l) => {
    const li = document.createElement('li');
    li.append(Object.assign(document.createElement('span'), {
      textContent: `${l.ref || 'Autobahn'} · km ${Math.round(l.ab / 1000)}–${Math.round(l.bis / 1000)}`,
    }),
      Object.assign(document.createElement('span'), { textContent: km(l.m) }));
    return li;
  }));
}

$('v').addEventListener('input', zeigen);
$('a').addEventListener('input', zeigen);
zeigen();
