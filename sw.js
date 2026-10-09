/* Võrguühenduseta töö: rakendus ja andmed salvestatakse telefoni,
   vaadatud kaardiruudud puhverdatakse (kuni MAX_TILES tükki). */
const VERSION = 'kuusikud-2026-10-09b';
const APP = [
  './', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest',
  'vendor/leaflet.js', 'vendor/leaflet.css',
  'data/kuusikud.json',
  'icons/icon-192.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];
const TILES = 'kuusikud-tiles';
const MAX_TILES = 3000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== VERSION && k !== TILES).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

async function trimTiles(){
  const c = await caches.open(TILES);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // kaardiruudud: puhvrist, kui olemas; muidu võrgust ja puhvrisse
  if (url.hostname === 'tiles.maaamet.ee'){
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      try{
        const r = await fetch(e.request);
        if (r.ok){ c.put(e.request, r.clone()); trimTiles(); }
        return r;
      }catch(err){ return new Response('', {status:504}); }
    }));
    return;
  }

  // aadressiotsing: alati võrgust
  if (url.origin !== location.origin) return;

  // rakendus ja andmed: puhvrist, taustal uuendus
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(e.request, {ignoreSearch:true});
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || new Response('Võrguühendus puudub', {status:503});
  }));
});
