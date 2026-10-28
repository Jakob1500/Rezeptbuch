// Baut die App: eine HTML-Datei mit eingebettetem Kern und Nährwerttabelle.
//   docs/            -> GitHub Pages (vollständiges HTML, Manifest, Service Worker, Symbole, Suchliste)
//   <ausgabe>.html   -> Vorschau als Artefakt (ohne <html>-Gerüst)
// Aufruf: node tools/build-app.js [vorschau.html]
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const tpl = fs.readFileSync(path.join(root, "app/index.template.html"), "utf8");
const kernQuelle = fs.readFileSync(path.join(root, "kern/rezept-kern.js"), "utf8");
const kern = kernSchlank(kernQuelle);
// Schlanker Kern für die App: Kommentare und Einrückung weg (Quelle bleibt lesbar). Danach Gegenprobe:
// Der schlanke Kern muss für alle echten Rezepte genau dasselbe Ergebnis liefern, sonst wird die Quelle genommen.
function kernSchlank(src) {
  let ts; try { ts = require("typescript"); } catch (e) { try { ts = require(require("child_process").execSync("npm root -g").toString().trim() + "/typescript"); } catch (e2) { console.log("Hinweis: typescript fehlt – Kern ungekürzt"); return src; } }
  const out = ts.transpileModule(src, { compilerOptions: { allowJs: true, removeComments: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.None } }).outputText
    .replace(/^"use strict";\n/, "").split("\n").map(l => l.replace(/^\s+/, "")).filter(Boolean).join("\n") + "\n";
  const tmp = path.join(require("os").tmpdir(), "kern-schlank-" + process.pid + ".js"); fs.writeFileSync(tmp, out);
  const A = require(path.join(root, "kern/rezept-kern.js")), B = require(tmp);
  const faelle = [];
  ["daten/ig-analyse.json", "daten/ig-analyse2.json"].forEach(f => { const p = path.join(root, f); if (fs.existsSync(p)) require(p).filter(x => x.recipe).forEach(x => faelle.push(x)); });
  faelle.push({ caption: "Linsensuppe\nZutaten\n200 g Linsen\n1 Zwiebel\nZubereitung\nZwiebel würfeln und anbraten.\nLinsen dazugeben und 20 Minuten kochen." });
  const sig = (K, x) => { const r = K.analyse({ caption: x.caption, url: x.url || "", account: x.account || "" }).recipe; delete r.analysedAt; delete r.parsedAt; delete r.createdAt; return JSON.stringify(r); };
  const abw = faelle.filter(x => sig(A, x) !== sig(B, x)).length;
  fs.unlinkSync(tmp);
  if (abw || A.VERSION !== B.VERSION) { console.log("Achtung: schlanker Kern weicht bei " + abw + " Rezepten ab – Quelle wird genommen"); return src; }
  console.log(`Kern: ${Math.round(src.length / 1024)} KB → ${Math.round(out.length / 1024)} KB (Gegenprobe ${faelle.length} Rezepte gleich)`);
  return out;
}
if (/<\/script/i.test(kern)) throw new Error("Kern enthält </script>");
const nw = fs.readFileSync(path.join(root, "daten/naehrwerte.json"), "utf8");
const zentral = fs.readFileSync(path.join(root, "daten/gelernt-zentral.json"), "utf8");
const body = tpl.replace("/*KERN*/", () => kern).replace("/*NAEHRWERTE*/", () => nw).replace("/*ZENTRAL*/", () => zentral);

const docs = path.join(root, "docs");
fs.mkdirSync(docs, { recursive: true });
const page = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
${body.slice(0, body.indexOf("<style>"))}${body.slice(body.indexOf("<style>"), body.indexOf("</style>") + 8)}
</head>
<body>
${body.slice(body.indexOf("</style>") + 8)}
</body>
</html>
`;
fs.writeFileSync(path.join(docs, "index.html"), page);
fs.copyFileSync(path.join(root, "daten/bls-suche.json"), path.join(docs, "bls-suche.json"));
fs.writeFileSync(path.join(docs, "manifest.webmanifest"), JSON.stringify({
  name: "Kombüse – Rezepte aus Instagram", short_name: "Kombüse", lang: "de", start_url: "./", scope: "./", display: "standalone",
  background_color: "#F4F5F3", theme_color: "#F4F5F3",
  icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }, { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml" }]
}, null, 1));
const ver = require(path.join(root, "kern/rezept-kern.js")).VERSION + "-" + Date.now().toString(36);
// Große Daten (Übersetzer, BLS-Suche) in einem eigenen Speicher, der nur wechselt, wenn sich diese Dateien ändern (App-Vergleich C4)
const datenHash = require("crypto").createHash("sha1");
["bls-suche.json", "bergamot/registry.json"].forEach(f => { const pf = path.join(docs, f); if (fs.existsSync(pf)) datenHash.update(fs.readFileSync(pf)); });
const daten = datenHash.digest("hex").slice(0, 10);
fs.writeFileSync(path.join(docs, "sw.js"), `// Offline-Speicher der App (nur eigene Dateien, keine fremden Abrufe)
const CACHE = "rezeptbuch-${ver}";
const DATEN = "rezeptbuch-daten-${daten}";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== DATEN).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return;
  // Die App selbst: mit Internet immer die neueste Fassung (unverändert = nur kurze Rückfrage, kein neuer Download), ohne Internet die gespeicherte
  if (e.request.mode === "navigate" || /\\/(index\\.html)?$/.test(u.pathname)) {
    e.respondWith(fetch(e.request, { cache: "no-cache" }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put("index.html", copy)); }
      return res;
    }).catch(() => caches.match("index.html").then(hit => hit || caches.match("./"))));
    return;
  }
  const gross = /bls-suche\\.json$/.test(u.pathname) || /\\/bergamot\\//.test(u.pathname);
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok && gross) { const copy = res.clone(); caches.open(DATEN).then(c => c.put(e.request, copy)); }
    return res;
  })));
});
`);
// Gegenprobe: ein Tippfehler im Service Worker legt das Offline-Speichern still, ohne dass die App es merkt
try { new Function(fs.readFileSync(path.join(docs, "sw.js"), "utf8")); } catch (e) { console.error("sw.js fehlerhaft: " + e.message); process.exit(1); }
fs.writeFileSync(path.join(docs, ".nojekyll"), "");
const prev = process.argv[2];
if (prev) fs.writeFileSync(prev, body);
console.log("docs/index.html", (page.length / 1024).toFixed(0) + " KB" + (prev ? " · Vorschau: " + prev : ""));
