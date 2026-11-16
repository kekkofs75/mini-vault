/* MiniVault — service worker
   - guscio dell'app e dati: prima la rete, poi la copia salvata (così le modifiche ai JSON si vedono subito)
   - immagini: prima la copia salvata, poi la rete
   - PDF: sempre dalla rete, non vengono salvati (possono essere molto pesanti) */
const VERSION = 'v1';
const CORE = `minivault-core-${VERSION}`;
const IMGS = `minivault-img-${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'manifest.json',
  'data/miniature.json',
  'data/colori.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CORE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![CORE, IMGS].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/pdf/')) return; // niente cache per i PDF
  if (req.headers.has('range')) return;

  if (url.pathname.includes('/img/')) {
    event.respondWith(
      caches.open(IMGS).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CORE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
  );
});
