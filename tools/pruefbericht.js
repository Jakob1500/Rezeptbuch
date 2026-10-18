#!/usr/bin/env node
/**
 * Prüfbericht für einen Instagram-Export: zeigt, wie die App jedes Rezept versteht,
 * und listet Auffälligkeiten (Titel, Schritte, Sprache, Nährwerte) zum Nachbessern.
 *
 * Aufruf: node tools/pruefbericht.js <export.zip | entpackter Ordner> [bericht.md]
 * Die Exportdaten bleiben lokal; der Bericht enthält nur Titel, Zutaten- und Schrittzahlen
 * sowie kurze Ausschnitte zur Fehlersuche (nicht ins öffentliche Projekt hochladen).
 */
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");
const K = require("../kern/rezept-kern.js");
const NW = require("../daten/naehrwerte.json");

const src = process.argv[2], out = process.argv[3];
if (!src) { console.error("Aufruf: node tools/pruefbericht.js <export.zip|ordner> [bericht.md]"); process.exit(1); }

let dir = src, tmp = null;
if (/\.zip$/i.test(src)) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rb-export-"));
  cp.execFileSync("unzip", ["-q", "-o", src, "-d", tmp]);
  dir = tmp;
}
const files = cp.execFileSync("find", [dir, "-name", "*.json"]).toString().trim().split("\n").filter(Boolean);
const jsons = files.map(f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return null; } }).filter(Boolean);
const posts = K.parseInstagramExport(jsons);

const rows = [], unmatched = {}, issues = { titel: [], schritte: [], sprache: [], unvollstaendig: [] };
let reliable = 0, withIng = 0;
posts.forEach(p => {
  const res = K.analyse({ caption: p.caption, url: p.url, account: p.account });
  const like = K.recipeLikelihood(res, p.caption, p.url);
  if (!like.recipe) return;
  const r = res.recipe;
  if (r.ingredients.length >= 3) {
    withIng++;
    K.berechneNaehrwerte(r, NW, null, {});
    if (r.nutrition && r.nutrition.reliable) reliable++;
    ((r.nutrition && r.nutrition.coverage.unmatched) || []).forEach(u => { unmatched[u] = (unmatched[u] || 0) + 1; });
  }
  const lang = K.detectLang(r);
  const t = r.title || "";
  if (!t || t.split(/\s+/).length > 7 || /^[a-zäöü]/.test(t) || /\b(ich|ist|sind|kannst|you|is|are)\b/i.test(t) || r.titleGuessed) issues.titel.push(`${t || "(ohne Titel)"} – ${p.url}`);
  r.steps.forEach(s => {
    if (/^## /.test(s)) return;
    const sl = K.langOfText(s);
    if (/^[a-zäöü(]/.test(s) || /\b(ich|mein\w*|wir|I|my|we)\b/.test(s) || s.length < 12 || /\|/.test(s)) issues.schritte.push(`${t}: „${s.slice(0, 100)}“`);
    else if (sl !== "?" && sl !== lang) issues.sprache.push(`${t}: [${sl}] „${s.slice(0, 80)}“`);
  });
  if (!r.steps.length || r.ingredients.length < 2) issues.unvollstaendig.push(`${t || "(ohne Titel)"} – ${(r.elsewhere && r.elsewhere.wo) || like.wo || "?"} – ${p.url}`);
  rows.push({ t, cat: r.category, lang, ing: r.ingredients.length, st: r.steps.filter(s => !/^## /.test(s)).length, kcal: r.nutrition && r.nutrition.reliable && r.nutrition.perServing ? r.nutrition.values.kcal : "", url: p.url });
});

const L = [];
L.push(`# Prüfbericht Rezeptbuch`, ``, `Kern ${K.VERSION} · ${new Date().toISOString().slice(0, 10)} · ${posts.length} Beiträge, ${rows.length} als Rezept erkannt`, ``);
L.push(`Nährwerte verlässlich: ${reliable} von ${withIng} Rezepten mit Zutaten (${withIng ? Math.round(reliable / withIng * 100) : 0} %)`, ``);
L.push(`## Rezepte`, ``, `| Titel | Kategorie | Sprache | Zutaten | Schritte | kcal/Portion |`, `|---|---|---|---|---|---|`);
rows.forEach(x => L.push(`| ${x.t.replace(/\|/g, "/") || "(ohne Titel)"} | ${x.cat} | ${x.lang} | ${x.ing} | ${x.st} | ${x.kcal} |`));
const sec = (h, list) => { L.push(``, `## ${h} (${list.length})`, ``); list.slice(0, 200).forEach(x => L.push(`- ${x}`)); };
sec("Titel prüfen", issues.titel);
sec("Schritte prüfen", issues.schritte);
sec("Schritte in anderer Sprache", issues.sprache);
sec("Unvollständig (Rezept steht woanders)", issues.unvollstaendig);
sec("Zutaten ohne Nährwert-Zuordnung", Object.entries(unmatched).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n}×)`));

const text = L.join("\n") + "\n";
if (out) { fs.writeFileSync(out, text); console.log(`Bericht: ${out}`); } else process.stdout.write(text);
if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); // entpackte Exportdaten sofort löschen
