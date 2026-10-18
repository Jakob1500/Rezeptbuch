// Baut die Übersicht "Rezept-Ordner" aus daten/ig-analyse.json.
// Aufruf: node tools/build-ordner.js <ausgabedatei>
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const d = require(path.join(root, "daten/ig-analyse.json"));
const out = d.filter(x => x.recipe).map(x => { const r = x.recipe, n = r.nutrition; return {
  t: r.title || "Ohne Titel", to: r.titleOriginal && r.titleOriginal !== r.title ? r.titleOriginal : "", tg: !!r.titleGuessed, a: x.account,
  lb: (r.labels || []).filter(l => l.gruppe !== "Gang" || true).map(l => [l.gruppe, l.label]), hw: x.hinweis || "", svb: r.servingsBasis || "", svu: r.servingsUnit || "", u: x.url, typ: x.typ, c: x.collections, cat: r.category, diet: r.diet,
  diff: r.difficulty, time: r.timeTotal, est: r.timeEstimated, sv: r.servings, fo: (r.focus || []).map(f => [f.label, f.basis]),
  z: r.ingredients.map(i => i.name), nz: r.ingredients.length, ns: r.steps.length, mi: x.completeness.missing,
  nw: n && n.coverage.matched ? { kcal: n.values.kcal, p: n.values.protein, bs: n.values.fiber, ok: n.reliable, m: n.coverage.matched,
    t: n.coverage.matched + n.coverage.unmatched.length, ps: n.perServing } : null }; });
const stats = { posts: d.length, rezepte: out.length, andere: d.length - out.length, sammlungen: {} };
d.filter(x => x.recipe).forEach(x => { const k = x.collections.length ? x.collections.join(", ") : "ohne Sammlung"; stats.sammlungen[k] = (stats.sammlungen[k] || 0) + 1; });
const json = JSON.stringify({ stats, r: out }).replace(/</g, "\\u003c");
const html = fs.readFileSync(path.join(root, "labor/ordner.template.html"), "utf8").replace("/*DATEN*/", () => json);
fs.writeFileSync(process.argv[2], html);
console.log("geschrieben:", process.argv[2], (html.length / 1024).toFixed(0) + " KB");
