// Offline-Speicher der App (nur eigene Dateien, keine fremden Abrufe)
const CACHE = "rezeptbuch-0.7.4-mvu35x5s";
const DATEN = "rezeptbuch-daten-9ccee86d57";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== DATEN).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return;
  // Die App selbst: mit Internet immer die neueste Fassung (unverändert = nur kurze Rückfrage, kein neuer Download), ohne Internet die gespeicherte
  if (e.request.mode === "navigate" || /\/(index\.html)?$/.test(u.pathname)) {
    e.respondWith(fetch(e.request, { cache: "no-cache" }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put("index.html", copy)); }
      return res;
    }).catch(() => caches.match("index.html").then(hit => hit || caches.match("./"))));
    return;
  }
  const gross = /bls-suche\.json$/.test(u.pathname) || /\/bergamot\//.test(u.pathname);
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok && gross) { const copy = res.clone(); caches.open(DATEN).then(c => c.put(e.request, copy)); }
    return res;
  })));
});
