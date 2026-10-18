// Analysiert einen Instagram-Export mit dem Rezept-Kern und schreibt einen Bericht.
// Aufruf: node tools/export-analyse.js <saved_posts.json> [<saved_collections.json>] [--json ausgabe.json]
const fs = require("fs");
const path = require("path");
const K = require("../kern/rezept-kern.js");
const NW = require("../daten/naehrwerte.json");

const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const files = args.filter((a, i) => a !== "--json" && args[i - 1] !== "--json");
const data = files.map(f => JSON.parse(fs.readFileSync(f, "utf8")));
const posts = K.parseInstagramExport(data);

const rows = posts.map(p => {
  const res = K.analyse({ caption: p.caption, url: p.url, account: p.account, ownerUrl: p.ownerUrl });
  const like = K.recipeLikelihood(res, p.caption, p.url);
  const typ = !like.recipe ? "kein Rezept" : like.typ === "vollständig" ? "vollständig in der Caption" : "Rezept " + ({ blog: "auf dem Blog", bio: "im Bio-Link", kommentar: "im Kommentar", nachricht: "per Nachricht", kochbuch: "im Kochbuch", newsletter: "im Newsletter", video: "im Video", caption: "unvollständig in der Caption" })[like.wo];
  if (like.recipe) K.berechneNaehrwerte(res.recipe, NW);
  return { p, res, like, typ };
});
const count = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const recipes = rows.filter(r => r.like.recipe);
console.log(`Posts: ${rows.length} · davon Rezepte: ${recipes.length}`);
console.log("Typen:", count(rows, r => r.typ));
console.log("Rezepte je Sammlung:", count(recipes, r => r.p.collections.join(" + ") || "(keine Sammlung)"));
console.log("Mit Bio-Link des Creators:", recipes.filter(r => r.p.ownerUrl).length);
const ms = rows.map(r => r.res.ms).sort((a, b) => a - b);
console.log(`Analysezeit je Post: Median ${ms[Math.floor(ms.length / 2)].toFixed(1)} ms, max ${ms[ms.length - 1].toFixed(1)} ms`);
const cov = recipes.filter(r => r.res.recipe.nutrition && r.res.recipe.nutrition.reliable).length;
console.log(`Nährwerte verlässlich berechnet: ${cov} von ${recipes.length}`);
const unmatched = {};
recipes.forEach(r => (r.res.recipe.nutrition ? r.res.recipe.nutrition.coverage.unmatched : []).forEach(n => { const k = K.normName(n); unmatched[k] = (unmatched[k] || 0) + 1; }));
console.log("Häufigste Zutaten ohne Nährwert-Zuordnung:", Object.entries(unmatched).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => k + " ×" + v).join(", "));

if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(rows.map(r => ({
    url: r.p.url, account: r.p.account, collections: r.p.collections, ownerUrl: r.p.ownerUrl, typ: r.typ, wo: r.like.wo, hinweis: r.like.hinweis,
    score: r.like.score, title: r.res.recipe.title, completeness: r.res.completeness, next: r.res.next,
    recipe: r.like.recipe ? r.res.recipe : undefined, caption: r.p.caption
  })), null, 1));
  console.log("Details:", jsonOut);
}
