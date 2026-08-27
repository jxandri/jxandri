/**
 * sw.js — offline support.
 *
 * The whole app is a fixed list of files, so the shell is pre-cached on install
 * and served cache-first. Once a student has opened it on the school wifi it
 * keeps working on the bus. Bump CACHE when you ship a change.
 */

const CACHE = 'gradient-peaks-v22';

const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './js/main.js',
  './js/i18n.js',
  './js/surfaces.js',
  './js/walker.js',
  './js/projection.js',
  './js/gridlines.js',
  './js/intrinsic.js',
  './js/gamepad.js',
  './js/elias.js',
  './js/elias-fourier.js',
  './js/borders.js',
  './js/borders-data.js',
  './js/borders-photos.js',
  './js/worldmap.js',
  './js/worldmap-data.js',
  './js/compass.js',
  './lab.html',
  './css/lab.css',
  './js/mathexpr.js',
  './js/field.js',
  './js/terrain.js',
  './js/decor.js',
  './js/analysis.js',
  './js/player.js',
  './vendor/three.module.js',
  './vendor/three.core.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      // Cache anything else we end up needing, but never a failed response.
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html'))),
  );
});
